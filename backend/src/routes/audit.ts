import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../services/db.js';
import { logSecurityEvent } from '../services/auditLog.js';
import { CreateAuditLogSchema } from '../shared/schemas.js';

export function createAuditRouter(db: DatabaseService, authMiddleware: any): Router {
  const router = Router();
  router.use('/audit', authMiddleware);

  // 1. Get Security Audit Logs (User-Scoped, ordered newest first)
  router.get('/audit', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { limit = 50, event_type } = req.query;

      const conditions: string[] = ['user_id = ?'];
      const params: any[] = [userId];

      if (event_type) {
        conditions.push('event_type = ?');
        params.push(event_type);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;
      const rows = await db.query(
        `SELECT id, home_id, event_type, resource_type, resource_id, details, ip_address, created_at
         FROM security_audit_log
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT ?`,
        [...params, Number(limit)]
      );

      const logs = rows.map((r: any) => ({
        ...r,
        details: typeof r.details === 'string' ? safeJsonParse(r.details) : r.details
      }));

      res.json({ success: true, logs, data: logs });
    } catch (err) {
      next(err);
    }
  });

  // 2. Client Session Event Recording (e.g., monitoring started/stopped on device)
  router.post('/audit/session-event', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const validated = CreateAuditLogSchema.parse(req.body);

      await logSecurityEvent(db, {
        userId,
        eventType: validated.event_type,
        resourceType: validated.resource_type,
        resourceId: validated.resource_id,
        details: validated.details
      });

      res.status(201).json({ success: true, message: 'Session event logged.' });
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
