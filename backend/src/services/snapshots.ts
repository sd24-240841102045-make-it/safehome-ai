import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

// Base snapshots directory: backend/data/snapshots
const SNAPSHOTS_DIR = path.resolve(process.cwd(), 'data', 'snapshots');

/**
 * Ensures the snapshots storage directory exists
 */
export function ensureSnapshotDirExists(): void {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    logger.info(`[Snapshots] Initialized snapshots directory at: ${SNAPSHOTS_DIR}`);
  }
}

/**
 * Safely saves a base64 encoded image to the local snapshots folder
 * @param eventId The UUID of the event
 * @param base64Data Raw base64 string or data URL
 * @returns Relative URL path e.g. /snapshots/<eventId>.jpg
 */
export async function saveSnapshot(eventId: string, base64Data: string): Promise<string> {
  ensureSnapshotDirExists();

  // Strip optional data URL prefix
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');

  // Sanitize filename to prevent directory traversal
  const safeFilename = `${eventId.replace(/[^a-zA-Z0-9_-]/g, '')}.jpg`;
  const filePath = path.join(SNAPSHOTS_DIR, safeFilename);

  await fs.promises.writeFile(filePath, buffer);
  return `/snapshots/${safeFilename}`;
}

/**
 * Safely deletes a snapshot image from local disk
 * @param snapshotPath The relative or filename path e.g. /snapshots/<id>.jpg
 * @returns true if deleted, false if file did not exist
 */
export function deleteSnapshot(snapshotPath: string | null | undefined): boolean {
  if (!snapshotPath) return false;

  try {
    const filename = path.basename(snapshotPath);
    // Validate filename format (UUID or alphanumeric + extension)
    if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png)$/i.test(filename)) {
      return false;
    }

    const filePath = path.join(SNAPSHOTS_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`[Snapshots] Deleted snapshot file: ${filename}`);
      return true;
    }
  } catch (err: any) {
    logger.error(`[Snapshots] Failed to delete snapshot ${snapshotPath}:`, err.message);
  }
  return false;
}

/**
 * Validates and resolves the absolute path of a snapshot file
 * Prevents directory traversal attacks
 */
export function getSnapshotFilePath(filename: string): string | null {
  if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png)$/i.test(filename)) {
    return null;
  }

  const resolved = path.resolve(SNAPSHOTS_DIR, filename);
  // Ensure the resolved path is strictly within SNAPSHOTS_DIR
  if (!resolved.startsWith(SNAPSHOTS_DIR)) {
    return null;
  }

  if (fs.existsSync(resolved)) {
    return resolved;
  }

  return null;
}

export function getSnapshotsDir(): string {
  return SNAPSHOTS_DIR;
}
