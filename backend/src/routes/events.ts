import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { DatabaseService } from '../services/db.js';
import { mapClassToCategory, CreateEventSchema, EventFeedbackSchema } from '../shared/schemas.js';
import { saveSnapshot, deleteSnapshot } from '../services/snapshots.js';

export function createEventsRouter(db: DatabaseService, authMiddleware: any): Router {
  const router = Router();
  router.use('/events', authMiddleware);

  // 1. Query Historical Events (Strictly User-Scoped)
  router.get('/events', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const {
        page = 1,
        limit = 15,
        category,
        object_class,
        is_unusual,
        min_confidence,
        search
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);
      const conditions: string[] = ['user_id = ?'];
      const params: any[] = [userId];

      if (category) {
        conditions.push('category = ?');
        params.push(category);
      }
      if (object_class) {
        conditions.push('object_class = ?');
        params.push(object_class);
      }
      if (is_unusual !== undefined && is_unusual !== '') {
        conditions.push('is_unusual = ?');
        params.push(is_unusual === 'true' || is_unusual === '1' ? 1 : 0);
      }
      if (min_confidence) {
        conditions.push('confidence >= ?');
        params.push(parseFloat(min_confidence as string));
      }
      if (search) {
        conditions.push('(object_class LIKE ? OR category LIKE ?)');
        params.push(`%${search}%`);
        params.push(`%${search}%`);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      // Count query
      const countRow = await db.get(`SELECT COUNT(*) as total FROM events ${whereClause}`, params);
      const total = countRow ? parseInt(countRow.total, 10) : 0;

      // Select query
      const querySql = `
        SELECT id, home_id, device_id, event_type, object_class, category, confidence,
               started_at, last_seen, frame_count, snapshot_path, is_unusual, anomaly_score,
               user_feedback, metadata
        FROM events
        ${whereClause}
        ORDER BY started_at DESC
        LIMIT ? OFFSET ?
      `;

      const rows = await db.query(querySql, [...params, Number(limit), offset]);
      const events = rows.map((r: any) => ({
        ...r,
        is_unusual: Boolean(r.is_unusual),
        metadata: typeof r.metadata === 'string' ? safeJsonParse(r.metadata) : r.metadata
      }));

      res.json({
        success: true,
        events,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)) || 1
        }
      });
    } catch (err) {
      next(err);
    }
  });

  // 2. Get Single Event Details (Cross-User Access Denied)
  router.get('/events/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const event = await db.get(
        'SELECT * FROM events WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!event) {
        return res.status(404).json({ success: false, error: 'Event not found or access denied.' });
      }

      res.json({
        success: true,
        event: {
          ...event,
          is_unusual: Boolean(event.is_unusual),
          metadata: safeJsonParse(event.metadata)
        }
      });
    } catch (err) {
      next(err);
    }
  });

  // 3. Create Event (User-Scoped) with Local Snapshot Storage
  router.post('/events', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = CreateEventSchema.parse(req.body);
      const userId = req.user!.id;
      const category = mapClassToCategory(validated.object_class);
      const eventId = crypto.randomUUID();
      const now = new Date().toISOString();

      // Find user home
      const home = await db.get('SELECT id FROM homes WHERE user_id = ? LIMIT 1', [userId]);
      const homeId = validated.home_id || home?.id || null;

      let snapshotPath: string | null = null;
      if (validated.snapshot_base64) {
        try {
          snapshotPath = await saveSnapshot(eventId, validated.snapshot_base64);
        } catch {
          // If snapshot saving fails, do not block event recording
        }
      }

      const metaJson = JSON.stringify({
        bounding_box: validated.bounding_box || null
      });

      await db.run(
        `INSERT INTO events (
          id, user_id, home_id, device_id, event_type, object_class, category,
          confidence, started_at, last_seen, frame_count, snapshot_path, is_unusual, anomaly_score, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, 0.0, ?)`,
        [
          eventId,
          userId,
          homeId,
          validated.device_id || null,
          `${validated.object_class}_detected`,
          validated.object_class,
          category,
          validated.confidence,
          now,
          now,
          snapshotPath,
          metaJson
        ]
      );

      const created = await db.get('SELECT * FROM events WHERE id = ?', [eventId]);
      res.status(201).json({ success: true, event: created });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: err.errors[0].message });
      }
      next(err);
    }
  });

  // 4. Submit User Feedback on Event (expected / unexpected)
  router.patch('/events/:id/feedback', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const { feedback } = EventFeedbackSchema.parse(req.body);

      const event = await db.get('SELECT id FROM events WHERE id = ? AND user_id = ?', [id, userId]);
      if (!event) {
        return res.status(404).json({ success: false, error: 'Event not found or access denied.' });
      }

      await db.run('UPDATE events SET user_feedback = ? WHERE id = ?', [feedback, id]);
      res.json({ success: true, message: 'Event feedback recorded.', user_feedback: feedback });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: err.errors[0].message });
      }
      next(err);
    }
  });

  // 5. Delete Event (Removes Event Record AND associated local snapshot file)
  router.delete('/events/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const event = await db.get(
        'SELECT id, snapshot_path FROM events WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!event) {
        return res.status(404).json({ success: false, error: 'Event not found or access denied.' });
      }

      // Privacy: remove snapshot file from disk
      if (event.snapshot_path) {
        deleteSnapshot(event.snapshot_path);
      }

      // Delete associated alerts and event record
      await db.run('DELETE FROM alerts WHERE event_id = ?', [id]);
      await db.run('DELETE FROM events WHERE id = ?', [id]);

      res.json({ success: true, message: 'Event and associated snapshot file deleted.' });
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
