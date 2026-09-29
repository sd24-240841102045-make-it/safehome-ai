import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../services/db.js';

export function createDashboardRouter(db: DatabaseService, authMiddleware: any): Router {
  const router = Router();

  router.get('/dashboard', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      // 1. Fetch user's home timezone
      const home = await db.get('SELECT timezone FROM homes WHERE user_id = ? LIMIT 1', [userId]);
      const timeZone = home?.timezone || 'UTC';

      // 2. Format today's date in user's home timezone (e.g. "2026-09-29")
      const todayDateStr = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

      // 3. User-scoped DB counts for today (Rule 1 & Rule 5: Derived strictly from authenticated user)
      const todayTotalRow = await db.get(
        `SELECT COUNT(*) as total FROM events WHERE user_id = ? AND started_at LIKE ?`,
        [userId, `${todayDateStr}%`]
      );

      const todayPersonRow = await db.get(
        `SELECT COUNT(*) as total FROM events WHERE user_id = ? AND category = 'person' AND started_at LIKE ?`,
        [userId, `${todayDateStr}%`]
      );

      const todayUnusualRow = await db.get(
        `SELECT COUNT(*) as total FROM events WHERE user_id = ? AND is_unusual = 1 AND started_at LIKE ?`,
        [userId, `${todayDateStr}%`]
      );

      const activeDevicesRow = await db.get(
        `SELECT COUNT(*) as total FROM devices WHERE user_id = ? AND status IN ('online', 'streaming')`,
        [userId]
      );

      // 4. Recent 5 events strictly for this user
      const recentEvents = await db.query(
        `SELECT id, object_class, category, confidence, started_at, last_seen, frame_count, is_unusual
         FROM events WHERE user_id = ? ORDER BY started_at DESC LIMIT 5`,
        [userId]
      );

      const totalToday = todayTotalRow ? parseInt(todayTotalRow.total, 10) : 0;
      const personToday = todayPersonRow ? parseInt(todayPersonRow.total, 10) : 0;
      const unusualToday = todayUnusualRow ? parseInt(todayUnusualRow.total, 10) : 0;
      const otherToday = Math.max(0, totalToday - personToday);

      res.json({
        success: true,
        summary: {
          today: {
            total: totalToday,
            person: personToday,
            other: otherToday,
            unusual: unusualToday
          },
          devices: {
            active: activeDevicesRow ? parseInt(activeDevicesRow.total, 10) : 0
          },
          home_timezone: timeZone,
          recent_events: recentEvents.map((e: any) => ({
            ...e,
            is_unusual: Boolean(e.is_unusual)
          }))
        }
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
