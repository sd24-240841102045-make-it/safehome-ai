import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { DatabaseService } from '../services/db.js';
import { AuthService } from '../services/supabase.js';
import { config } from '../config.js';
import { logger } from '../services/logger.js';
import { mapClassToCategory } from '../shared/schemas.js';
import { saveSnapshot } from '../services/snapshots.js';
import { logSecurityEvent } from '../services/auditLog.js';
import { evaluateDetectionRules } from '../services/ruleEngine.js';

interface PhoneSession {
  ws: WebSocket;
  deviceId: string;
  userId: string;
  homeId: string | null;
  deviceName: string;
  sessionId: string;
  startedAt: number;
  frameCount: number;
  dropCount: number;
  lastHeartbeat: number;
}

interface DashboardSession {
  ws: WebSocket;
  userId: string;
}

export class StreamWebSocketHandler {
  private wss: WebSocketServer;
  private db: DatabaseService;
  private authService: AuthService;

  // Active sessions mapped by userId
  private phonesByUser = new Map<string, Map<string, PhoneSession>>(); // userId -> (deviceId -> PhoneSession)
  private dashboardsByUser = new Map<string, Set<DashboardSession>>(); // userId -> Set<DashboardSession>
  private lastEventCooldownMap = new Map<string, number>(); // `${userId}_${category}` -> timestamp

  constructor(wss: WebSocketServer, db: DatabaseService, authService: AuthService) {
    this.wss = wss;
    this.db = db;
    this.authService = authService;
    this.init();
  }

