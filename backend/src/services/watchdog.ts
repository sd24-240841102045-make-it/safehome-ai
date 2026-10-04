import crypto from 'crypto';
import { DatabaseService } from './db.js';
import { logger } from './logger.js';
import { logSecurityEvent } from './auditLog.js';

export type BroadcastCallback = (userId: string, payload: any) => void;

export class MonitoringWatchdog {
  private db: DatabaseService;
  private intervalId: NodeJS.Timeout | null = null;
  private broadcastFn: BroadcastCallback | null = null;
  private isRunning: boolean = false;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  public setBroadcastHandler(fn: BroadcastCallback) {
    this.broadcastFn = fn;
  }

  public start(intervalMs: number = 10000) {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.checkDeviceHealth(), intervalMs);
    logger.info(`[Watchdog] Monitoring health watchdog scheduled (interval: ${intervalMs / 1000}s)`);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public async checkDeviceHealth() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const now = new Date();
      const cutoffIso = new Date(now.getTime() - 25000).toISOString(); // 25 seconds stale threshold

      // Find devices marked online but whose last heartbeat/frame is stale
      const staleDevices = await this.db.query(
        `SELECT ds.device_id, ds.user_id, ds.home_id, ds.last_heartbeat_at, ds.last_frame_at, d.name as device_name
         FROM device_status ds
         JOIN devices d ON d.id = ds.device_id
         WHERE ds.status = 'online'
           AND (ds.last_heartbeat_at < ? OR (ds.last_heartbeat_at IS NULL AND ds.updated_at < ?))`,
        [cutoffIso, cutoffIso]
      );

      for (const dev of staleDevices) {
        logger.warn(`[Watchdog] Device ${dev.device_name} (${dev.device_id}) missed heartbeats. Marking offline.`);

        // 1. Mark device status offline
        await this.db.run(
          `UPDATE device_status SET status = 'offline', updated_at = ? WHERE device_id = ?`,
          [now.toISOString(), dev.device_id]
        );
        await this.db.run(
          `UPDATE devices SET status = 'offline', last_seen = ? WHERE id = ?`,
          [now.toISOString(), dev.device_id]
        );

        // 2. Check if open incident already exists for this device
        const existingIncident = await this.db.get(
          `SELECT id FROM incidents WHERE device_id = ? AND status IN ('open', 'acknowledged') LIMIT 1`,
          [dev.device_id]
        );

        let incidentId = existingIncident?.id;
        if (!existingIncident) {
          incidentId = crypto.randomUUID();
          const title = `Camera Disconnected: ${dev.device_name}`;
          const message = `Sensor device "${dev.device_name}" stopped sending heartbeats or video frames. Monitoring stream may have terminated or lost Wi-Fi connection.`;

          await this.db.run(
            `INSERT INTO incidents (id, user_id, home_id, device_id, incident_type, severity, title, message, status, opened_at, metadata)
             VALUES (?, ?, ?, ?, 'heartbeat_timeout', 'WARNING', ?, ?, 'open', ?, ?)`,
            [
              incidentId,
              dev.user_id,
              dev.home_id,
              dev.device_id,
              title,
              message,
              now.toISOString(),
              JSON.stringify({ last_heartbeat_at: dev.last_heartbeat_at, last_frame_at: dev.last_frame_at })
            ]
          );

          // Log security event
          await logSecurityEvent(this.db, {
            userId: dev.user_id,
            homeId: dev.home_id,
            eventType: 'monitoring_stopped',
            resourceType: 'device',
            resourceId: dev.device_id,
            details: { reason: 'heartbeat_timeout', device_name: dev.device_name }
          });

          // Broadcast incident_opened to user dashboard
          if (this.broadcastFn) {
            this.broadcastFn(dev.user_id, {
              type: 'incident_opened',
              incident: {
                id: incidentId,
                device_id: dev.device_id,
                incident_type: 'heartbeat_timeout',
                severity: 'WARNING',
                title,
                message,
                status: 'open',
                opened_at: now.toISOString()
              }
            });
          }
        }

        // Broadcast device offline
        if (this.broadcastFn) {
          this.broadcastFn(dev.user_id, {
            type: 'device_status_change',
            device_id: dev.device_id,
            status: 'offline'
          });
        }
      }
    } catch (err: any) {
      logger.warn(`[Watchdog] Error during health check tick: ${err.message}`);
    } finally {
      this.isRunning = false;
    }
  }
}
