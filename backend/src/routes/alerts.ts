import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../services/db.js';

export function createAlertsRouter(db: DatabaseService, authMiddleware: any): Router {
  const router = Router();
  router.use('/alerts', authMiddleware);

  // 1. List Alerts for Authenticated User
  router.get('/alerts', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { unread_only, severity, limit = 50 } = req.query;

      const conditions: string[] = ['user_id = ?'];
      const params: any[] = [userId];

      if (unread_only === 'true' || unread_only === '1') {
        conditions.push('is_read = 0');
      }
      if (severity) {
        conditions.push('severity = ?');
        params.push((severity as string).toUpperCase());
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;
      const sql = `
        SELECT id, event_id, severity, category, title, message, is_read, created_at
        FROM alerts
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ?
      `;

      const rows = await db.query(sql, [...params, Number(limit)]);
      const alerts = rows.map((a: any) => ({ ...a, is_read: Boolean(a.is_read) }));

      const unreadRow = await db.get(
        'SELECT COUNT(*) as unread FROM alerts WHERE user_id = ? AND is_read = 0',
        [userId]
      );

      res.json({
        success: true,
        alerts,
        unread_count: unreadRow ? parseInt(unreadRow.unread, 10) : 0
      });
    } catch (err) {
      next(err);
    }
  });

  // 2. Mark All Alerts as Read (User-Scoped)
  router.patch('/alerts/read-all', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      await db.run('UPDATE alerts SET is_read = 1 WHERE user_id = ? AND is_read = 0', [userId]);
      res.json({ success: true, message: 'All alerts marked as read.' });
    } catch (err) {
      next(err);
    }
  });

  // 3. Mark Single Alert Read (User-Scoped)
  router.patch('/alerts/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const alert = await db.get('SELECT id FROM alerts WHERE id = ? AND user_id = ?', [id, userId]);
      if (!alert) {
        return res.status(404).json({ success: false, error: 'Alert not found or access denied.' });
      }

      await db.run('UPDATE alerts SET is_read = 1 WHERE id = ?', [id]);
      res.json({ success: true, message: 'Alert marked as read.' });
    } catch (err) {
      next(err);
    }
  });

  // 4. Delete Alert (User-Scoped)
  router.delete('/alerts/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const alert = await db.get('SELECT id FROM alerts WHERE id = ? AND user_id = ?', [id, userId]);
      if (!alert) {
        return res.status(404).json({ success: false, error: 'Alert not found or access denied.' });
      }

      await db.run('DELETE FROM alerts WHERE id = ?', [id]);
      res.json({ success: true, message: 'Alert deleted.' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