  private init() {
    this.wss.on('connection', (ws: WebSocket) => {
      let clientRole: 'phone' | 'dashboard' | 'unknown' = 'unknown';
      let currentDeviceId: string | null = null;
      let currentUserId: string | null = null;
      let currentSessionId: string | null = null;
      // Per-connection backpressure: drop frame if previous is still being processed
      let frameInFlight = false;

      logger.info('[WS] New incoming WebSocket connection');

      ws.on('message', async (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString());

          // 1. Phone Camera Registration
          if (msg.type === 'register_phone') {
            const authResult = await this.authenticatePhone(msg);
            if (!authResult) {
              ws.send(JSON.stringify({
                type: 'error',
                code: 'AUTH_FAILED',
                message: 'Phone authentication failed. Valid token required.'
              }));
              return;
            }

            clientRole = 'phone';
            currentDeviceId = authResult.deviceId;
            currentUserId = authResult.userId;
            currentSessionId = crypto.randomUUID();

            if (!this.phonesByUser.has(currentUserId)) {
              this.phonesByUser.set(currentUserId, new Map());
            }

            const phoneSession: PhoneSession = {
              ws,
              deviceId: currentDeviceId,
              userId: currentUserId,
              homeId: authResult.homeId,
              deviceName: msg.device_name || 'Android Phone Sensor',
              sessionId: currentSessionId,
              startedAt: Date.now(),
              frameCount: 0,
              dropCount: 0,
              lastHeartbeat: Date.now()
            };

            this.phonesByUser.get(currentUserId)!.set(currentDeviceId, phoneSession);

            logger.info(`[WS] Phone paired & connected: ${currentDeviceId} for user ${currentUserId}`);

            // Update database status and monitoring sessions
            const now = new Date().toISOString();
            await this.db.run(
              `UPDATE devices SET status = 'online', last_seen = ?, last_heartbeat_at = ?, network_online = 1 WHERE id = ?`,
              [now, now, currentDeviceId]
            );

            // Upsert device_status record
            await this.db.run(
              `INSERT INTO device_status (device_id, user_id, home_id, status, last_heartbeat_at, last_frame_at, updated_at)
               VALUES (?, ?, ?, 'online', ?, ?, ?)
               ON CONFLICT(device_id) DO UPDATE SET
                 status = 'online',
                 last_heartbeat_at = excluded.last_heartbeat_at,
                 last_frame_at = excluded.last_frame_at,
                 updated_at = excluded.updated_at`,
              [currentDeviceId, currentUserId, authResult.homeId || null, now, now, now]
            );

            // Insert new monitoring session
            await this.db.run(
              `INSERT INTO monitoring_sessions (id, user_id, home_id, device_id, started_at)
               VALUES (?, ?, ?, ?, ?)`,
              [currentSessionId, currentUserId, authResult.homeId || null, currentDeviceId, now]
            );

            // Log security audit event
            await logSecurityEvent(this.db, {
              userId: currentUserId,
              homeId: authResult.homeId,
              eventType: 'monitoring_started',
              resourceType: 'device',
              resourceId: currentDeviceId,
              details: { device_name: phoneSession.deviceName, session_id: currentSessionId }
            });

            ws.send(JSON.stringify({
              type: 'registered',
              device_id: currentDeviceId,
              status: 'online',
              message: 'Phone camera registered with SafeHome AI backend.'
            }));

            // Notify user's dashboards of camera coming online
            this.broadcastToUserDashboards(currentUserId, {
              type: 'device_status_change',
              device_id: currentDeviceId,
              status: 'online'
            });
            return;
          }

          // 2. Dashboard Registration
          if (msg.type === 'register_dashboard') {
            const userId = await this.authenticateDashboard(msg);
            if (!userId) {
              ws.send(JSON.stringify({
                type: 'error',
                code: 'AUTH_FAILED',
                message: 'Dashboard authentication failed. Valid token required.'
              }));
              return;
            }

            clientRole = 'dashboard';
            currentUserId = userId;

            if (!this.dashboardsByUser.has(userId)) {
              this.dashboardsByUser.set(userId, new Set());
            }

            const dashSession: DashboardSession = { ws, userId };
            this.dashboardsByUser.get(userId)!.add(dashSession);

            const activeCameras = this.phonesByUser.get(userId)?.size || 0;
            logger.info(`[WS] Dashboard registered for user ${userId}. Active cameras: ${activeCameras}`);

            ws.send(JSON.stringify({
              type: 'dashboard_registered',
              active_cameras: activeCameras
            }));
            return;
          }

          // 3. Live Frame Ingestion from Phone Camera
          if (msg.type === 'frame') {
            if (!currentUserId || !currentDeviceId || !msg.image) return;

            // SERVER-SIDE BACKPRESSURE: drop frame if AI is still processing previous one.
            // This is the main server-side guard against latency pile-up.
            // Update frame counts and telemetry on session
            if (currentUserId && currentDeviceId) {
              const userPhones = this.phonesByUser.get(currentUserId);
              const session = userPhones?.get(currentDeviceId);
              if (session) {
                session.frameCount += 1;
                session.lastHeartbeat = Date.now();
              }
              // Update last_frame_at in device_status
              await this.db.run(
                `UPDATE device_status SET last_frame_at = ?, fps = ?, status = 'online', updated_at = ? WHERE device_id = ?`,
                [new Date().toISOString(), msg.fps || 0, new Date().toISOString(), currentDeviceId]
              );
            }

            if (frameInFlight) {
              if (currentUserId && currentDeviceId) {
                const userPhones = this.phonesByUser.get(currentUserId);
                const session = userPhones?.get(currentDeviceId);
                if (session) session.dropCount += 1;
              }
              // Still send back an echo so the client can release its own gate
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'detection_result',
                  client_time: msg.client_time,
                  detections: [],
                  latency_ms: 0,
                  dropped: true
                }));
              }
              return;
            }

            frameInFlight = true;
            const frameStart = Date.now();

            // Forward to Python AI detection service
            let detections: any[] = [];
            let aiProcessingTimeMs = 0;
            let aiAccelerator = 'CPU';
            let aiDevice = 'cpu';

            try {
              const pyRes = await fetch(`${config.PYTHON_SERVICE_URL}/detect`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Internal-Secret': config.AI_SERVICE_SECRET
                },
                body: JSON.stringify({
                  image: msg.image,
                  min_confidence: 0.45
                }),
                signal: AbortSignal.timeout(1500)  // Reduced from 2500ms — fail fast
              });

