import { DatabaseService } from './db.js';
import { deleteSnapshot } from './snapshots.js';
import { logger } from './logger.js';

export interface PurgeResult {
  deletedSnapshots: number;
  deletedEvents: number;
}

/**
 * Enforces privacy and retention rules by purging:
 * 1. Snapshot image files older than `snapshot_retention_days` (default 7 days)
 * 2. Historical events and their associated alerts older than `event_retention_days` (default 90 days)
 *
 * @param db DatabaseService instance
 * @param targetUserId Optional user ID. If provided, purges strictly for this user; otherwise purges for all users.
 */
export async function purgeExpiredData(db: DatabaseService, targetUserId?: string): Promise<PurgeResult> {
  let deletedSnapshots = 0;
  let deletedEvents = 0;

  try {
    // 1. Determine target users
    const users: Array<{ id: string }> = targetUserId
      ? [{ id: targetUserId }]
      : await db.query('SELECT id FROM profiles');

    for (const u of users) {
      const userId = u.id;

      // 2. Fetch user retention settings
      const settings = await db.get(
        'SELECT snapshot_retention_days, event_retention_days FROM user_settings WHERE user_id = ?',
        [userId]
      );

      const snapshotDays = settings?.snapshot_retention_days ?? 7;
      const eventDays = settings?.event_retention_days ?? 90;

      const nowMs = Date.now();
      const snapshotCutoff = new Date(nowMs - snapshotDays * 24 * 60 * 60 * 1000).toISOString();
      const eventCutoff = new Date(nowMs - eventDays * 24 * 60 * 60 * 1000).toISOString();

      // 3. Purge expired snapshots for events older than snapshot cutoff
      const expiredSnapshotRows = await db.query(
        `SELECT id, snapshot_path FROM events
         WHERE user_id = ? AND snapshot_path IS NOT NULL AND started_at < ?`,
        [userId, snapshotCutoff]
      );

      for (const row of expiredSnapshotRows) {
        if (row.snapshot_path) {
          deleteSnapshot(row.snapshot_path);
          await db.run('UPDATE events SET snapshot_path = NULL WHERE id = ?', [row.id]);
          deletedSnapshots++;
        }
      }

      // 4. Purge expired events older than event cutoff
      const expiredEventRows = await db.query(
        `SELECT id, snapshot_path FROM events
         WHERE user_id = ? AND started_at < ?`,
        [userId, eventCutoff]
      );

      for (const row of expiredEventRows) {
        if (row.snapshot_path) {
          deleteSnapshot(row.snapshot_path);
          deletedSnapshots++;
        }
        // Remove associated alerts
        await db.run('DELETE FROM alerts WHERE event_id = ?', [row.id]);
      }

      if (expiredEventRows.length > 0) {
        await db.run(
          'DELETE FROM events WHERE user_id = ? AND started_at < ?',
          [userId, eventCutoff]
        );
        deletedEvents += expiredEventRows.length;
      }
    }

    logger.info(
      `[Retention] Purge completed. Deleted ${deletedSnapshots} snapshots and ${deletedEvents} events.`
    );
  } catch (err: any) {
    logger.error('[Retention] Error running data retention purge:', err.message);
    throw err;
  }

  return { deletedSnapshots, deletedEvents };
}

/**
 * Starts a background timer that runs purge periodically
 */
export function scheduleRetentionJob(db: DatabaseService, intervalHours = 24): NodeJS.Timeout {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  logger.info(`[Retention] Automated data retention job scheduled every ${intervalHours} hours.`);

  const timer = setInterval(async () => {
    try {
      await purgeExpiredData(db);
    } catch (err: any) {
      logger.error('[Retention] Scheduled retention run failed:', err.message);
    }
  }, intervalMs);

  if (timer.unref) {
    timer.unref();
  }

  return timer;
}
