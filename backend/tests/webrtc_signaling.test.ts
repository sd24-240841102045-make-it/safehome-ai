import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import crypto from 'crypto';
import request from 'supertest';
import { bootstrap } from '../src/server.js';

describe('Phase 11 - WebRTC P2P Signaling & Media Handshake', () => {
  let app: any;
  let server: any;
  let wss: any;
  let wsPort: number;
  let userToken: string;
  let userId: string;
  let deviceToken: string;
  let deviceId: string;

  const testSuffix = crypto.randomBytes(4).toString('hex');
  const userEmail = `webrtc_${testSuffix}@safehome.test`;
  const userPassword = 'WebRTCPassword2026!';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const instance = await bootstrap();
    app = instance.app;
    server = instance.server;
    wss = instance.wss;

    // Listen on dynamic port for test
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        wsPort = typeof addr === 'object' && addr ? addr.port : 5001;
        resolve();
      });
    });

    // Register user
    const regRes = await request(app).post('/api/auth/register').send({
      email: userEmail,
      password: userPassword,
      full_name: 'WebRTC Tester'
    });
    userToken = regRes.body.token;
    userId = regRes.body.user.id;

    // Generate pairing code
    const codeRes = await request(app)
      .post('/api/devices/pair/generate')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ device_name: 'WebRTC Sensor Phone' });
    const pairingCode = codeRes.body.pairing_code;

    // Pair device
    const pairRes = await request(app).post('/api/devices/pair').send({ code: pairingCode });
    deviceToken = pairRes.body.device_token;
    deviceId = pairRes.body.device_id;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('routes webrtc_offer from phone to connected dashboards and receives webrtc_answer back', async () => {
    const wsUrl = `ws://localhost:${wsPort}/ws`;

    // 1. Connect dashboard client
    const dashWs = new WebSocket(wsUrl);
    await new Promise<void>((resolve) => dashWs.on('open', resolve));
    dashWs.send(JSON.stringify({ type: 'register_dashboard', token: userToken }));

    // 2. Connect phone camera client
    const phoneWs = new WebSocket(wsUrl);
    await new Promise<void>((resolve) => phoneWs.on('open', resolve));
    phoneWs.send(JSON.stringify({ type: 'register_phone', token: deviceToken, device_id: deviceId }));

    // Wait for registration
    await new Promise((r) => setTimeout(r, 100));

    // 3. Phone sends webrtc_offer
    const mockOfferSdp = { type: 'offer', sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' };
    const offerPromise = new Promise<any>((resolve) => {
      dashWs.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'webrtc_offer') resolve(msg);
      });
    });

    phoneWs.send(JSON.stringify({
      type: 'webrtc_offer',
      device_id: deviceId,
      sdp: mockOfferSdp
    }));

    const receivedOffer = await offerPromise;
    expect(receivedOffer.type).toBe('webrtc_offer');
    expect(receivedOffer.device_id).toBe(deviceId);
    expect(receivedOffer.sdp).toEqual(mockOfferSdp);

    // 4. Dashboard sends webrtc_answer back
    const mockAnswerSdp = { type: 'answer', sdp: 'v=0\r\no=- 67890 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' };
    const answerPromise = new Promise<any>((resolve) => {
      phoneWs.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'webrtc_answer') resolve(msg);
      });
    });

    dashWs.send(JSON.stringify({
      type: 'webrtc_answer',
      device_id: deviceId,
      sdp: mockAnswerSdp
    }));

    const receivedAnswer = await answerPromise;
    expect(receivedAnswer.type).toBe('webrtc_answer');
    expect(receivedAnswer.sdp).toEqual(mockAnswerSdp);

    // 5. ICE candidate exchange
    const mockCandidate = { candidate: 'candidate:1 1 UDP 2130706431 192.168.1.50 50000 typ host', sdpMid: '0' };
    const icePromise = new Promise<any>((resolve) => {
      dashWs.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'webrtc_ice_candidate') resolve(msg);
      });
    });

    phoneWs.send(JSON.stringify({
      type: 'webrtc_ice_candidate',
      device_id: deviceId,
      candidate: mockCandidate
    }));

    const receivedIce = await icePromise;
    expect(receivedIce.type).toBe('webrtc_ice_candidate');
    expect(receivedIce.candidate).toEqual(mockCandidate);

    dashWs.close();
    phoneWs.close();
  });
});
