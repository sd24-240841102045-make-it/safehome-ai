import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { bootstrap } from '../src/server.js';
import { config } from '../src/config.js';

describe('Payments & Subscriptions Gateway - Razorpay Integration Tests', () => {
  let app: any;
  let token: string;
  let user: any;

  const testSuffix = crypto.randomBytes(4).toString('hex');
  const userEmail = `payuser_${testSuffix}@safehome.test`;
  const userPassword = 'PaymentPassword2026!';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const instance = await bootstrap();
    app = instance.app;

    // Register test user
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: userEmail,
        password: userPassword,
        full_name: 'Payment Test User'
      });

    token = regRes.body.token;
    user = regRes.body.user;
  });

  it('1. GET /api/payments/config returns public Razorpay config', async () => {
    const res = await request(app).get('/api/payments/config');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.key_id).toBeDefined();
    expect(res.body.data.currency).toBe('INR');
  });

  it('2. GET /api/payments/plans returns all plan tiers with features', async () => {
    const res = await request(app).get('/api/payments/plans');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const planIds = res.body.data.map((p: any) => p.id);
    expect(planIds).toContain('free');
    expect(planIds).toContain('pro');
    expect(planIds).toContain('enterprise');
  });

  it('3. Rejects unauthenticated access to protected payment routes', async () => {
    const protectedRoutes = [
      { method: 'get', path: '/api/payments/subscription' },
      { method: 'get', path: '/api/payments/history' },
      { method: 'post', path: '/api/payments/create-order' },
      { method: 'post', path: '/api/payments/verify' }
    ];

    for (const route of protectedRoutes) {
      const res = await (request(app) as any)[route.method](route.path);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    }
  });

  it('4. GET /api/payments/subscription returns default free tier for new user', async () => {
    const res = await request(app)
      .get('/api/payments/subscription')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.plan_id).toBe('free');
    expect(res.body.data.is_free).toBe(true);
    expect(res.body.data.max_devices).toBe(1);
    expect(res.body.data.history_days).toBe(1);
  });

  let createdOrderId = '';
  let paymentRecordId = '';

  it('5. POST /api/payments/create-order generates a checkout order for Pro Sentinel plan', async () => {
    const res = await request(app)
      .post('/api/payments/create-order')
      .set('Authorization', `Bearer ${token}`)
      .send({
        plan_id: 'pro',
        billing_cycle: 'monthly'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.order_id).toBeDefined();
    expect(res.body.data.amount).toBe(49900); // ₹499.00 in paise
    expect(res.body.data.currency).toBe('INR');

    createdOrderId = res.body.data.order_id;
    paymentRecordId = res.body.data.payment_id;
  });

  it('6. POST /api/payments/verify rejects tampered/invalid cryptographic signatures', async () => {
    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpay_order_id: createdOrderId,
        razorpay_payment_id: 'pay_test_invalid_123',
        razorpay_signature: 'invalid_tampered_signature_hex'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('7. POST /api/payments/verify accepts valid HMAC-SHA256 signature and upgrades subscription', async () => {
    const paymentId = `pay_${crypto.randomBytes(6).toString('hex')}`;
    const validSignature = crypto
      .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
      .update(`${createdOrderId}|${paymentId}`)
      .digest('hex');

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpay_order_id: createdOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.plan_id).toBe('pro');
    expect(res.body.data.plan_name).toBe('Pro Sentinel');
  });

  it('8. GET /api/payments/subscription confirms active Pro tier with extended capacity', async () => {
    const res = await request(app)
      .get('/api/payments/subscription')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.plan_id).toBe('pro');
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.max_devices).toBe(5);
    expect(res.body.data.history_days).toBe(30);
    expect(res.body.data.is_free).toBe(false);
    expect(res.body.data.current_period_end).toBeDefined();
  });

  it('9. GET /api/payments/history returns completed captured payment', async () => {
    const res = await request(app)
      .get('/api/payments/history')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const tx = res.body.data[0];
    expect(tx.status).toBe('captured');
    expect(tx.plan_id).toBe('pro');
    expect(tx.amount).toBe(49900);
  });

  it('10. GET /api/payments/invoice/:id returns formatted invoice with GST details', async () => {
    const res = await request(app)
      .get(`/api/payments/invoice/${paymentRecordId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.invoice_number).toMatch(/^INV-/);
    expect(res.body.data.merchant.name).toBe('SafeHome AI Security Systems');
    expect(res.body.data.merchant.gstin).toBeDefined();
    expect(res.body.data.item.amount_inr).toBe(499);
    expect(res.body.data.customer.email).toBe(userEmail);
  });
});
