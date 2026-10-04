import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../services/db.js';
import { logSecurityEvent } from '../services/auditLog.js';

export function createIncidentsRouter(db: DatabaseService, authMiddleware: any): Router {
  const router = Router();
  router.use('/incidents', authMiddleware);

  // 1. List Incidents (User-Scoped)
  router.get('/incidents', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { status, limit = 50 } = req.query;

      const conditions: string[] = ['user_id = ?'];
      const params: any[] = [userId];

      if (status) {
        conditions.push('status = ?');
        params.push(status);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;
      const rows = await db.query(
        `SELECT id, home_id, device_id, incident_type, severity, title, message, status,
                opened_at, acknowledged_at, resolved_at, metadata
         FROM incidents
         ${whereClause}
         ORDER BY opened_at DESC
         LIMIT ?`,
        [...params, Number(limit)]
      );

      const openCountRow = await db.get(
        `SELECT COUNT(*) as open_count FROM incidents WHERE user_id = ? AND status = 'open'`,
        [userId]
      );

      const incidents = rows.map((r: any) => ({
        ...r,
        metadata: typeof r.metadata === 'string' ? safeJsonParse(r.metadata) : r.metadata
      }));

      res.json({
        success: true,
        incidents,
        open_count: openCountRow ? parseInt(openCountRow.open_count, 10) : 0
      });
    } catch (err) {
      next(err);
    }
  });

  // 2. Acknowledge Incident
  router.patch('/incidents/:id/acknowledge', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const userId = req.user!.id;
      const now = new Date().toISOString();

      const incident = await db.get('SELECT id, title, incident_type FROM incidents WHERE id = ? AND user_id = ?', [id, userId]);
      if (!incident) {
        return res.status(404).json({ success: false, error: 'Incident not found or access denied.' });
      }

      await db.run(
        `UPDATE incidents SET status = 'acknowledged', acknowledged_at = ? WHERE id = ?`,
        [now, id]
      );

      res.json({ success: true, message: 'Incident acknowledged.', status: 'acknowledged', acknowledged_at: now });
    } catch (err) {
      next(err);
    }
  });

  // 3. Resolve Incident
  router.patch('/incidents/:id/resolve', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const userId = req.user!.id;
      const now = new Date().toISOString();

      const incident = await db.get('SELECT id, title, incident_type FROM incidents WHERE id = ? AND user_id = ?', [id, userId]);
      if (!incident) {
        return res.status(404).json({ success: false, error: 'Incident not found or access denied.' });
      }

      await db.run(
        `UPDATE incidents SET status = 'resolved', resolved_at = ? WHERE id = ?`,
        [now, id]
      );

      // Log security event
      await logSecurityEvent(db, {
        userId,
        eventType: 'incident_resolved',
        resourceType: 'incident',
        resourceId: id,
        details: { title: incident.title, incident_type: incident.incident_type }
      });

      res.json({ success: true, message: 'Incident resolved.', status: 'resolved', resolved_at: now });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function safeJsonParse(val: any) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}
