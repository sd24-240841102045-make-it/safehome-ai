import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../services/db.js';

function getDayBoundsInTimezone(timeZone: string, date: Date = new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const dateStr = formatter.format(date);
    const [y, m, d] = dateStr.split('-').map(Number);

    const tempDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false, hourCycle: 'h23'
    }).formatToParts(tempDate);
    const partMap: Record<string, number> = {};
    parts.forEach(p => { if (p.type !== 'literal') partMap[p.type] = parseInt(p.value, 10); });

    const diffHours = (partMap.hour || 0) % 24;
    const diffMinutes = partMap.minute || 0;
    const offsetMs = ((diffHours * 60) + diffMinutes) * 60 * 1000;
    const startOfDayUtc = new Date(tempDate.getTime() - offsetMs);
    const endOfDayUtc = new Date(startOfDayUtc.getTime() + 24 * 60 * 60 * 1000 - 1);

    return {
      dateStr,
      startIso: startOfDayUtc.toISOString(),
      endIso: endOfDayUtc.toISOString()
    };
  } catch {
    const dStr = date.toISOString().slice(0, 10);
    return {
      dateStr: dStr,
      startIso: `${dStr}T00:00:00.000Z`,
      endIso: `${dStr}T23:59:59.999Z`
    };
  }
}

export function createDashboardRouter(db: DatabaseService, authMiddleware: any): Router {
  const router = Router();

  router.get('/dashboard', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      // 1. Fetch user's home timezone
      const home = await db.get('SELECT timezone FROM homes WHERE user_id = ? LIMIT 1', [userId]);
      const timeZone = home?.timezone || 'UTC';

      // 2. Exact start and end bounds of today in user's home timezone
      const { dateStr: todayDateStr, startIso, endIso } = getDayBoundsInTimezone(timeZone);

      // 3. User-scoped DB counts for today (Rule 1 & Rule 5: Derived strictly from authenticated user)
      const todayTotalRow = await db.get(
        `SELECT COUNT(*) as total FROM events WHERE user_id = ? AND started_at >= ? AND started_at <= ?`,
        [userId, startIso, endIso]
      );

      const todayPersonRow = await db.get(
        `SELECT COUNT(*) as total FROM events WHERE user_id = ? AND category = 'person' AND started_at >= ? AND started_at <= ?`,
        [userId, startIso, endIso]
      );

      const todayUnusualRow = await db.get(
        `SELECT COUNT(*) as total FROM events WHERE user_id = ? AND is_unusual = 1 AND started_at >= ? AND started_at <= ?`,
        [userId, startIso, endIso]
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
