import crypto from 'crypto';
import { DatabaseService } from './db.js';
import { logger } from './logger.js';

export interface AuditLogParams {
  userId: string;
  homeId?: string | null;
  eventType: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, any> | null;
  ipAddress?: string | null;
}

/**
 * Appends an immutable security audit event to the security_audit_log table.
 * Audit logs cannot be updated or deleted by normal user operations.
 */
export async function logSecurityEvent(db: DatabaseService, params: AuditLogParams): Promise<void> {
  try {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const detailsJson = params.details ? JSON.stringify(params.details) : null;

    await db.run(
      `INSERT INTO security_audit_log (
        id, user_id, home_id, event_type, resource_type, resource_id, details, ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.userId,
        params.homeId || null,
        params.eventType,
        params.resourceType,
        params.resourceId || null,
        detailsJson,
        params.ipAddress || null,
        createdAt
      ]
    );
  } catch (err: any) {
    logger.warn(`[AuditLog] Failed to record security event '${params.eventType}': ${err.message}`);
  }
}

export const recordAuditLog = logSecurityEvent;