              if (pyRes.ok) {
                const pyData: any = await pyRes.json();
                detections = pyData.detections || [];
                aiProcessingTimeMs = pyData.processing_time_ms || 0;
                aiAccelerator = pyData.accelerator || 'CPU';
                aiDevice = pyData.device || 'cpu';
              }
            } catch (pyErr: any) {
              logger.warn(`[WS] AI Detection service error: ${pyErr.message}`);
            } finally {
              // CRITICAL: always release the in-flight lock, even on error/timeout
              frameInFlight = false;
            }

            const serverPipelineMs = Date.now() - frameStart;

            // Return detection overlay to phone screen (includes echoed client_time for RTT measurement)
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'detection_result',
                client_time: msg.client_time,
                detections,
                processing_time_ms: aiProcessingTimeMs,
                latency_ms: serverPipelineMs,
                accelerator: aiAccelerator,
                device: aiDevice
              }));
            }

            // Broadcast live frame + bounding boxes strictly to the owner's dashboards
            this.broadcastToUserDashboards(currentUserId, {
              type: 'live_frame',
              device_id: currentDeviceId,
              image: msg.image,
              detections,
              timestamp: new Date().toISOString(),
              processing_time_ms: aiProcessingTimeMs,
              latency_ms: serverPipelineMs,
              accelerator: aiAccelerator,
              device: aiDevice
            });

            // If safety targets detected, process cooldown and event/alert generation
            if (detections.length > 0) {
              await this.handleDetections(currentUserId, currentDeviceId, detections, msg.image);
            }
            return;
          }

          // 4. Structured Telemetry & Heartbeat from Phone Sensor
          if (msg.type === 'heartbeat' && currentUserId && currentDeviceId) {
            const now = new Date().toISOString();
            const batteryLevel = typeof msg.battery_level === 'number' ? msg.battery_level : null;
            const batteryCharging = Boolean(msg.battery_charging);
            const networkOnline = msg.network_online !== undefined ? (msg.network_online ? 1 : 0) : 1;
            const clientFps = typeof msg.fps === 'number' ? msg.fps : 0.0;
            const clientLatency = typeof msg.latency_ms === 'number' ? msg.latency_ms : 0.0;

            const userPhones = this.phonesByUser.get(currentUserId);
            const session = userPhones?.get(currentDeviceId);
            if (session) {
              session.lastHeartbeat = Date.now();
            }

            // Update device status record
            await this.db.run(
              `UPDATE device_status SET
                 status = 'online',
                 battery_level = ?,
                 battery_charging = ?,
                 network_online = ?,
                 last_heartbeat_at = ?,
                 fps = ?,
                 latency_ms = ?,
                 updated_at = ?
               WHERE device_id = ?`,
              [batteryLevel, batteryCharging ? 1 : 0, networkOnline, now, clientFps, clientLatency, now, currentDeviceId]
            );

            // Update devices table
            await this.db.run(
              `UPDATE devices SET
                 last_heartbeat_at = ?,
                 battery_level = ?,
                 battery_charging = ?,
                 network_online = ?,
                 status = 'online'
               WHERE id = ?`,
              [now, batteryLevel, batteryCharging ? 1 : 0, networkOnline, currentDeviceId]
            );

            // Broadcast device telemetry to dashboard tiles
            this.broadcastToUserDashboards(currentUserId, {
              type: 'device_telemetry',
              device_id: currentDeviceId,
              battery_level: batteryLevel,
              battery_charging: batteryCharging,
              network_online: Boolean(networkOnline),
              fps: clientFps,
              latency_ms: clientLatency,
              timestamp: now
            });

            ws.send(JSON.stringify({ type: 'heartbeat_ack', timestamp: Date.now() }));
            return;
          }

          // Legacy ping
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            return;
          }

          // 5. WebRTC P2P Signaling: Request Offer (from dashboard to phone)
          if (msg.type === 'webrtc_request_offer') {
            if (currentUserId) {
              this.sendToPhone(currentUserId, msg.device_id, {
                type: 'webrtc_request_offer',
                device_id: msg.device_id
              });
            }
            return;
          }

          // 6. WebRTC P2P Signaling: Offer (from phone to dashboard)
          if (msg.type === 'webrtc_offer') {
            if (currentUserId) {
              this.broadcastToUserDashboards(currentUserId, {
                type: 'webrtc_offer',
                device_id: currentDeviceId || msg.device_id,
                sdp: msg.sdp
              });
            }
            return;
          }

          // 7. WebRTC P2P Signaling: Answer (from dashboard to phone)
          if (msg.type === 'webrtc_answer') {
            if (currentUserId) {
              this.sendToPhone(currentUserId, msg.device_id, {
                type: 'webrtc_answer',
                device_id: msg.device_id,
                sdp: msg.sdp
              });
            }
            return;
          }

          // 8. WebRTC P2P Signaling: ICE Candidate (bidirectional)
          if (msg.type === 'webrtc_ice_candidate') {
            if (clientRole === 'phone' && currentUserId) {
              this.broadcastToUserDashboards(currentUserId, {
                type: 'webrtc_ice_candidate',
                device_id: currentDeviceId || msg.device_id,
                candidate: msg.candidate
              });
            } else if (clientRole === 'dashboard' && currentUserId) {
              this.sendToPhone(currentUserId, msg.device_id, {
                type: 'webrtc_ice_candidate',
                device_id: msg.device_id,
                candidate: msg.candidate
              });
            }
            return;
          }

          // 9. Phone Acoustic & Loitering Safety Alerts
          if (msg.type === 'loitering_alert' && currentUserId) {
            await this.handleDirectPhoneAlert(currentUserId, currentDeviceId || '', 'person_loitering', {
              title: 'Loitering Detected',
              message: `Person observed lingering in camera zone for >${msg.duration_sec || 10} seconds.`,
              severity: 'WARNING',
              image: msg.image,
              metadata: { duration_sec: msg.duration_sec || 10 }
            });
            return;
          }

          if (msg.type === 'loud_noise_alert' && currentUserId) {
            await this.handleDirectPhoneAlert(currentUserId, currentDeviceId || '', 'loud_noise', {
              title: 'Loud Noise Detected',
              message: `Acoustic spike of ${msg.decibels || 80} dB detected by phone sensor.`,
              severity: 'WARNING',
              metadata: { decibels: msg.decibels }
            });
            return;
          }
        } catch (err: any) {
          logger.error('[WS Error]', err.message);
        }
      });

      // Disconnect handling
      ws.on('close', async () => {
        if (clientRole === 'phone' && currentUserId && currentDeviceId) {
          const userPhones = this.phonesByUser.get(currentUserId);
          let closedSession: PhoneSession | undefined;
          if (userPhones) {
            closedSession = userPhones.get(currentDeviceId);
            userPhones.delete(currentDeviceId);
            if (userPhones.size === 0) {
              this.phonesByUser.delete(currentUserId);
            }
          }

          logger.info(`[WS] Phone disconnected: ${currentDeviceId} for user ${currentUserId}`);

          const now = new Date().toISOString();
          try {
            await this.db.run(
              `UPDATE devices SET status = 'offline', last_seen = ? WHERE id = ?`,
              [now, currentDeviceId]
            );

            await this.db.run(
              `UPDATE device_status SET status = 'offline', updated_at = ? WHERE device_id = ?`,
              [now, currentDeviceId]
            );

            // Close monitoring session record
            if (closedSession) {
              const durationSec = Math.max(1, Math.round((Date.now() - closedSession.startedAt) / 1000));
              const avgFps = closedSession.frameCount > 0 ? Number((closedSession.frameCount / durationSec).toFixed(1)) : 0;
              await this.db.run(
                `UPDATE monitoring_sessions SET
                   ended_at = ?,
                   duration_seconds = ?,
                   frame_count = ?,
                   drop_count = ?,
                   avg_fps = ?,
                   end_reason = 'clean_disconnect'
                 WHERE id = ?`,
                [now, durationSec, closedSession.frameCount, closedSession.dropCount, avgFps, closedSession.sessionId]
              );

              // Log security audit event
              await logSecurityEvent(this.db, {
                userId: currentUserId,
                homeId: closedSession.homeId,
                eventType: 'monitoring_stopped',
                resourceType: 'device',
                resourceId: currentDeviceId,
                details: {
                  session_id: closedSession.sessionId,
                  duration_seconds: durationSec,
                  frame_count: closedSession.frameCount,
                  end_reason: 'clean_disconnect'
                }
              });
            }
          } catch (e) {
            // DB update error
          }

          // Broadcast offline status to user's dashboards immediately
          this.broadcastToUserDashboards(currentUserId, {
            type: 'device_status_change',
            device_id: currentDeviceId,
            status: 'offline'
          });
        } else if (clientRole === 'dashboard' && currentUserId) {
          const userDashes = this.dashboardsByUser.get(currentUserId);
          if (userDashes) {
            for (const session of userDashes) {
              if (session.ws === ws) {
                userDashes.delete(session);
                break;
              }
            }
            if (userDashes.size === 0) {
              this.dashboardsByUser.delete(currentUserId);
            }
          }
        }
      });
    });
  }

  // Authenticate Phone connection via device_token or user token
  private async authenticatePhone(msg: any): Promise<{ userId: string; deviceId: string; homeId: string | null } | null> {
    const token = msg.token || msg.device_token;

    if (token) {
      try {
        const decoded: any = jwt.verify(token, config.JWT_SECRET);
        return {
          userId: decoded.sub || decoded.id,
          deviceId: decoded.device_id || msg.device_id || `phone_${Date.now().toString(36)}`,
          homeId: decoded.home_id || null
        };
      } catch {
        // Fallback to authService check
        const user = await this.authService.verifyToken(token);
        if (user) {
          return {
            userId: user.id,
            deviceId: msg.device_id || `phone_${Date.now().toString(36)}`,
            homeId: null
          };
        }
      }
    }

    // Demo/Development fallback if unauthenticated
    if (process.env.NODE_ENV !== 'production') {
      const demoUser = await this.db.get('SELECT id FROM profiles ORDER BY created_at ASC LIMIT 1');
      if (demoUser) {
        const devId = msg.device_id || `phone_local_${Date.now().toString(36)}`;
        return {
          userId: demoUser.id,
          deviceId: devId,
          homeId: null
        };
      }
    }

    return null;
  }

  // Authenticate Dashboard connection
  private async authenticateDashboard(msg: any): Promise<string | null> {
    const token = msg.token;

    if (token) {
      try {
        const decoded: any = jwt.verify(token, config.JWT_SECRET);
        return decoded.sub || decoded.id;
      } catch {
        const user = await this.authService.verifyToken(token);
        if (user) return user.id;
      }
    }

    // Demo/Development fallback
    if (process.env.NODE_ENV !== 'production') {
      const demoUser = await this.db.get('SELECT id FROM profiles ORDER BY created_at ASC LIMIT 1');
      if (demoUser) return demoUser.id;
    }

    return null;
  }

  // User-isolated broadcast helper
  public broadcastToUserDashboards(userId: string, payload: any) {
    const userDashboards = this.dashboardsByUser.get(userId);
    if (!userDashboards || userDashboards.size === 0) return;

    const data = JSON.stringify(payload);
    for (const session of userDashboards) {
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(data);
      }
    }
  }

  // User-isolated send to phone helper (WebRTC signaling)
  private sendToPhone(userId: string, deviceId: string | undefined, payload: any) {
    const userPhones = this.phonesByUser.get(userId);
    if (!userPhones || userPhones.size === 0) return;

    const data = JSON.stringify(payload);
    if (deviceId && userPhones.has(deviceId)) {
      const session = userPhones.get(deviceId);
      if (session && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(data);
      }
    } else {
      for (const session of userPhones.values()) {
        if (session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(data);
        }
      }
    }
  }

  // Handle direct acoustic or loitering alerts originating from the phone
  private async handleDirectPhoneAlert(
    userId: string,
    deviceId: string,
    eventType: string,
    details: { title: string; message: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; metadata?: any; image?: string }
  ) {
    const home = await this.db.get('SELECT id FROM homes WHERE user_id = ? LIMIT 1', [userId]);
    const homeId = home?.id || null;
    const settings = await this.db.get('SELECT save_snapshots FROM user_settings WHERE user_id = ?', [userId]);
    const eventId = crypto.randomUUID();
    const alertId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const category = eventType === 'loud_noise' ? 'noise' : 'person';
    const objectClass = eventType === 'loud_noise' ? 'acoustic_spike' : 'person_loitering';

    let snapshotPath: string | null = null;
    if (settings?.save_snapshots !== 0 && details.image) {
      try {
        snapshotPath = await saveSnapshot(eventId, details.image);
      } catch (sErr: any) {
        logger.warn(`[WS] Failed to save snapshot for direct alert ${eventId}: ${sErr.message}`);
      }
    }

    await this.db.run(
      `INSERT INTO events (
        id, user_id, home_id, device_id, event_type, object_class, category,
        confidence, started_at, last_seen, frame_count, snapshot_path, metadata, is_unusual, anomaly_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1, 0.88)`,
      [
        eventId,
        userId,
        homeId,
        deviceId,
        eventType,
        objectClass,
        category,
        0.92,
        timestamp,
        timestamp,
        snapshotPath,
        JSON.stringify(details.metadata || {})
      ]
    );

    await this.db.run(
      `INSERT INTO alerts (id, user_id, event_id, severity, category, title, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [alertId, userId, eventId, details.severity, category, details.title, details.message]
    );

    this.broadcastToUserDashboards(userId, {
      type: 'new_event',
      event: {
        id: eventId,
        event_type: eventType,
        category,
        object_class: objectClass,
        started_at: timestamp,
        snapshot_path: snapshotPath,
        is_unusual: 1,
        anomaly_score: 0.88
      }
    });

    this.broadcastToUserDashboards(userId, {
      type: 'new_alert',
      alert: {
        id: alertId,
        user_id: userId,
        event_id: eventId,
        severity: details.severity,
        category,
        title: details.title,
        message: details.message,
        snapshot_path: snapshotPath,
        is_read: 0,
        is_resolved: 0,
        created_at: timestamp
      }
    });
  }

  // Event & Alert handling with cooldown
  private async handleDetections(userId: string, deviceId: string, detections: any[], imageBase64: string) {
    const now = Date.now();
    const settings = await this.db.get('SELECT event_cooldown_sec, confidence_threshold FROM user_settings WHERE user_id = ?', [userId]);
    const cooldownSec = settings?.event_cooldown_sec || 30;
    const minConf = settings?.confidence_threshold || 0.50;

    for (const det of detections) {
      if (det.confidence < minConf) continue;

      const category = mapClassToCategory(det.class);
      const cooldownKey = `${userId}_${category}`;
      const lastTriggered = this.lastEventCooldownMap.get(cooldownKey) || 0;

      if (now - lastTriggered < cooldownSec * 1000) {
        continue; // Respect user-configured cooldown
      }
      this.lastEventCooldownMap.set(cooldownKey, now);

      const eventId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const home = await this.db.get('SELECT id FROM homes WHERE user_id = ? LIMIT 1', [userId]);
      const homeId = home?.id || null;

      // Evaluate statistical anomaly via Python /analyze service
      let isUnusual = 0;
      let anomalyScore = 0.0;
      let anomalyReason = '';
      const activeStart = home?.active_hours_start || '07:00';
      const activeEnd = home?.active_hours_end || '23:00';
      const currentHour = new Date().getUTCHours();
      const currentWeekday = new Date().getUTCDay();
      const startH = parseInt(activeStart.split(':')[0], 10);
      const endH = parseInt(activeEnd.split(':')[0], 10);
      const isQuiet = currentHour < startH || currentHour >= endH;

      try {
        const pastEvents = await this.db.query(
          `SELECT category, started_at, user_feedback FROM events WHERE user_id = ? ORDER BY started_at DESC LIMIT 300`,
          [userId]
        );

        if (pastEvents.length >= 100) {
          const windowMap = new Map<string, any>();
          for (const pe of pastEvents) {
            const pDt = new Date(pe.started_at);
            const wKey = `${pe.started_at.slice(0, 10)}_${pDt.getUTCHours()}_${pe.category}`;
            if (!windowMap.has(wKey)) {
              windowMap.set(wKey, {
                timestamp_utc: pDt.toISOString(),
                hour: pDt.getUTCHours(),
                weekday: pDt.getUTCDay(),
                category: pe.category,
                event_count: 0,
                user_feedback: pe.user_feedback || null
              });
            }
            windowMap.get(wKey).event_count += 1;
          }

          const pyAnalyzeRes = await fetch(`${config.PYTHON_SERVICE_URL}/analyze`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Secret': config.AI_SERVICE_SECRET
            },
            body: JSON.stringify({
              timezone: home?.timezone || 'UTC',
              time_windows: Array.from(windowMap.values()),
              current_window: {
                timestamp_utc: timestamp,
                hour: currentHour,
                weekday: currentWeekday,
                category,
                event_count: 1,
                is_quiet_hours: isQuiet
              }
            }),
            signal: AbortSignal.timeout(1500)
          });

          if (pyAnalyzeRes.ok) {
            const pyData: any = await pyAnalyzeRes.json();
            if (pyData.is_unusual) {
              isUnusual = 1;
              anomalyScore = pyData.anomaly_score || 0.85;
              anomalyReason = pyData.reason || 'Unusual activity detected based on historical baseline.';
            }
          }
        }
      } catch {
        // Fallback gracefully if DS service busy
      }

      const meta = JSON.stringify({
        bounding_box: det.bounding_box,
        detected_via: 'phone_live_stream',
        anomaly_reason: anomalyReason || null
      });

      // Check user privacy settings for snapshot saving
      let snapshotPath: string | null = null;
      if (settings?.save_snapshots !== 0 && imageBase64) {
        try {
          snapshotPath = await saveSnapshot(eventId, imageBase64);
        } catch (sErr: any) {
          logger.warn(`[WS] Failed to save snapshot for event ${eventId}: ${sErr.message}`);
        }
      }

      // Insert event into DB
      await this.db.run(
        `INSERT INTO events (
          id, user_id, home_id, device_id, event_type, object_class, category,
          confidence, started_at, last_seen, frame_count, snapshot_path, metadata, is_unusual, anomaly_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [
          eventId,
          userId,
          homeId,
          deviceId,
          `${det.class}_detected`,
          det.class,
          category,
          det.confidence,
          timestamp,
          timestamp,
          snapshotPath,
          meta,
          isUnusual,
          anomalyScore
        ]
      );

      // Evaluate typed rules against current home mode & detection context
      const ruleResult = await evaluateDetectionRules(this.db, {
        userId,
        homeId,
        category,
        objectClass: det.class,
        confidence: det.confidence,
        currentMode: home?.current_mode || 'home',
        isQuietHours: isQuiet
      });

      let alertId: string | null = null;
      if (ruleResult.shouldAlert || isUnusual) {
        alertId = crypto.randomUUID();
        const alertSeverity = isUnusual ? 'WARNING' : ruleResult.severity;
        const alertTitle = isUnusual ? `Unusual ${category.toUpperCase()} Activity` : ruleResult.title;
        const alertMessage = isUnusual ? (anomalyReason || `Unusual frequency of ${category} activity detected.`) : ruleResult.message;

        await this.db.run(
          `INSERT INTO alerts (id, user_id, event_id, severity, category, title, message, rule_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [alertId, userId, eventId, alertSeverity, category, alertTitle, alertMessage, ruleResult.ruleId || null]
        );

        // Notify dashboard
        this.broadcastToUserDashboards(userId, {
          type: 'new_event',
          event: {
            id: eventId,
            object_class: det.class,
            category,
            confidence: det.confidence,
            started_at: timestamp,
            location_label: 'Phone Camera'
          },
          alert: {
            id: alertId,
            event_id: eventId,
            severity: alertSeverity,
            title: alertTitle,
            message: alertMessage,
            created_at: timestamp
          }
        });

        // If action is alarm or severity is CRITICAL, sound alarm on phone sensor
        if (ruleResult.action === 'alarm' || alertSeverity === 'CRITICAL') {
          this.sendToPhone(userId, deviceId, {
            type: 'safety_alert',
            title: alertTitle,
            message: alertMessage,
            severity: alertSeverity
          });
        }
      } else {
        // Just broadcast event without alert
        this.broadcastToUserDashboards(userId, {
          type: 'new_event',
          event: {
            id: eventId,
            object_class: det.class,
            category,
            confidence: det.confidence,
            started_at: timestamp,
            location_label: 'Phone Camera'
          }
        });
      }
    }
  }
}
