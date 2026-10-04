import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../services/db.js';
import { UpdateSettingsSchema } from '../shared/schemas.js';
import { purgeExpiredData } from '../services/retention.js';
import { logSecurityEvent } from '../services/auditLog.js';
import { deleteSnapshot } from '../services/snapshots.js';

export function createSettingsRouter(db: DatabaseService, authMiddleware: any): Router {
  const router = Router();
  router.use('/settings', authMiddleware);

  // 1. Get User Settings & Home Context
  router.get('/settings', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const settings = await db.get('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
      const home = await db.get(
        'SELECT name, address, timezone, active_hours_start, active_hours_end, current_mode, arming_delay_s FROM homes WHERE user_id = ? LIMIT 1',
        [userId]
      );

      res.json({
        success: true,
        settings: settings || {
          expected_active_start: '07:00',
          expected_active_end: '23:00',
          notification_quiet_hours_start: '22:00',
          notification_quiet_hours_end: '07:00',
          confidence_threshold: 0.50,
          event_cooldown_sec: 30,
          snapshot_retention_days: 7,
          event_retention_days: 90,
          save_snapshots: 1,
          opt_in_live_preview: 0,
          audio_enabled: 0
        },
        home: home || { name: 'My Home', timezone: 'UTC', current_mode: 'home' }
      });
    } catch (err) {
      next(err);
    }
  });

  // 2. Update User Settings
  router.put('/settings', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const validated = UpdateSettingsSchema.parse(req.body);

      await db.run(
        `INSERT INTO user_settings (
          user_id, expected_active_start, expected_active_end,
          notification_quiet_hours_start, notification_quiet_hours_end,
          confidence_threshold, event_cooldown_sec, snapshot_retention_days, event_retention_days,
          save_snapshots, opt_in_live_preview, audio_enabled, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          expected_active_start = COALESCE(excluded.expected_active_start, user_settings.expected_active_start),
          expected_active_end = COALESCE(excluded.expected_active_end, user_settings.expected_active_end),
          notification_quiet_hours_start = COALESCE(excluded.notification_quiet_hours_start, user_settings.notification_quiet_hours_start),
          notification_quiet_hours_end = COALESCE(excluded.notification_quiet_hours_end, user_settings.notification_quiet_hours_end),
          confidence_threshold = COALESCE(excluded.confidence_threshold, user_settings.confidence_threshold),
          event_cooldown_sec = COALESCE(excluded.event_cooldown_sec, user_settings.event_cooldown_sec),
          snapshot_retention_days = COALESCE(excluded.snapshot_retention_days, user_settings.snapshot_retention_days),
          event_retention_days = COALESCE(excluded.event_retention_days, user_settings.event_retention_days),
          save_snapshots = COALESCE(excluded.save_snapshots, user_settings.save_snapshots),
          opt_in_live_preview = COALESCE(excluded.opt_in_live_preview, user_settings.opt_in_live_preview),
          audio_enabled = COALESCE(excluded.audio_enabled, user_settings.audio_enabled),
          updated_at = excluded.updated_at`,
        [
          userId,
          validated.expected_active_start || '07:00',
          validated.expected_active_end || '23:00',
          validated.notification_quiet_hours_start || '22:00',
          validated.notification_quiet_hours_end || '07:00',
          validated.confidence_threshold ?? 0.50,
          validated.event_cooldown_sec ?? 30,
          validated.snapshot_retention_days ?? 7,
          validated.event_retention_days ?? 90,
          validated.save_snapshots !== undefined ? (validated.save_snapshots ? 1 : 0) : 1,
          validated.opt_in_live_preview !== undefined ? (validated.opt_in_live_preview ? 1 : 0) : 0,
          validated.audio_enabled !== undefined ? (validated.audio_enabled ? 1 : 0) : 0,
          new Date().toISOString()
        ]
      );

      // Update home timezone and details if provided
      if (validated.timezone || validated.home_name || validated.home_address) {
        await db.run(
          `UPDATE homes SET
            timezone = COALESCE(?, timezone),
            name = COALESCE(?, name),
            address = COALESCE(?, address),
            updated_at = ?
           WHERE user_id = ?`,
          [
            validated.timezone || null,
            validated.home_name || null,
            validated.home_address || null,
            new Date().toISOString(),
            userId
          ]
        );
      }

      // Log security audit event for settings update
      await logSecurityEvent(db, {
        userId,
        eventType: 'settings_updated',
        resourceType: 'user_settings',
        resourceId: userId,
        details: validated
      });

      res.json({ success: true, message: 'Settings updated successfully.' });
    } catch (err) {
      next(err);
    }
  });

  // 3. Purge Expired Data on Demand (Privacy Enforcement)
  router.post('/settings/purge', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const result = await purgeExpiredData(db, userId);

      // Log security audit event for data purge
      await logSecurityEvent(db, {
        userId,
        eventType: 'data_purged',
        resourceType: 'retention',
        details: { deleted_snapshots: result.deletedSnapshots, deleted_events: result.deletedEvents }
      });

      res.json({
        success: true,
        message: 'Data retention purge executed successfully.',
        purged: {
          deleted_snapshots: result.deletedSnapshots,
          deleted_events: result.deletedEvents
        }
      });
    } catch (err) {
      next(err);
    }
  });

  // 4. GDPR User Data Export (Downloadable JSON)
  router.get('/settings/export', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      const profile = await db.get(
        'SELECT id, email, full_name, role, created_at FROM profiles WHERE id = ?',
        [userId]
      );

      const homes = await db.query(
        'SELECT id, name, address, timezone, active_hours_start, active_hours_end, created_at FROM homes WHERE user_id = ?',
        [userId]
      );

      const devices = await db.query(
        'SELECT id, home_id, name, device_type, status, ip_address, last_seen, created_at FROM devices WHERE user_id = ?',
        [userId]
      );

      const settings = await db.get(
        'SELECT expected_active_start, expected_active_end, confidence_threshold, event_cooldown_sec, snapshot_retention_days, event_retention_days, save_snapshots, opt_in_live_preview, updated_at FROM user_settings WHERE user_id = ?',
        [userId]
      );

      const events = await db.query(
        'SELECT id, home_id, device_id, event_type, object_class, category, confidence, started_at, last_seen, frame_count, snapshot_path, is_unusual, anomaly_score, user_feedback, metadata FROM events WHERE user_id = ? ORDER BY started_at DESC',
        [userId]
      );

      const alerts = await db.query(
        'SELECT id, event_id, severity, category, title, message, is_read, created_at FROM alerts WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );

      const exportBundle = {
        success: true,
        gdpr_notice: 'SafeHome AI complete user data archive pursuant to GDPR / CCPA right of access.',
        exported_at: new Date().toISOString(),
        profile: profile || null,
        homes: homes || [],
        devices: devices || [],
        settings: settings || null,
        events: events || [],
        alerts: alerts || []
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="safehome-data-export-${userId.slice(0, 8)}.json"`);
      res.json(exportBundle);
    } catch (err) {
      next(err);
    }
  });

  // 5. Complete Account & Security Data Erasure (GDPR Right to Erasure / Privacy Reset)
  router.post('/settings/erase-all', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { confirm_phrase } = req.body;

      if (confirm_phrase !== 'DELETE ALL MY DATA') {
        return res.status(400).json({
          success: false,
          error: 'Please type the confirmation phrase "DELETE ALL MY DATA" to proceed with permanent erasure.'
        });
      }

      // 1. Fetch all user snapshots and delete them physically from disk
      const userEvents = await db.query('SELECT snapshot_path FROM events WHERE user_id = ?', [userId]);
      let deletedDiskSnapshots = 0;
      for (const ev of userEvents) {
        if (ev.snapshot_path) {
          const ok = deleteSnapshot(ev.snapshot_path);
          if (ok) deletedDiskSnapshots++;
        }
      }

      // 2. Cascade delete database records
      await db.run('DELETE FROM alerts WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM events WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM incidents WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM monitoring_sessions WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM device_status WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM pairing_codes WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM rules WHERE user_id = ? AND is_default = 0', [userId]);

      // 3. Log data erasure action
      await logSecurityEvent(db, {
        userId,
        eventType: 'complete_data_erased',
        resourceType: 'account_data',
        resourceId: userId,
        details: { deleted_snapshots: deletedDiskSnapshots, deleted_events: userEvents.length }
      });

      res.json({
        success: true,
        message: 'All surveillance events, alerts, sessions, incidents, and physical snapshot images have been permanently wiped from local disk and database.',
        wiped_snapshots: deletedDiskSnapshots,
        wiped_events: userEvents.length
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
