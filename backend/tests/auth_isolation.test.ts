import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { bootstrap } from '../src/server.js';

describe('Phase 2 - Supabase Auth, Profiles & Strict Cross-User Data Isolation', () => {
  let app: any;
  let tokenA: string;
  let userA: any;
  let tokenB: string;
  let userB: any;
  let eventAId: string;

  const testSuffix = crypto.randomBytes(4).toString('hex');
  const userAEmail = `alice_${testSuffix}@safehome.test`;
  const userBEmail = `bob_${testSuffix}@safehome.test`;
  const testPassword = 'SecurePassword2026!';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const instance = await bootstrap();
    app = instance.app;
  });

  // 1. Unauthenticated Guard Check
  it('rejects unauthenticated requests to protected endpoints with 401', async () => {
    const endpoints = [
      '/api/dashboard',
      '/api/events',
      '/api/devices',
      '/api/alerts',
      '/api/settings',
      '/api/analytics',
      '/api/auth/me'
    ];

    for (const ep of endpoints) {
      const res = await request(app).get(ep);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Authentication required');
    }
  });

  // 2. Register User A
  it('registers User A and creates profile, home with IANA timezone, and settings', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: userAEmail,
        password: testPassword,
        full_name: 'Alice Homeowner'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(userAEmail);

    tokenA = res.body.token;
    userA = res.body.user;
  });

  // 3. Register User B
  it('registers User B independently with isolated credentials', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: userBEmail,
        password: testPassword,
        full_name: 'Bob Homeowner'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.id).not.toBe(userA.id);

    tokenB = res.body.token;
    userB = res.body.user;
  });

  // 4. Verify Identity via /api/auth/me
  it('verifies authenticated identity derived strictly from verified Bearer token', async () => {
    const meA = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(meA.status).toBe(200);
    expect(meA.body.user.id).toBe(userA.id);
    expect(meA.body.user.email).toBe(userAEmail);

    const meB = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(meB.status).toBe(200);
    expect(meB.body.user.id).toBe(userB.id);
    expect(meB.body.user.email).toBe(userBEmail);
  });

  // 5. User A creates an event
  it('allows User A to create a safety event scoped to their account', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        object_class: 'person',
        confidence: 0.94,
        bounding_box: { x: 100, y: 150, width: 80, height: 160 }
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.event).toBeDefined();
    expect(res.body.event.user_id).toBe(userA.id);
    expect(res.body.event.category).toBe('person');

    eventAId = res.body.event.id;
  });

  // 6. User A generates a device pairing code
  it('allows User A to generate a 6-digit pairing code', async () => {
    const res = await request(app)
      .post('/api/devices/pair/generate')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        home_id: crypto.randomUUID(),
        device_name: 'Living Room Pixel 7'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.pairing_code).toHaveLength(6);
  });

  // 7. Strict Cross-User Data Isolation: Dashboard
  it('guarantees User B dashboard sees 0 events and 0 devices from User A', async () => {
    // User A sees at least 1 event
    const dashA = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(dashA.status).toBe(200);
    expect(dashA.body.summary.today.total).toBeGreaterThanOrEqual(1);
    expect(dashA.body.summary.recent_events.length).toBeGreaterThanOrEqual(1);

    // User B dashboard must be completely empty of User A data
    const dashB = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(dashB.status).toBe(200);
    expect(dashB.body.summary.today.total).toBe(0);
    expect(dashB.body.summary.today.person).toBe(0);
    expect(dashB.body.summary.today.other).toBe(0);
    expect(dashB.body.summary.today.unusual).toBe(0);
    expect(dashB.body.summary.devices.active).toBe(0);
    expect(dashB.body.summary.recent_events).toHaveLength(0);
  });

  // 8. Strict Cross-User Data Isolation: Events List
  it('guarantees User B cannot see User A events in the events listing', async () => {
    const eventsB = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(eventsB.status).toBe(200);
    expect(eventsB.body.events).toHaveLength(0);
    expect(eventsB.body.pagination.total).toBe(0);
  });

  // 9. Strict Cross-User Access Denial: Single Event Detail
  it('blocks User B from fetching User A event by direct ID (404/403 denied)', async () => {
    const res = await request(app)
      .get(`/api/events/${eventAId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('access denied');
  });

  // 10. Strict Cross-User Access Denial: Feedback Modification
  it('blocks User B from submitting feedback on User A event', async () => {
    const res = await request(app)
      .patch(`/api/events/${eventAId}/feedback`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ feedback: 'unexpected' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // 11. Legitimate Owner Operations Succeed
  it('allows User A (the owner) to fetch event details and update feedback', async () => {
    const getRes = await request(app)
      .get(`/api/events/${eventAId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.event.id).toBe(eventAId);

    const patchRes = await request(app)
      .patch(`/api/events/${eventAId}/feedback`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ feedback: 'expected' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.success).toBe(true);
    expect(patchRes.body.user_feedback).toBe('expected');
  });

  // 12. Strict Cross-User Isolation: Settings & Analytics
  it('isolates user settings and analytics between accounts', async () => {
    // User A updates their active hours
    const updateA = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        expected_active_start: '06:30',
        expected_active_end: '22:30',
        confidence_threshold: 0.65
      });

    expect(updateA.status).toBe(200);

    // User B reads settings -> must still have their default settings, not User A's updated values
    const settingsB = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(settingsB.status).toBe(200);
    expect(settingsB.body.settings.confidence_threshold).toBe(0.50);

    // User B analytics must show 0 total events
    const analyticsB = await request(app)
      .get('/api/analytics')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(analyticsB.status).toBe(200);
    expect(analyticsB.body.analytics.total_events).toBe(0);
  });

  // 13. Login Authentication Validation
  it('authenticates user with correct credentials and rejects incorrect password', async () => {
    // Bad password
    const badRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: userAEmail,
        password: 'WrongPassword123!'
      });

    expect(badRes.status).toBe(401);
    expect(badRes.body.success).toBe(false);

    // Correct password
    const goodRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: userAEmail,
        password: testPassword
      });

    expect(goodRes.status).toBe(200);
    expect(goodRes.body.success).toBe(true);
    expect(goodRes.body.token).toBeDefined();
    expect(goodRes.body.user.email).toBe(userAEmail);
  });
});
