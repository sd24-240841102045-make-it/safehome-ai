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

  private phonesByUser = new Map<string, Map<string, PhoneSession>>();
  private dashboardsByUser = new Map<string, Set<DashboardSession>>();
  private lastEventCooldownMap = new Map<string, number>();

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
      let frameInFlight = false;

      ws.on('message', async (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString());

          // 1. Phone Camera Registration
          if (msg.type === 'register_phone') {
            const authResult = await this.authenticatePhone(msg);
            if (!authResult) {
              ws.send(JSON.stringify({ type: 'error', code: 'AUTH_FAILED', message: 'Valid token required.' }));
              return;
            }

            clientRole = 'phone';
            currentDeviceId = authResult.deviceId;
            currentUserId = authResult.userId;
            currentSessionId = crypto.randomUUID();

            const uid = authResult.userId;
            const devId = authResult.deviceId;
            const sessId = currentSessionId;

            if (!this.phonesByUser.has(uid)) this.phonesByUser.set(uid, new Map());

            const phoneSession: PhoneSession = {
              ws,
              deviceId: devId,
              userId: uid,
              homeId: authResult.homeId,
              deviceName: msg.device_name || 'Android Phone Sensor',
              sessionId: sessId,
              startedAt: Date.now(),
              frameCount: 0,
              dropCount: 0,
              lastHeartbeat: Date.now()
            };

            this.phonesByUser.get(uid)!.set(devId, phoneSession);

            const now = new Date().toISOString();
            await this.db.run(
              `UPDATE devices SET status = 'online', last_seen = ?, last_heartbeat_at = ?, network_online = 1 WHERE id = ?`,
              [now, now, devId]
            );
            await this.db.run(
              `INSERT INTO device_status (device_id, user_id, home_id, status, last_heartbeat_at, last_frame_at, updated_at)
               VALUES (?, ?, ?, 'online', ?, ?, ?)
               ON CONFLICT(device_id) DO UPDATE SET status = 'online', last_heartbeat_at = excluded.last_heartbeat_at, updated_at = excluded.updated_at`,
              [devId, uid, authResult.homeId || null, now, now, now]
            );
            await this.db.run(
              `INSERT INTO monitoring_sessions (id, user_id, home_id, device_id, started_at) VALUES (?, ?, ?, ?, ?)`,
              [sessId, uid, authResult.homeId || null, devId, now]
            );
            await logSecurityEvent(this.db, {
              userId: uid,
              homeId: authResult.homeId,
              eventType: 'monitoring_started',
              resourceType: 'device',
              resourceId: devId,
              details: { device_name: phoneSession.deviceName, session_id: sessId }
            });

            ws.send(JSON.stringify({ type: 'registered', device_id: devId, status: 'online' }));
            this.broadcastToUserDashboards(uid, { type: 'device_status_change', device_id: devId, status: 'online' });
            return;
          }

          // 2. Dashboard Registration
          if (msg.type === 'register_dashboard') {
            const userId = await this.authenticateDashboard(msg);
            if (!userId) {
              ws.send(JSON.stringify({ type: 'error', code: 'AUTH_FAILED', message: 'Valid token required.' }));
              return;
            }

            clientRole = 'dashboard';
            currentUserId = userId;

            if (!this.dashboardsByUser.has(userId)) this.dashboardsByUser.set(userId, new Set());
            this.dashboardsByUser.get(userId)!.add({ ws, userId });

            const activeCameras = this.phonesByUser.get(userId)?.size || 0;
            ws.send(JSON.stringify({ type: 'dashboard_registered', active_cameras: activeCameras }));
            return;
          }

          // 3. Live Video Frame from Camera
          if (msg.type === 'frame' && currentUserId && currentDeviceId && msg.image) {
            const uid = currentUserId;
            const devId = currentDeviceId;
            const userPhones = this.phonesByUser.get(uid);
            const session = userPhones?.get(devId);
            if (session) {
              session.frameCount += 1;
              session.lastHeartbeat = Date.now();
            }

            if (frameInFlight) {
              if (session) session.dropCount += 1;
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'detection_result', client_time: msg.client_time, detections: [], latency_ms: 0, dropped: true }));
              }
              return;
            }

            frameInFlight = true;
            const frameStart = Date.now();
            let detections: any[] = [];
            let aiProcessingTimeMs = 0;
            let aiAccelerator = 'CPU';
            let aiDevice = 'cpu';

            try {
              const pyRes = await fetch(`${config.PYTHON_SERVICE_URL}/detect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': config.AI_SERVICE_SECRET },
                body: JSON.stringify({ image: msg.image, min_confidence: 0.45 }),
                signal: AbortSignal.timeout(1500)
              });

              if (pyRes.ok) {
                const pyData: any = await pyRes.json();
                detections = pyData.detections || [];
                aiProcessingTimeMs = pyData.processing_time_ms || 0;
                aiAccelerator = pyData.accelerator || 'CPU';
                aiDevice = pyData.device || 'cpu';
              }
            } catch (pyErr: any) {
              logger.warn(`[WS] Detection error: ${pyErr.message}`);
            } finally {
              frameInFlight = false;
            }

            const serverPipelineMs = Date.now() - frameStart;
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

            this.broadcastToUserDashboards(uid, {
              type: 'live_frame',
              device_id: devId,
              image: msg.image,
              detections,
              timestamp: new Date().toISOString(),
              processing_time_ms: aiProcessingTimeMs,
              latency_ms: serverPipelineMs,
              accelerator: aiAccelerator,
              device: aiDevice
            });

            if (detections.length > 0) {
              await this.handleDetections(uid, devId, detections, msg.image);
            }
            return;
          }

          // 4. Heartbeat & Telemetry
          if (msg.type === 'heartbeat' && currentUserId && currentDeviceId) {
            const uid = currentUserId;
            const devId = currentDeviceId;
            const now = new Date().toISOString();
            const batteryLevel = typeof msg.battery_level === 'number' ? msg.battery_level : null;
            const batteryCharging = Boolean(msg.battery_charging);
            const clientFps = typeof msg.fps === 'number' ? msg.fps : 0.0;
            const clientLatency = typeof msg.latency_ms === 'number' ? msg.latency_ms : 0.0;

            const session = this.phonesByUser.get(uid)?.get(devId);
            if (session) session.lastHeartbeat = Date.now();

            await this.db.run(
              `UPDATE device_status SET status = 'online', battery_level = ?, battery_charging = ?, last_heartbeat_at = ?, fps = ?, latency_ms = ?, updated_at = ? WHERE device_id = ?`,
              [batteryLevel, batteryCharging ? 1 : 0, now, clientFps, clientLatency, now, devId]
            );
            await this.db.run(
              `UPDATE devices SET last_heartbeat_at = ?, battery_level = ?, battery_charging = ?, status = 'online' WHERE id = ?`,
              [now, batteryLevel, batteryCharging ? 1 : 0, devId]
            );

            this.broadcastToUserDashboards(uid, {
              type: 'device_telemetry',
              device_id: devId,
              battery_level: batteryLevel,
              battery_charging: batteryCharging,
              network_online: true,
              fps: clientFps,
              latency_ms: clientLatency,
              timestamp: now
            });

            ws.send(JSON.stringify({ type: 'heartbeat_ack', timestamp: Date.now() }));
            return;
          }

          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            return;
          }

          // 5. WebRTC P2P Signaling
          if (msg.type === 'webrtc_request_offer' && currentUserId) {
            this.sendToPhone(currentUserId, msg.device_id, { type: 'webrtc_request_offer', device_id: msg.device_id });
            return;
          }
          if (msg.type === 'webrtc_offer' && currentUserId) {
            this.broadcastToUserDashboards(currentUserId, { type: 'webrtc_offer', device_id: currentDeviceId || msg.device_id, sdp: msg.sdp });
            return;
          }
          if (msg.type === 'webrtc_answer' && currentUserId) {
            this.sendToPhone(currentUserId, msg.device_id, { type: 'webrtc_answer', device_id: msg.device_id, sdp: msg.sdp });
            return;
          }
          if (msg.type === 'webrtc_ice_candidate' && currentUserId) {
            if (clientRole === 'phone') {
              this.broadcastToUserDashboards(currentUserId, { type: 'webrtc_ice_candidate', device_id: currentDeviceId || msg.device_id, candidate: msg.candidate });
            } else {
              this.sendToPhone(currentUserId, msg.device_id, { type: 'webrtc_ice_candidate', device_id: msg.device_id, candidate: msg.candidate });
            }
            return;
          }

          // 6. Direct Sensor Events (Loitering & Loud Noise)
          if (msg.type === 'loitering_alert' && currentUserId) {
            await this.handleDirectPhoneAlert(currentUserId, currentDeviceId || '', 'person_loitering', {
              title: 'Loitering Detected',
              message: `Person observed in zone for >${msg.duration_sec || 10} seconds.`,
              severity: 'WARNING',
              image: msg.image,
              metadata: { duration_sec: msg.duration_sec || 10 }
            });
            return;
          }
          if (msg.type === 'loud_noise_alert' && currentUserId) {
            await this.handleDirectPhoneAlert(currentUserId, currentDeviceId || '', 'loud_noise', {
              title: 'Loud Noise Detected',
              message: `Acoustic spike of ${msg.decibels || 80} dB detected.`,
              severity: 'WARNING',
              metadata: { decibels: msg.decibels }
            });
            return;
          }
        } catch (err: any) {
          logger.error('[WS Error]', err.message);
        }
      });

      // Disconnection Handler
      ws.on('close', async () => {
        if (clientRole === 'phone' && currentUserId && currentDeviceId) {
          const uid = currentUserId;
          const devId = currentDeviceId;
          const userPhones = this.phonesByUser.get(uid);
          const closedSession = userPhones?.get(devId);
          userPhones?.delete(devId);
          if (userPhones && userPhones.size === 0) this.phonesByUser.delete(uid);

          const now = new Date().toISOString();
          try {
            await this.db.run(`UPDATE devices SET status = 'offline', last_seen = ? WHERE id = ?`, [now, devId]);
            await this.db.run(`UPDATE device_status SET status = 'offline', updated_at = ? WHERE device_id = ?`, [now, devId]);

            if (closedSession) {
              const durationSec = Math.max(1, Math.round((Date.now() - closedSession.startedAt) / 1000));
              const avgFps = closedSession.frameCount > 0 ? Number((closedSession.frameCount / durationSec).toFixed(1)) : 0;
              await this.db.run(
                `UPDATE monitoring_sessions SET ended_at = ?, duration_seconds = ?, frame_count = ?, drop_count = ?, avg_fps = ?, end_reason = 'clean_disconnect' WHERE id = ?`,
                [now, durationSec, closedSession.frameCount, closedSession.dropCount, avgFps, closedSession.sessionId]
              );
              await logSecurityEvent(this.db, {
                userId: uid,
                homeId: closedSession.homeId,
                eventType: 'monitoring_stopped',
                resourceType: 'device',
                resourceId: devId,
                details: { session_id: closedSession.sessionId, duration_seconds: durationSec, frame_count: closedSession.frameCount }
              });
            }
          } catch { /* ignore disconnect cleanup err */ }

          this.broadcastToUserDashboards(uid, { type: 'device_status_change', device_id: devId, status: 'offline' });
        } else if (clientRole === 'dashboard' && currentUserId) {
          const uid = currentUserId;
          const userDashes = this.dashboardsByUser.get(uid);
          if (userDashes) {
            for (const s of userDashes) {
              if (s.ws === ws) { userDashes.delete(s); break; }
            }
            if (userDashes.size === 0) this.dashboardsByUser.delete(uid);
          }
        }
      });
    });
  }

  private async authenticatePhone(msg: any) {
    const token = msg.token || msg.device_token;
    if (token) {
      try {
        const decoded: any = jwt.verify(token, config.JWT_SECRET);
        return { userId: decoded.sub || decoded.id, deviceId: decoded.device_id || msg.device_id || `phone_${Date.now().toString(36)}`, homeId: decoded.home_id || null };
      } catch {
        const user = await this.authService.verifyToken(token);
        if (user) return { userId: user.id, deviceId: msg.device_id || `phone_${Date.now().toString(36)}`, homeId: null };
      }
    }
    if (process.env.NODE_ENV !== 'production') {
      const demo = await this.db.get('SELECT id FROM profiles ORDER BY created_at ASC LIMIT 1');
      if (demo) return { userId: demo.id, deviceId: msg.device_id || `phone_local_${Date.now().toString(36)}`, homeId: null };
    }
    return null;
  }

  private async authenticateDashboard(msg: any) {
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
    if (process.env.NODE_ENV !== 'production') {
      const demo = await this.db.get('SELECT id FROM profiles ORDER BY created_at ASC LIMIT 1');
      if (demo) return demo.id;
    }
    return null;
  }

  public broadcastToUserDashboards(userId: string, payload: any) {
    const sessions = this.dashboardsByUser.get(userId);
    if (!sessions) return;
    const data = JSON.stringify(payload);
    for (const s of sessions) {
      if (s.ws.readyState === WebSocket.OPEN) s.ws.send(data);
    }
  }

  private sendToPhone(userId: string, deviceId: string | undefined, payload: any) {
    const phones = this.phonesByUser.get(userId);
    if (!phones) return;
    const data = JSON.stringify(payload);
    if (deviceId && phones.has(deviceId)) {
      const s = phones.get(deviceId);
      if (s && s.ws.readyState === WebSocket.OPEN) s.ws.send(data);
    } else {
      for (const s of phones.values()) {
        if (s.ws.readyState === WebSocket.OPEN) s.ws.send(data);
      }
    }
  }

  private async handleDirectPhoneAlert(
    userId: string,
    deviceId: string,
    eventType: string,
    details: { title: string; message: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; metadata?: any; image?: string }
  ) {
    const home = await this.db.get('SELECT id FROM homes WHERE user_id = ? LIMIT 1', [userId]);
    const settings = await this.db.get('SELECT save_snapshots FROM user_settings WHERE user_id = ?', [userId]);
    const eventId = crypto.randomUUID();
    const alertId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const category = eventType === 'loud_noise' ? 'other' : 'person';
    const objectClass = eventType === 'loud_noise' ? 'acoustic_spike' : 'person_loitering';

    let snapshotPath: string | null = null;
    if (settings?.save_snapshots !== 0 && details.image) {
      try { snapshotPath = await saveSnapshot(eventId, details.image); } catch { /* ignore */ }
    }

    await this.db.run(
      `INSERT INTO events (id, user_id, home_id, device_id, event_type, object_class, category, confidence, started_at, last_seen, frame_count, snapshot_path, metadata, is_unusual, anomaly_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0.92, ?, ?, 1, ?, ?, 1, 0.88)`,
      [eventId, userId, home?.id || null, deviceId, eventType, objectClass, category, timestamp, timestamp, snapshotPath, JSON.stringify(details.metadata || {})]
    );

    await this.db.run(
      `INSERT INTO alerts (id, user_id, event_id, severity, category, title, message) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [alertId, userId, eventId, details.severity, category, details.title, details.message]
    );

    this.broadcastToUserDashboards(userId, {
      type: 'new_event',
      event: { id: eventId, event_type: eventType, category, object_class: objectClass, started_at: timestamp, snapshot_path: snapshotPath, is_unusual: 1, anomaly_score: 0.88 },
      alert: { id: alertId, event_id: eventId, severity: details.severity, category, title: details.title, message: details.message, snapshot_path: snapshotPath, is_read: 0, is_resolved: 0, created_at: timestamp }
    });
  }

  private async handleDetections(userId: string, deviceId: string, detections: any[], imageBase64: string) {
    const now = Date.now();
    const settings = await this.db.get('SELECT event_cooldown_sec, confidence_threshold, save_snapshots FROM user_settings WHERE user_id = ?', [userId]);
    const cooldownSec = settings?.event_cooldown_sec || 30;
    const minConf = settings?.confidence_threshold || 0.50;

    for (const det of detections) {
      if (det.confidence < minConf) continue;

      const category = mapClassToCategory(det.class);
      const cooldownKey = `${userId}_${category}`;
      const lastTriggered = this.lastEventCooldownMap.get(cooldownKey) || 0;

      if (now - lastTriggered < cooldownSec * 1000) continue;
      this.lastEventCooldownMap.set(cooldownKey, now);

      const eventId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const home = await this.db.get('SELECT id, timezone, active_hours_start, active_hours_end, current_mode FROM homes WHERE user_id = ? LIMIT 1', [userId]);

      const timeZone = home?.timezone || 'UTC';
      let currentHour = new Date().getUTCHours();
      let currentWeekday = new Date().getUTCDay();
      try {
        const formatter = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23', weekday: 'short' });
        const parts = formatter.formatToParts(new Date());
        const m: Record<string, string> = {};
        parts.forEach(p => { m[p.type] = p.value; });
        const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        currentHour = parseInt(m.hour || '0', 10) % 24;
        currentWeekday = dayMap[m.weekday || 'Sun'] ?? new Date().getDay();
      } catch {
        currentHour = new Date().getHours();
        currentWeekday = new Date().getDay();
      }

      let isUnusual = 0;
      let anomalyScore = 0.0;
      let anomalyReason = '';

      const startH = parseInt((home?.active_hours_start || '07:00').split(':')[0], 10);
      const endH = parseInt((home?.active_hours_end || '23:00').split(':')[0], 10);
      const isQuiet = currentHour < startH || currentHour >= endH;

      try {
        const pastEvents = await this.db.query(`SELECT category, started_at, user_feedback FROM events WHERE user_id = ? ORDER BY started_at DESC LIMIT 300`, [userId]);
        if (pastEvents.length >= 100) {
          const windowMap = new Map<string, any>();
          for (const pe of pastEvents) {
            const pDt = new Date(pe.started_at);
            const wKey = `${pe.started_at.slice(0, 10)}_${pDt.getUTCHours()}_${pe.category}`;
            if (!windowMap.has(wKey)) {
              windowMap.set(wKey, { timestamp_utc: pDt.toISOString(), hour: pDt.getUTCHours(), weekday: pDt.getUTCDay(), category: pe.category, event_count: 0, user_feedback: pe.user_feedback || null });
            }
            windowMap.get(wKey).event_count += 1;
          }

          const pyRes = await fetch(`${config.PYTHON_SERVICE_URL}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': config.AI_SERVICE_SECRET },
            body: JSON.stringify({
              timezone: timeZone,
              time_windows: Array.from(windowMap.values()),
              current_window: { timestamp_utc: timestamp, hour: currentHour, weekday: currentWeekday, category, event_count: 1, is_quiet_hours: isQuiet }
            }),
            signal: AbortSignal.timeout(1500)
          });
          if (pyRes.ok) {
            const pyData: any = await pyRes.json();
            if (pyData.is_unusual) {
              isUnusual = 1;
              anomalyScore = pyData.anomaly_score || 0.85;
              anomalyReason = pyData.reason || 'Unusual activity detected.';
            }
          }
        }
      } catch { /* ignore statistical analysis error */ }

      let snapshotPath: string | null = null;
      if (settings?.save_snapshots !== 0 && imageBase64) {
        try { snapshotPath = await saveSnapshot(eventId, imageBase64); } catch { /* ignore */ }
      }

      await this.db.run(
        `INSERT INTO events (id, user_id, home_id, device_id, event_type, object_class, category, confidence, started_at, last_seen, frame_count, snapshot_path, metadata, is_unusual, anomaly_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [eventId, userId, home?.id || null, deviceId, `${det.class}_detected`, det.class, category, det.confidence, timestamp, timestamp, snapshotPath, JSON.stringify({ bounding_box: det.bounding_box, anomaly_reason: anomalyReason || null }), isUnusual, anomalyScore]
      );

      const ruleResult = await evaluateDetectionRules(this.db, {
        userId,
        homeId: home?.id || null,
        category,
        objectClass: det.class,
        confidence: det.confidence,
        currentMode: home?.current_mode || 'home',
        isQuietHours: isQuiet
      });

      if (ruleResult.shouldAlert || isUnusual) {
        const alertId = crypto.randomUUID();
        const alertSeverity = isUnusual ? 'WARNING' : ruleResult.severity;
        const alertTitle = isUnusual ? `Unusual ${category.toUpperCase()} Activity` : ruleResult.title;
        const alertMessage = isUnusual ? (anomalyReason || `Unusual frequency of ${category} activity.`) : ruleResult.message;

        await this.db.run(
          `INSERT INTO alerts (id, user_id, event_id, severity, category, title, message, rule_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [alertId, userId, eventId, alertSeverity, category, alertTitle, alertMessage, ruleResult.ruleId || null]
        );

        this.broadcastToUserDashboards(userId, {
          type: 'new_event',
          event: { id: eventId, object_class: det.class, category, confidence: det.confidence, started_at: timestamp, location_label: 'Phone Camera' },
          alert: { id: alertId, event_id: eventId, severity: alertSeverity, title: alertTitle, message: alertMessage, created_at: timestamp }
        });

        if (ruleResult.action === 'alarm' || alertSeverity === 'CRITICAL') {
          this.sendToPhone(userId, deviceId, { type: 'safety_alert', title: alertTitle, message: alertMessage, severity: alertSeverity });
        }
      } else {
        this.broadcastToUserDashboards(userId, {
          type: 'new_event',
          event: { id: eventId, object_class: det.class, category, confidence: det.confidence, started_at: timestamp, location_label: 'Phone Camera' }
        });
      }
    }
  }
}
