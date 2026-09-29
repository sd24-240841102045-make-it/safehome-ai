import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { DatabaseService } from '../services/db.js';
import { AuthService } from '../services/supabase.js';
import { config } from '../config.js';
import { logger } from '../services/logger.js';
import { mapClassToCategory } from '../shared/schemas.js';

interface PhoneSession {
  ws: WebSocket;
  deviceId: string;
  userId: string;
  homeId: string | null;
  deviceName: string;
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

            if (!this.phonesByUser.has(currentUserId)) {
              this.phonesByUser.set(currentUserId, new Map());
            }

            const phoneSession: PhoneSession = {
              ws,
              deviceId: currentDeviceId,
              userId: currentUserId,
              homeId: authResult.homeId,
              deviceName: msg.device_name || 'Android Phone Sensor'
            };

            this.phonesByUser.get(currentUserId)!.set(currentDeviceId, phoneSession);

            logger.info(`[WS] Phone paired & connected: ${currentDeviceId} for user ${currentUserId}`);

            // Update database status
            const now = new Date().toISOString();
            await this.db.run(
              `UPDATE devices SET status = 'streaming', last_seen = ? WHERE id = ?`,
              [now, currentDeviceId]
            );

            ws.send(JSON.stringify({
              type: 'registered',
              device_id: currentDeviceId,
              status: 'streaming',
              message: 'Phone camera registered with SafeHome AI backend.'
            }));

            // Notify user's dashboards of camera coming online
            this.broadcastToUserDashboards(currentUserId, {
              type: 'device_status_change',
              device_id: currentDeviceId,
              status: 'streaming'
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

            const frameStart = Date.now();
            const clientTimestamp = msg.timestamp ? new Date(msg.timestamp).getTime() : frameStart;

            // Forward to Python AI detection service
            let detections: any[] = [];
            let aiProcessingTimeMs = 0;

            try {
              const pyRes = await fetch(`${config.PYTHON_SERVICE_URL}/detect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  image: msg.image,
                  min_confidence: 0.45
                }),
                signal: AbortSignal.timeout(2500)
              });

              if (pyRes.ok) {
                const pyData: any = await pyRes.json();
                detections = pyData.detections || [];
                aiProcessingTimeMs = pyData.processing_time_ms || 0;
              }
            } catch (pyErr: any) {
              logger.warn(`[WS] AI Detection service error: ${pyErr.message}`);
            }

            const totalLatencyMs = Date.now() - clientTimestamp;

            // Return detection overlay to phone screen
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'detection_result',
                detections,
                processing_time_ms: aiProcessingTimeMs,
                latency_ms: totalLatencyMs
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
              latency_ms: totalLatencyMs
            });

            // If safety targets detected, process cooldown and event/alert generation
            if (detections.length > 0) {
              await this.handleDetections(currentUserId, currentDeviceId, detections, msg.image);
            }
            return;
          }

          // 4. Heartbeat Ping
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
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
          if (userPhones) {
            userPhones.delete(currentDeviceId);
            if (userPhones.size === 0) {
              this.phonesByUser.delete(currentUserId);
            }
          }

          logger.info(`[WS] Phone disconnected: ${currentDeviceId} for user ${currentUserId}`);

          try {
            await this.db.run(
              `UPDATE devices SET status = 'offline', last_seen = ? WHERE id = ?`,
              [new Date().toISOString(), currentDeviceId]
            );
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
  private broadcastToUserDashboards(userId: string, payload: any) {
    const userDashboards = this.dashboardsByUser.get(userId);
    if (!userDashboards || userDashboards.size === 0) return;

    const data = JSON.stringify(payload);
    for (const session of userDashboards) {
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(data);
      }
    }
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

      const meta = JSON.stringify({
        bounding_box: det.bounding_box,
        detected_via: 'phone_live_stream'
      });

      // Insert event into DB
      await this.db.run(
        `INSERT INTO events (
          id, user_id, home_id, device_id, event_type, object_class, category,
          confidence, started_at, last_seen, frame_count, metadata, is_unusual, anomaly_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, 0.0)`,
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
          meta
        ]
      );

      // Create alert according to specification
      let alertTitle = 'Activity Detected';
      let alertSeverity = 'NOTICE';
      let alertMessage = `${det.class} observed in camera view (${Math.round(det.confidence * 100)}% confidence).`;

      if (category === 'person') {
        alertSeverity = 'INFO';
        alertTitle = 'Person Detected';
        alertMessage = `Person observed in camera view (${Math.round(det.confidence * 100)}% confidence).`;
      }

      const alertId = crypto.randomUUID();
      await this.db.run(
        `INSERT INTO alerts (id, user_id, event_id, severity, category, title, message)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [alertId, userId, eventId, alertSeverity, category, alertTitle, alertMessage]
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
    }
  }
}
