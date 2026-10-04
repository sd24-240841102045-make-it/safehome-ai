import { DatabaseService } from './db.js';

export interface DetectionContext {
  userId: string;
  homeId?: string | null;
  category: string;
  objectClass: string;
  confidence: number;
  currentMode: string; // 'home' | 'away' | 'night' | 'disarmed'
  isQuietHours: boolean;
}

export interface RuleEvaluationResult {
  shouldAlert: boolean;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  action: 'alert' | 'alarm' | 'log_only';
  title: string;
  message: string;
  ruleId?: string | null;
}

export async function evaluateDetectionRules(
  db: DatabaseService,
  ctx: DetectionContext
): Promise<RuleEvaluationResult> {
  // 1. If Disarmed, suppress all alert notifications (log only)
  if (ctx.currentMode === 'disarmed') {
    return {
      shouldAlert: false,
      severity: 'INFO',
      action: 'log_only',
      title: `${capitalize(ctx.objectClass)} Detected`,
      message: `Activity logged in Disarmed mode.`
    };
  }

  // 2. Fetch custom active rules for this user
  try {
    const rules = await db.query(
      `SELECT id, name, modes, target_categories, min_confidence, severity, action
       FROM rules
       WHERE user_id = ? AND is_enabled = 1
       ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END ASC`,
      [ctx.userId]
    );

    for (const rule of rules) {
      const modes: string[] = typeof rule.modes === 'string' ? JSON.parse(rule.modes) : rule.modes || [];
      const categories: string[] = typeof rule.target_categories === 'string' ? JSON.parse(rule.target_categories) : rule.target_categories || [];
      const minConf = rule.min_confidence ?? 0.50;

      if (
        modes.includes(ctx.currentMode) &&
        categories.includes(ctx.category) &&
        ctx.confidence >= minConf
      ) {
        return {
          shouldAlert: rule.action !== 'log_only',
          severity: rule.severity,
          action: rule.action,
          title: rule.name,
          message: `${capitalize(ctx.objectClass)} detected (${Math.round(ctx.confidence * 100)}% confidence) under "${rule.name}" rule in ${ctx.currentMode.toUpperCase()} mode.`,
          ruleId: rule.id
        };
      }
    }
  } catch {
    // Fall back to built-in rules if table query error
  }

  // 3. Concealed / Masked Face Security Rule (triggers in home, away, and night modes)
  if (ctx.objectClass === 'masked_person' || ctx.category === 'threat') {
    return {
      shouldAlert: true,
      severity: 'CRITICAL',
      action: 'alarm',
      title: '🚨 Concealed / Masked Face Detected',
      message: 'Person with face mask or half-face visible detected on camera. Security alert triggered.'
    };
  }

  // 4. Built-in Default Safety Rule Matrix
  if (ctx.currentMode === 'away') {
    if (ctx.category === 'person') {
      return {
        shouldAlert: true,
        severity: 'CRITICAL',
        action: 'alarm',
        title: '🚨 Intrusion Alert (Away Mode)',
        message: `Person detected while home is armed in Away mode.`
      };
    }
    if (ctx.category === 'vehicle') {
      return {
        shouldAlert: true,
        severity: 'WARNING',
        action: 'alert',
        title: 'Vehicle Detected (Away Mode)',
        message: `Vehicle movement detected while home is in Away mode.`
      };
    }
  }

  if (ctx.currentMode === 'night' || ctx.isQuietHours) {
    if (ctx.category === 'person') {
      return {
        shouldAlert: true,
        severity: 'WARNING',
        action: 'alert',
        title: 'Night Activity Detected',
        message: `Person detected during quiet/night hours.`
      };
    }
  }

  // Standard Home mode
  if (ctx.category === 'person') {
    return {
      shouldAlert: true,
      severity: 'INFO',
      action: 'alert',
      title: 'Person Detected',
      message: `Person observed in camera view.`
    };
  }

  if (ctx.category === 'vehicle') {
    return {
      shouldAlert: true,
      severity: 'INFO',
      action: 'alert',
      title: 'Vehicle Detected',
      message: `Vehicle observed in camera view.`
    };
  }

  return {
    shouldAlert: false,
    severity: 'INFO',
    action: 'log_only',
    title: `${capitalize(ctx.objectClass)} Detected`,
    message: `${capitalize(ctx.objectClass)} observed in camera view.`
  };
}

function capitalize(s: string) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
