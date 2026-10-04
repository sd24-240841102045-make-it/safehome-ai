import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../services/db.js';

export function createTimelineRouter(db: DatabaseService, authMiddleware: any): Router {
  const router = Router();
  router.use('/timeline', authMiddleware);

  // Unified Chronological Timeline Stream
  router.get('/timeline', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const {
        page = 1,
        limit = 30,
        stream_type = 'all', // 'all' | 'alerts' | 'events' | 'incidents' | 'audit'
        search
      } = req.query;

      const pageNum = Math.max(1, Number(page));
      const limitNum = Math.max(5, Math.min(100, Number(limit)));
      const offset = (pageNum - 1) * limitNum;

      const items: Array<{
        id: string;
        item_type: 'event' | 'alert' | 'incident' | 'audit';
        title: string;
        description: string;
        severity?: string;
        category?: string;
        timestamp: string;
        metadata?: any;
      }> = [];

      // 1. Fetch Events
      if (stream_type === 'all' || stream_type === 'events') {
        const events = await db.query(
          `SELECT id, event_type, object_class, category, confidence, started_at, snapshot_path, is_unusual, anomaly_score, user_feedback, feedback_reason
           FROM events
           WHERE user_id = ?
           ORDER BY started_at DESC
           LIMIT ? OFFSET ?`,
          [userId, limitNum * 2, offset]
        );

        for (const e of events) {
          items.push({
            id: e.id,
            item_type: 'event',
            title: `${capitalize(e.object_class)} Detected`,
            description: `${Math.round(e.confidence * 100)}% confidence detection in ${e.category} category.`,
            severity: e.is_unusual ? 'WARNING' : 'INFO',
            category: e.category,
            timestamp: e.started_at,
            metadata: {
              snapshot_path: e.snapshot_path,
              is_unusual: Boolean(e.is_unusual),
              user_feedback: e.user_feedback,
              feedback_reason: e.feedback_reason
            }
          });
        }
      }

      // 2. Fetch Alerts
      if (stream_type === 'all' || stream_type === 'alerts') {
        const alerts = await db.query(
          `SELECT a.id, a.event_id, a.severity, a.category, a.title, a.message, a.is_read, a.is_resolved, a.resolved_at, a.created_at, e.snapshot_path
           FROM alerts a
           LEFT JOIN events e ON a.event_id = e.id
           WHERE a.user_id = ?
           ORDER BY a.created_at DESC
           LIMIT ? OFFSET ?`,
          [userId, limitNum * 2, offset]
        );

        for (const a of alerts) {
          items.push({
            id: a.id,
            item_type: 'alert',
            title: a.title,
            description: a.message,
            severity: a.severity,
            category: a.category,
            timestamp: a.created_at,
            metadata: {
              event_id: a.event_id,
              snapshot_path: a.snapshot_path,
              is_read: Boolean(a.is_read),
              is_resolved: Boolean(a.is_resolved),
              resolved_at: a.resolved_at
            }
          });
        }
      }

      // 3. Fetch Incidents
      if (stream_type === 'all' || stream_type === 'incidents') {
        const incidents = await db.query(
          `SELECT id, incident_type, severity, title, message, status, opened_at, resolved_at
           FROM incidents
           WHERE user_id = ?
           ORDER BY opened_at DESC
           LIMIT ? OFFSET ?`,
          [userId, limitNum * 2, offset]
        );

        for (const inc of incidents) {
          items.push({
            id: inc.id,
            item_type: 'incident',
            title: inc.title,
            description: inc.message,
            severity: inc.severity,
            timestamp: inc.opened_at,
            metadata: {
              incident_type: inc.incident_type,
              status: inc.status,
              resolved_at: inc.resolved_at
            }
          });
        }
      }

      // 4. Fetch Security Audit Logs
      if (stream_type === 'all' || stream_type === 'audit') {
        const logs = await db.query(
          `SELECT id, event_type, resource_type, resource_id, details, created_at
           FROM security_audit_log
           WHERE user_id = ?
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`,
          [userId, limitNum * 2, offset]
        );

        for (const log of logs) {
          const detailsObj = typeof log.details === 'string' ? safeJsonParse(log.details) : log.details;
          items.push({
            id: log.id,
            item_type: 'audit',
            title: formatAuditEventTitle(log.event_type),
            description: formatAuditEventDescription(log.event_type, detailsObj),
            severity: 'INFO',
            timestamp: log.created_at,
            metadata: {
              event_type: log.event_type,
              resource_type: log.resource_type,
              details: detailsObj
            }
          });
        }
      }

      // Sort combined stream in reverse chronological order
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Slice to exact limit requested for this page
      const pagedItems = items.slice(0, limitNum);

      res.json({
        success: true,
        timeline: pagedItems,
        pagination: {
          page: pageNum,
          limit: limitNum,
          count: pagedItems.length
        }
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function capitalize(s: string) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatAuditEventTitle(eventType: string) {
  switch (eventType) {
    case 'device_paired': return 'New Device Paired';
    case 'device_unpaired': return 'Device Unpaired';
    case 'monitoring_started': return 'Monitoring Stream Started';
    case 'monitoring_stopped': return 'Monitoring Stream Stopped';
    case 'settings_updated': return 'Security Settings Updated';
    case 'feedback_submitted': return 'AI Feedback Recorded';
    case 'alert_resolved': return 'Alert Resolved by User';
    case 'mode_changed': return 'Home Armed Mode Changed';
    case 'data_purged': return 'Privacy Retention Purge';
    case 'user_login': return 'User Logged In';
    case 'user_registered': return 'New Account Registered';
    default: return capitalize(eventType.replace(/_/g, ' '));
  }
}

function formatAuditEventDescription(eventType: string, details: any) {
  if (!details) return `System security audit event recorded.`;
  if (details.device_name) return `Device: ${details.device_name}`;
  if (details.new_mode) return `Armed mode switched to ${details.new_mode.toUpperCase()}`;
  if (details.title) return `Action on "${details.title}"`;
  return JSON.stringify(details);
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
