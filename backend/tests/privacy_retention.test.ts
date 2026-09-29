import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { bootstrap } from '../src/server.js';
import { saveSnapshot, deleteSnapshot, getSnapshotFilePath, getSnapshotsDir } from '../src/services/snapshots.js';
import { purgeExpiredData } from '../src/services/retention.js';

describe('Phase 5 - Privacy, Security, Data Retention & Polish', () => {
  let app: any;
  let db: any;
  let userToken: string;
  let userId: string;

  const testSuffix = crypto.randomBytes(4).toString('hex');
  const userEmail = `privacy_${testSuffix}@safehome.test`;
  const userPassword = 'PrivacyPassword2026!';
  const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const instance = await bootstrap();
    app = instance.app;
    db = instance.db;

    // Register test user
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: userEmail,
        password: userPassword,
        full_name: 'Privacy User'
      });

    expect(regRes.status).toBe(201);
    userToken = regRes.body.token;
    userId = regRes.body.user.id;
  });

  // 1. Snapshot creation and safe storage on disk
  it('saves snapshot image safely on local disk when event is created', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        object_class: 'person',
        confidence: 0.92,
        snapshot_base64: dummyBase64
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const event = res.body.event;
    expect(event.snapshot_path).toBeDefined();
    expect(event.snapshot_path).toContain('/snapshots/');

    // Verify file exists on local disk
    const filename = path.basename(event.snapshot_path);
    const filePath = path.join(getSnapshotsDir(), filename);
    expect(fs.existsSync(filePath)).toBe(true);

    // Verify safe retrieval via GET /snapshots/:filename
    const fetchRes = await request(app).get(event.snapshot_path);
    expect(fetchRes.status).toBe(200);
  });

  // 2. Path Traversal Protection
  it('blocks directory traversal attempts on snapshot retrieval', async () => {
    const badPaths = [
      '/snapshots/..%2f..%2fserver.ts',
      '/snapshots/....//....//package.json',
      '/snapshots/%2e%2e%2fconfig.ts'
    ];

    for (const p of badPaths) {
      const res = await request(app).get(p);
      expect(res.status).toBe(404);
    }
  });

  // 3. Deleting an event deletes its local snapshot file from disk
  it('unlinks snapshot file from disk when the event is deleted', async () => {
    // Create an event with a snapshot
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        object_class: 'dog',
        confidence: 0.88,
        snapshot_base64: dummyBase64
      });

    expect(createRes.status).toBe(201);
    const eventId = createRes.body.event.id;
    const snapshotPath = createRes.body.event.snapshot_path;
    const filename = path.basename(snapshotPath);
    const filePath = path.join(getSnapshotsDir(), filename);
    expect(fs.existsSync(filePath)).toBe(true);

    // Delete event
    const delRes = await request(app)
      .delete(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // Assert file was unlinked from disk
    expect(fs.existsSync(filePath)).toBe(false);

    // Assert record is gone from DB
    const checkDb = await db.get('SELECT * FROM events WHERE id = ?', [eventId]);
    expect(checkDb).toBeFalsy();
  });

  // 4. Data retention purge: snapshots older than N days (default 7)
  it('purges snapshot files older than retention policy (7 days) without losing event metadata', async () => {
    const oldEventId = crypto.randomUUID();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    // Save snapshot on disk
    const savedPath = await saveSnapshot(oldEventId, dummyBase64);
    const diskPath = path.join(getSnapshotsDir(), path.basename(savedPath));
    expect(fs.existsSync(diskPath)).toBe(true);

    // Insert historical event from 10 days ago
    await db.run(
      `INSERT INTO events (
        id, user_id, event_type, object_class, category, confidence, started_at, snapshot_path, is_unusual
      ) VALUES (?, ?, 'person_detected', 'person', 'person', 0.85, ?, ?, 0)`,
      [oldEventId, userId, tenDaysAgo, savedPath]
    );

    // Execute purge on demand via POST /api/settings/purge
    const purgeRes = await request(app)
      .post('/api/settings/purge')
      .set('Authorization', `Bearer ${userToken}`);

    expect(purgeRes.status).toBe(200);
    expect(purgeRes.body.success).toBe(true);
    expect(purgeRes.body.purged.deleted_snapshots).toBeGreaterThanOrEqual(1);

    // Assert snapshot file on disk was removed
    expect(fs.existsSync(diskPath)).toBe(false);

    // Assert event still exists in DB but snapshot_path is now null
    const eventRow = await db.get('SELECT id, snapshot_path FROM events WHERE id = ?', [oldEventId]);
    expect(eventRow).toBeDefined();
    expect(eventRow.snapshot_path).toBeNull();
  });

  // 5. Data retention purge: events older than M days (default 90)
  it('purges events and linked alerts older than event retention policy (90 days)', async () => {
    const ancientEventId = crypto.randomUUID();
    const ancientAlertId = crypto.randomUUID();
    const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();

    // Insert 100-day-old event
    await db.run(
      `INSERT INTO events (
        id, user_id, event_type, object_class, category, confidence, started_at, is_unusual
      ) VALUES (?, ?, 'cat_detected', 'cat', 'animal', 0.90, ?, 0)`,
      [ancientEventId, userId, hundredDaysAgo]
    );

    // Insert associated alert
    await db.run(
      `INSERT INTO alerts (id, user_id, event_id, severity, category, title, message)
       VALUES (?, ?, ?, 'INFO', 'animal', 'Cat Observed', 'Test ancient alert')`,
      [ancientAlertId, userId, ancientEventId]
    );

    // Run purge
    const result = await purgeExpiredData(db, userId);
    expect(result.deletedEvents).toBeGreaterThanOrEqual(1);

    // Assert event is deleted
    const eventRow = await db.get('SELECT id FROM events WHERE id = ?', [ancientEventId]);
    expect(eventRow).toBeFalsy();

    // Assert linked alert is deleted
    const alertRow = await db.get('SELECT id FROM alerts WHERE id = ?', [ancientAlertId]);
    expect(alertRow).toBeFalsy();
  });

  // 6. GDPR Data Export
  it('exports complete user data archive in GDPR compliant JSON format', async () => {
    const exportRes = await request(app)
      .get('/api/settings/export')
      .set('Authorization', `Bearer ${userToken}`);

    expect(exportRes.status).toBe(200);
    expect(exportRes.body.success).toBe(true);
    expect(exportRes.body.gdpr_notice).toBeDefined();
    expect(exportRes.body.exported_at).toBeDefined();
    expect(exportRes.body.profile).toBeDefined();
    expect(exportRes.body.profile.email).toBe(userEmail);
    expect(Array.isArray(exportRes.body.homes)).toBe(true);
    expect(Array.isArray(exportRes.body.devices)).toBe(true);
    expect(Array.isArray(exportRes.body.events)).toBe(true);
    expect(Array.isArray(exportRes.body.alerts)).toBe(true);
  });

  // 7. Rate Limiting on Pairing Endpoint
  it('enforces rate limits and returns 429 when request threshold is exceeded', async () => {
    // 15 requests allowed per 15 minutes on /api/devices/pair
    let hitRateLimit = false;

    for (let i = 0; i < 18; i++) {
      const res = await request(app)
        .post('/api/devices/pair')
        .send({ code: 'BAD000' });

      if (res.status === 429) {
        hitRateLimit = true;
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('Too many');
        break;
      }
    }

    expect(hitRateLimit).toBe(true);
  });
});
