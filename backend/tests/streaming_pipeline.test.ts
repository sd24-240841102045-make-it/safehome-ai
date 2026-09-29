import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { WebSocket } from 'ws';
import crypto from 'crypto';
import { bootstrap } from '../src/server.js';

describe('Phase 3 - Phone Pairing, Camera Streaming & Real-Time Detection Pipeline', () => {
  let app: any;
  let server: any;
  let db: any;
  let port: number;
  let token: string;
  let userId: string;
  let pairingCode: string;
  let deviceToken: string;
  let deviceId: string;

  // Tiny 1x1 test JPEG base64
  const testJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const instance = await bootstrap();
    app = instance.app;
    server = instance.server;
    db = instance.db;

    // Start ephemeral server for WebSocket integration tests
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        port = typeof addr === 'object' && addr ? addr.port : 5000;
        resolve();
      });
    });

    // Register a test user
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: `phone_tester_${Date.now()}@safehome.test`,
        password: 'Password2026!',
        full_name: 'Phone Stream Tester'
      });

    token = regRes.body.token;
    userId = regRes.body.user.id;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(resolve));
    }
  });

  // 1. Network Interface Discovery
  it('provides non-internal network IPs with monitor URLs for phone camera access', async () => {
    const res = await request(app).get('/api/network-interfaces');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.local_ips)).toBe(true);
    if (res.body.local_ips.length > 0) {
      expect(res.body.local_ips[0].url_phone_monitor).toContain(':5173/monitor');
    }
  });

  // 2. Generate 6-Digit Pairing Code
  it('generates a single-use 6-digit pairing code with 5-minute expiry', async () => {
    const res = await request(app)
      .post('/api/devices/pair/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ device_name: 'Test Android Sensor' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.pairing_code).toHaveLength(6);
    expect(res.body.expires_at).toBeDefined();

    pairingCode = res.body.pairing_code;
  });

  // 3. Exchange Pairing Code (Phone Calling In)
  it('exchanges the 6-digit code for a device-scoped token and registers device online', async () => {
    const res = await request(app)
      .post('/api/devices/pair')
      .send({ code: pairingCode, device_name: 'Pixel 8 Sensor' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.device_token).toBeDefined();
    expect(res.body.device_id).toBeDefined();

    deviceToken = res.body.device_token;
    deviceId = res.body.device_id;

    // Verify single-use: second exchange must fail with 400
    const reuseRes = await request(app)
      .post('/api/devices/pair')
      .send({ code: pairingCode });

    expect(reuseRes.status).toBe(400);
    expect(reuseRes.body.error).toContain('already used');
  });

  // 4. WebSocket Pairing & Frame Pipeline (Phone -> Backend -> Python AI -> Dashboard)
  it('streams camera frames over WebSocket and broadcasts detections to owner dashboard', async () => {
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    const dashWs = new WebSocket(wsUrl);
    const phoneWs = new WebSocket(wsUrl);

    let dashboardRegistered = false;
    let liveFrameReceived = false;
    let phoneOverlayReceived = false;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        dashWs.close();
        phoneWs.close();
        reject(new Error('WebSocket streaming test timed out'));
      }, 7000);

      // Setup Dashboard Client
      dashWs.on('open', () => {
        dashWs.send(JSON.stringify({
          type: 'register_dashboard',
          token
        }));
      });

      dashWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'dashboard_registered') {
          dashboardRegistered = true;
          // Connect Phone Client once dashboard is registered
          phoneWs.send(JSON.stringify({
            type: 'register_phone',
            device_id: deviceId,
            token: deviceToken,
            device_name: 'Pixel 8 Sensor'
          }));
        }

        if (msg.type === 'live_frame') {
          liveFrameReceived = true;
          expect(msg.device_id).toBe(deviceId);
          expect(msg.image).toBeDefined();
          expect(msg.detections).toBeDefined();

          if (phoneOverlayReceived && liveFrameReceived) {
            clearTimeout(timeout);
            dashWs.close();
            phoneWs.close();
            resolve();
          }
        }
      });

      // Setup Phone Client
      phoneWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'registered') {
          // Phone registered: send live frame packet
          phoneWs.send(JSON.stringify({
            type: 'frame',
            image: testJpeg,
            timestamp: new Date().toISOString()
          }));
        }

        if (msg.type === 'detection_result') {
          phoneOverlayReceived = true;
          expect(Array.isArray(msg.detections)).toBe(true);

          if (phoneOverlayReceived && liveFrameReceived) {
            clearTimeout(timeout);
            dashWs.close();
            phoneWs.close();
            resolve();
          }
        }
      });
    });

    expect(dashboardRegistered).toBe(true);
    expect(phoneOverlayReceived).toBe(true);
    expect(liveFrameReceived).toBe(true);
  });

  // 5. Network Disconnect Handling
  it('updates device status to offline and broadcasts status change when phone disconnects', async () => {
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    const dashWs = new WebSocket(wsUrl);
    const phoneWs = new WebSocket(wsUrl);

    let offlineBroadcastReceived = false;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        dashWs.close();
        phoneWs.close();
        reject(new Error('Disconnect status test timed out'));
      }, 5000);

      let phoneConnected = false;

      dashWs.on('open', () => {
        dashWs.send(JSON.stringify({ type: 'register_dashboard', token }));
      });

      dashWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'dashboard_registered') {
          phoneWs.send(JSON.stringify({
            type: 'register_phone',
            device_id: deviceId,
            token: deviceToken
          }));
        }

        if (phoneConnected && msg.type === 'device_status_change' && msg.status === 'offline') {
          offlineBroadcastReceived = true;
          clearTimeout(timeout);
          dashWs.close();
          resolve();
        }
      });

      phoneWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'registered') {
          phoneConnected = true;
          // Abruptly disconnect phone to trigger offline status change
          phoneWs.close();
        }
      });
    });

    expect(offlineBroadcastReceived).toBe(true);

    // Verify DB reflects offline status
    const devRow = await db.get('SELECT status FROM devices WHERE id = ?', [deviceId]);
    expect(devRow.status).toBe('offline');
  });
});
