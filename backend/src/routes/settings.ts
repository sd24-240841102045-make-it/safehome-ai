import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../services/db.js';
import { UpdateSettingsSchema } from '../shared/schemas.js';

export function createSettingsRouter(db: DatabaseService, authMiddleware: any): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/settings', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const settings = await db.get('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
      const home = await db.get('SELECT name, address, timezone, active_hours_start, active_hours_end FROM homes WHERE user_id = ? LIMIT 1', [userId]);

      res.json({
        success: true,
        settings: settings || {
          expected_active_start: '07:00',
          expected_active_end: '23:00',
          confidence_threshold: 0.50,
          event_cooldown_sec: 30,
          snapshot_retention_days: 7,
          event_retention_days: 90,
          save_snapshots: 1,
          opt_in_live_preview: 0
        },
        home: home || { name: 'My Home', timezone: 'UTC' }
      });
    } catch (err) {
      next(err);
    }
  });

  router.put('/settings', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const validated = UpdateSettingsSchema.parse(req.body);

      await db.run(
        `INSERT INTO user_settings (
          user_id, expected_active_start, expected_active_end,
          confidence_threshold, event_cooldown_sec, snapshot_retention_days, event_retention_days,
          save_snapshots, opt_in_live_preview, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          expected_active_start = COALESCE(excluded.expected_active_start, user_settings.expected_active_start),
          expected_active_end = COALESCE(excluded.expected_active_end, user_settings.expected_active_end),
          confidence_threshold = COALESCE(excluded.confidence_threshold, user_settings.confidence_threshold),
          event_cooldown_sec = COALESCE(excluded.event_cooldown_sec, user_settings.event_cooldown_sec),
          snapshot_retention_days = COALESCE(excluded.snapshot_retention_days, user_settings.snapshot_retention_days),
          event_retention_days = COALESCE(excluded.event_retention_days, user_settings.event_retention_days),
          save_snapshots = COALESCE(excluded.save_snapshots, user_settings.save_snapshots),
          opt_in_live_preview = COALESCE(excluded.opt_in_live_preview, user_settings.opt_in_live_preview),
          updated_at = excluded.updated_at`,
        [
          userId,
          validated.expected_active_start || '07:00',
          validated.expected_active_end || '23:00',
          validated.confidence_threshold ?? 0.50,
          validated.event_cooldown_sec ?? 30,
          validated.snapshot_retention_days ?? 7,
          validated.event_retention_days ?? 90,
          validated.save_snapshots !== undefined ? (validated.save_snapshots ? 1 : 0) : 1,
          validated.opt_in_live_preview !== undefined ? (validated.opt_in_live_preview ? 1 : 0) : 0,
          new Date().toISOString()
        ]
      );

      res.json({ success: true, message: 'Settings updated successfully.' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
