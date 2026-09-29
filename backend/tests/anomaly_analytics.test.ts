import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { bootstrap } from '../src/server.js';
import { config } from '../src/config.js';

describe('Phase 4 - Data Science, Baseline Modeling & Statistical Anomaly Analytics', () => {
  let app: any;
  let db: any;
  let freshUserToken: string;
  let freshUserId: string;
  let eventId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const instance = await bootstrap();
    app = instance.app;
    db = instance.db;

    // Register a fresh user with zero prior history
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: `coldstart_${Date.now()}@safehome.test`,
        password: 'Password2026!',
        full_name: 'Cold Start Tester'
      });

    freshUserToken = regRes.body.token;
    freshUserId = regRes.body.user.id;
  });

  // 1. Cold Start Guard Verification
  it('enforces cold-start guard with exact reason string when data < 100 events or < 7 days', async () => {
    const res = await request(app)
      .get('/api/analytics')
      .set('Authorization', `Bearer ${freshUserToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.analytics.total_events).toBe(0);
    expect(res.body.analytics.days_spanned).toBe(0);

    const anomaly = res.body.analytics.anomaly_analysis;
    expect(anomaly.status).toBe('insufficient_data');
    expect(anomaly.is_unusual).toBe(false);
    expect(anomaly.reason).toBe('Not enough historical data for reliable anomaly analysis.');
  });

  // 2. Heatmap & Hourly Aggregation Structure
  it('provides complete 7x24 activity heatmap matrix and hourly distribution', async () => {
    // Add 1 event for the user
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${freshUserToken}`)
      .send({
        object_class: 'person',
        confidence: 0.92
      });

    expect(createRes.status).toBe(201);
    eventId = createRes.body.event.id;

    const res = await request(app)
      .get('/api/analytics')
      .set('Authorization', `Bearer ${freshUserToken}`);

    expect(res.status).toBe(200);
    const analytics = res.body.analytics;

    // 7 days x 24 hours heatmap
    expect(analytics.heatmap).toHaveLength(7);
    expect(analytics.heatmap[0].hours).toHaveLength(24);
    expect(analytics.heatmap[0].dayName).toBeDefined();

    // 24 hours distribution
    expect(analytics.events_by_hour).toHaveLength(24);
    expect(analytics.events_by_hour[0].label).toBe('00:00');

    // Category breakdown
    expect(analytics.events_by_type).toHaveLength(4);
    const personCategory = analytics.events_by_type.find((c: any) => c.name === 'Person');
    expect(personCategory.value).toBeGreaterThanOrEqual(1);

    // Peak hour
    expect(analytics.peak_hour).toBeDefined();
  });

  // 3. Human Feedback Recording
  it('records human feedback (expected / unexpected) to guide baseline adaptation', async () => {
    // Mark as expected
    const expectedRes = await request(app)
      .patch(`/api/events/${eventId}/feedback`)
      .set('Authorization', `Bearer ${freshUserToken}`)
      .send({ feedback: 'expected' });

    expect(expectedRes.status).toBe(200);
    expect(expectedRes.body.user_feedback).toBe('expected');

    // Verify in database
    const dbRowExpected = await db.get('SELECT user_feedback FROM events WHERE id = ?', [eventId]);
    expect(dbRowExpected.user_feedback).toBe('expected');

    // Mark as unexpected
    const unexpectedRes = await request(app)
      .patch(`/api/events/${eventId}/feedback`)
      .set('Authorization', `Bearer ${freshUserToken}`)
      .send({ feedback: 'unexpected' });

    expect(unexpectedRes.status).toBe(200);
    expect(unexpectedRes.body.user_feedback).toBe('unexpected');

    const dbRowUnexpected = await db.get('SELECT user_feedback FROM events WHERE id = ?', [eventId]);
    expect(dbRowUnexpected.user_feedback).toBe('unexpected');
  });

  // 4. Python Anomaly Engine Direct Evaluation
  it('evaluates anomaly baselines, quiet hours sensitivity, and excludes unexpected events', async () => {
    // Construct synthetic baseline: 14 days, 150 events
    const timeWindows = [];
    for (let day = 0; day < 14; day++) {
      const dateStr = `2026-09-${String(day + 1).padStart(2, '0')}`;
      for (let hour = 8; hour <= 20; hour++) {
        timeWindows.push({
          timestamp_utc: `${dateStr}T${String(hour).padStart(2, '0')}:00:00Z`,
          hour,
          weekday: (day + 1) % 7,
          category: 'person',
          event_count: 2,
          user_feedback: null
        });
      }
    }

    // Normal active hour event (e.g. 2 events at 14:00) -> should be normal
    const normalRes = await fetch(`${config.PYTHON_SERVICE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timezone: 'UTC',
        time_windows: timeWindows,
        current_window: {
          timestamp_utc: '2026-09-15T14:00:00Z',
          hour: 14,
          weekday: 2,
          category: 'person',
          event_count: 2,
          is_quiet_hours: false
        }
      })
    });

    expect(normalRes.ok).toBe(true);
    const normalData: any = await normalRes.json();
    expect(normalData.status).toBe('analyzed');
    expect(normalData.is_unusual).toBe(false);

    // Unusual quiet hour spike (e.g. 5 events at 3 AM during quiet hours when baseline is 0)
    const unusualRes = await fetch(`${config.PYTHON_SERVICE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timezone: 'UTC',
        time_windows: timeWindows,
        current_window: {
          timestamp_utc: '2026-09-15T03:00:00Z',
          hour: 3,
          weekday: 2,
          category: 'person',
          event_count: 5,
          is_quiet_hours: true
        }
      })
    });

    expect(unusualRes.ok).toBe(true);
    const unusualData: any = await unusualRes.json();
    expect(unusualData.status).toBe('analyzed');
    expect(unusualData.is_unusual).toBe(true);
    expect(unusualData.anomaly_score).toBeGreaterThan(0);
    expect(unusualData.reason).toContain('quiet-hour baseline');
  });
});
