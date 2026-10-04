import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { DatabaseService } from '../services/db.js';
import { logSecurityEvent } from '../services/auditLog.js';

const CreateRuleSchema = z.object({
  name: z.string().min(1, 'Rule name is required'),
  description: z.string().optional(),
  modes: z.array(z.enum(['home', 'away', 'night', 'disarmed'])).default(['home', 'away', 'night']),
  target_categories: z.array(z.enum(['person', 'vehicle', 'animal', 'other'])).default(['person']),
  min_confidence: z.number().min(0.1).max(0.99).default(0.50),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).default('WARNING'),
  action: z.enum(['alert', 'alarm', 'log_only']).default('alert'),
  cooldown_sec: z.number().int().min(5).max(300).default(30)
});

const SetModeSchema = z.object({
  mode: z.enum(['home', 'away', 'night', 'disarmed']),
  arming_delay_s: z.number().int().min(0).max(300).optional().default(0)
});

export function createRulesRouter(db: DatabaseService, authMiddleware: any, broadcastFn?: (userId: string, payload: any) => void): Router {
  const router = Router();
  router.use(authMiddleware);

  // 1. List User Rules
  router.get('/rules', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const rows = await db.query(
        `SELECT id, home_id, name, description, is_enabled, modes, target_categories,
                min_confidence, severity, action, cooldown_sec, is_default, created_at
         FROM rules
         WHERE user_id = ?
         ORDER BY created_at ASC`,
        [userId]
      );

      const rules = rows.map((r: any) => ({
        ...r,
        is_enabled: Boolean(r.is_enabled),
        modes: typeof r.modes === 'string' ? safeJsonParse(r.modes) : r.modes,
        target_categories: typeof r.target_categories === 'string' ? safeJsonParse(r.target_categories) : r.target_categories
      }));

      res.json({ success: true, rules });
    } catch (err) {
      next(err);
    }
  });

  // 2. Create Rule
  router.post('/rules', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const validated = CreateRuleSchema.parse(req.body);
      const ruleId = crypto.randomUUID();
      const now = new Date().toISOString();

      const home = await db.get('SELECT id FROM homes WHERE user_id = ? LIMIT 1', [userId]);

      await db.run(
        `INSERT INTO rules (
          id, user_id, home_id, name, description, is_enabled, modes, target_categories,
          min_confidence, severity, action, cooldown_sec, is_default, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          ruleId,
          userId,
          home?.id || null,
          validated.name,
          validated.description || null,
          JSON.stringify(validated.modes),
          JSON.stringify(validated.target_categories),
          validated.min_confidence,
          validated.severity,
          validated.action,
          validated.cooldown_sec,
          now,
          now
        ]
      );

      res.status(201).json({ success: true, message: 'Rule created.', rule_id: ruleId });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: err.errors[0].message });
      }
      next(err);
    }
  });

  // 3. Toggle / Update Rule
  router.patch('/rules/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const userId = req.user!.id;
      const { is_enabled } = req.body;

      const rule = await db.get('SELECT id FROM rules WHERE id = ? AND user_id = ?', [id, userId]);
      if (!rule) {
        return res.status(404).json({ success: false, error: 'Rule not found or access denied.' });
      }

      if (is_enabled !== undefined) {
        await db.run(
          `UPDATE rules SET is_enabled = ?, updated_at = ? WHERE id = ?`,
          [is_enabled ? 1 : 0, new Date().toISOString(), id]
        );
      }

      res.json({ success: true, message: 'Rule updated.' });
    } catch (err) {
      next(err);
    }
  });

  // 4. Delete Custom Rule
  router.delete('/rules/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const userId = req.user!.id;

      const rule = await db.get('SELECT id FROM rules WHERE id = ? AND user_id = ?', [id, userId]);
      if (!rule) {
        return res.status(404).json({ success: false, error: 'Rule not found or access denied.' });
      }

      await db.run('DELETE FROM rules WHERE id = ?', [id]);
      res.json({ success: true, message: 'Rule deleted.' });
    } catch (err) {
      next(err);
    }
  });

  // 5. Get Home Mode
  router.get('/homes/mode', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const home = await db.get(
        'SELECT id, name, current_mode, mode_changed_at, arming_delay_s FROM homes WHERE user_id = ? LIMIT 1',
        [userId]
      );

      res.json({
        success: true,
        current_mode: home?.current_mode || 'home',
        mode_changed_at: home?.mode_changed_at || null,
        arming_delay_s: home?.arming_delay_s || 0
      });
    } catch (err) {
      next(err);
    }
  });

  // 6. Set Home Mode (Home / Away / Night / Disarmed)
  router.post('/homes/mode', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { mode, arming_delay_s } = SetModeSchema.parse(req.body);
      const now = new Date().toISOString();

      const home = await db.get('SELECT id, current_mode FROM homes WHERE user_id = ? LIMIT 1', [userId]);
      if (!home) {
        return res.status(404).json({ success: false, error: 'Home not found.' });
      }

      await db.run(
        `UPDATE homes SET current_mode = ?, mode_changed_at = ?, arming_delay_s = ? WHERE id = ?`,
        [mode, now, arming_delay_s, home.id]
      );

      // Log security event
      await logSecurityEvent(db, {
        userId,
        homeId: home.id,
        eventType: 'mode_changed',
        resourceType: 'home',
        resourceId: home.id,
        details: { previous_mode: home.current_mode, new_mode: mode, arming_delay_s }
      });

      // Broadcast mode change to active dashboards
      if (broadcastFn) {
        broadcastFn(userId, {
          type: 'mode_changed',
          current_mode: mode,
          mode_changed_at: now,
          arming_delay_s
        });
      }

      res.json({
        success: true,
        message: `Home mode changed to ${mode.toUpperCase()}.`,
        current_mode: mode,
        mode_changed_at: now,
        arming_delay_s
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: err.errors[0].message });
      }
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
