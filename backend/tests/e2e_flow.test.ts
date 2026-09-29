import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';
import { bootstrap } from '../src/server.js';
import { getSnapshotsDir } from '../src/services/snapshots.js';

describe('Phase 8 - End-to-End Multi-Service System Flow', () => {
  let app: any;
  let server: any;
  let db: any;
  let port: number;

  let homeownerToken: string;
  let homeownerId: string;
  let deviceId: string;
  let deviceToken: string;
  let eventId: string;
  let alertId: string;
  let snapshotFilePath: string;

  const testSuffix = crypto.randomBytes(4).toString('hex');
  const email = `e2e_homeowner_${testSuffix}@safehome.test`;
  const password = 'SecurePassword2026!';
  const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const instance = await bootstrap();
    app = instance.app;
    server = instance.server;
    db = instance.db;

    // Listen on dynamic port for WebSocket tests
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr: any = server.address();
        port = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // Step 1: Homeowner Registration & Profile Setup
  it('Step 1: registers homeowner and provisions profile, home, and default settings', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password,
        full_name: 'E2E Tester'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    homeownerToken = res.body.token;
    homeownerId = res.body.user.id;

    // Verify /api/auth/me returns profile and settings
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${homeownerToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(email);
    expect(meRes.body.home).toBeDefined();
    expect(meRes.body.settings.snapshot_retention_days).toBe(7);
  });

  // Step 2: Device Pairing (6-digit code generation & exchange)
  it('Step 2: generates single-use pairing code and exchanges for device-scoped JWT', async () => {
    // Generate code
    const genRes = await request(app)
      .post('/api/devices/pair/generate')
      .set('Authorization', `Bearer ${homeownerToken}`)
      .send({ device_name: 'E2E Android Camera' });

    expect(genRes.status).toBe(201);
    const code = genRes.body.pairing_code;
    expect(code).toHaveLength(6);

    // Exchange code (Phone calling in)
    const pairRes = await request(app)
      .post('/api/devices/pair')
      .send({ code });

    expect(pairRes.status).toBe(200);
    expect(pairRes.body.success).toBe(true);
    deviceId = pairRes.body.device_id;
    deviceToken = pairRes.body.device_token;
    expect(deviceId).toBeDefined();
    expect(deviceToken).toBeDefined();

    // Verify device is listed in homeowner devices
    const devListRes = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${homeownerToken}`);

    expect(devListRes.status).toBe(200);
    const found = devListRes.body.devices.find((d: any) => d.id === deviceId);
    expect(found).toBeDefined();
    expect(found.name).toBe('E2E Android Camera');
  });

  // Step 3: WebSocket Streaming & Real-Time Detection
  it('Step 3: connects phone camera and dashboard over WebSocket, transmits frames, and relays overlay', async () => {
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    const dashWs = new WebSocket(wsUrl);
    const phoneWs = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { dashWs.terminate(); } catch {}
        try { phoneWs.terminate(); } catch {}
        reject(new Error('WebSocket streaming test timed out'));
      }, 7000);

      dashWs.on('open', () => {
        dashWs.send(JSON.stringify({
          type: 'register_dashboard',
          token: homeownerToken
        }));
      });

      dashWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'dashboard_registered') {
          // Dashboard registered -> register phone
          phoneWs.send(JSON.stringify({
            type: 'register_phone',
            device_id: deviceId,
            token: deviceToken,
            device_name: 'E2E Phone Sensor'
          }));
        }

        if (msg.type === 'live_frame') {
          expect(msg.device_id).toBe(deviceId);
          expect(msg.image).toBe(dummyBase64);
          clearTimeout(timeout);
          dashWs.close();
          phoneWs.close();
          resolve();
        }
      });

      phoneWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'registered') {
          // Phone registered -> send camera frame
          phoneWs.send(JSON.stringify({
            type: 'frame',
            image: dummyBase64,
            timestamp: new Date().toISOString()
          }));
        }
      });

      dashWs.on('error', reject);
      phoneWs.on('error', reject);
    });
  });

  // Step 4: Event Recording & Local Snapshot File Creation
  it('Step 4: records detection event with confidence score and stores snapshot file on local disk', async () => {
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${homeownerToken}`)
      .send({
        device_id: deviceId,
        object_class: 'person',
        confidence: 0.94,
        snapshot_base64: dummyBase64,
        bounding_box: { x: 10, y: 20, width: 100, height: 150 }
      });

    expect(createRes.status).toBe(201);
    eventId = createRes.body.event.id;
    const snapPath = createRes.body.event.snapshot_path;
    expect(snapPath).toBeDefined();

    // Verify snapshot file exists on disk
    const filename = path.basename(snapPath);
    snapshotFilePath = path.join(getSnapshotsDir(), filename);
    expect(fs.existsSync(snapshotFilePath)).toBe(true);

    // Verify safe retrieval via GET
    const fetchRes = await request(app).get(snapPath);
    expect(fetchRes.status).toBe(200);
  });

  // Step 5: Alerts Generation & Viewing
  it('Step 5: creates and retrieves alerts linked to detection events', async () => {
    alertId = crypto.randomUUID();
    await db.run(
      `INSERT INTO alerts (id, user_id, event_id, severity, category, title, message)
       VALUES (?, ?, ?, 'INFO', 'person', 'Person Detected', 'Person observed on E2E camera')`,
      [alertId, homeownerId, eventId]
    );

    const alertsRes = await request(app)
      .get('/api/alerts')
      .set('Authorization', `Bearer ${homeownerToken}`);

    expect(alertsRes.status).toBe(200);
    expect(alertsRes.body.alerts.length).toBeGreaterThanOrEqual(1);
    const foundAlert = alertsRes.body.alerts.find((a: any) => a.id === alertId);
    expect(foundAlert).toBeDefined();
    expect(foundAlert.is_read).toBe(false);

    // Mark alert as read
    const markRes = await request(app)
      .patch(`/api/alerts/${alertId}`)
      .set('Authorization', `Bearer ${homeownerToken}`);

    expect(markRes.status).toBe(200);
    expect(markRes.body.success).toBe(true);
  });

  // Step 6: Human Feedback Loop on Event
  it('Step 6: accepts human feedback (expected) and records it without throwing error', async () => {
    const fbRes = await request(app)
      .patch(`/api/events/${eventId}/feedback`)
      .set('Authorization', `Bearer ${homeownerToken}`)
      .send({ feedback: 'expected' });

    expect(fbRes.status).toBe(200);
    expect(fbRes.body.success).toBe(true);
    expect(fbRes.body.user_feedback).toBe('expected');

    // Verify persisted
    const evRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${homeownerToken}`);

    expect(evRes.body.event.user_feedback).toBe('expected');
  });

  // Step 7: GDPR Data Export
  it('Step 7: exports complete user archive containing profile, devices, events, alerts', async () => {
    const expRes = await request(app)
      .get('/api/settings/export')
      .set('Authorization', `Bearer ${homeownerToken}`);

    expect(expRes.status).toBe(200);
    expect(expRes.body.success).toBe(true);
    expect(expRes.body.profile.email).toBe(email);
    expect(expRes.body.devices.some((d: any) => d.id === deviceId)).toBe(true);
    expect(expRes.body.events.some((e: any) => e.id === eventId)).toBe(true);
    expect(expRes.body.alerts.some((a: any) => a.id === alertId)).toBe(true);
  });

  // Step 8: Event & Snapshot Deletion
  it('Step 8: deleting the event permanently unlinks the snapshot file from disk', async () => {
    expect(fs.existsSync(snapshotFilePath)).toBe(true);

    const delRes = await request(app)
      .delete(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${homeownerToken}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // Assert snapshot file on disk was unlinked
    expect(fs.existsSync(snapshotFilePath)).toBe(false);

    // Assert event is deleted from database
    const checkDb = await db.get('SELECT * FROM events WHERE id = ?', [eventId]);
    expect(checkDb).toBeFalsy();
  });

  // Step 9: Device Unpairing
  it('Step 9: unpairs and removes the device sensor', async () => {
    const unpairRes = await request(app)
      .delete(`/api/devices/${deviceId}`)
      .set('Authorization', `Bearer ${homeownerToken}`);

    expect(unpairRes.status).toBe(200);

    const devRes = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${homeownerToken}`);

    expect(devRes.body.devices.some((d: any) => d.id === deviceId)).toBe(false);
  });
});
