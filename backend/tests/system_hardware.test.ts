import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { bootstrap } from '../src/server.js';

describe('Phase 10 - Hardware Acceleration & Telemetry Integration', () => {
  let app: any;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const instance = await bootstrap();
    app = instance.app;
  });

  it('exposes /api/system/hardware with hardware acceleration specs and fallback schema', async () => {
    const res = await request(app).get('/api/system/hardware');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('hardware');

    const hw = res.body.hardware;
    expect(hw).toHaveProperty('accelerator');
    expect(hw).toHaveProperty('gpu_available');
    expect(hw).toHaveProperty('device_name');
    expect(hw).toHaveProperty('inference_mode');
    expect(hw).toHaveProperty('target_device');
  });

  it('includes hardware telemetry and module manifest in /api/health endpoint', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('backend', 'online');
    expect(res.body).toHaveProperty('database');
    expect(res.body).toHaveProperty('ai_service');
    expect(res.body).toHaveProperty('hardware');
  });
});
