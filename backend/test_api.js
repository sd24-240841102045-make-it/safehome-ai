/**
 * SafeHome AI - Automated API Test Suite
 * Tests authentication, devices, events, alerts, analytics, and health endpoints.
 */

const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('🧪 Starting SafeHome AI Automated Verification Tests...\n');
  let passCount = 0;
  let failCount = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passCount++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name} ->`, err.message);
      failCount++;
    }
  }

  // 1. Health endpoint
  await test('GET /health returns healthy status', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    const data = await res.json();
    if (!res.ok || data.backend !== 'online') throw new Error(`Unexpected health: ${JSON.stringify(data)}`);
  });

  // 2. Network interfaces
  await test('GET /network-interfaces returns local IPs', async () => {
    const res = await fetch('http://localhost:5000/api/network-interfaces');
    const data = await res.json();
    if (!res.ok || !data.success || !Array.isArray(data.local_ips)) throw new Error('Failed to retrieve IPs');
  });

  // 3. Login with Seeded Demo User
  let token = '';
  await test('POST /auth/login authenticates demo homeowner', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@safehome.local', password: 'SafeHome@2026' })
    });
    const data = await res.json();
    if (!res.ok || !data.success || !data.token) throw new Error(data.error || 'Login failed');
    token = data.token;
  });

  // 4. Authenticated Profile
  await test('GET /auth/me returns homeowner profile', async () => {
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok || !data.success || !data.user) throw new Error('Failed to fetch profile');
  });

  // 5. Register Device
  let deviceId = '';
  await test('POST /devices registers a phone camera node', async () => {
    const res = await fetch(`${BASE_URL}/devices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name: 'Pixel 8 Pro Test Node', device_type: 'phone_camera' })
    });
    const data = await res.json();
    if (!res.ok || !data.success || !data.device) throw new Error('Device registration failed');
    deviceId = data.device.id;
  });

  // 6. Record Detection Event
  let eventId = '';
  await test('POST /events stores detection event', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        device_id: deviceId,
        object_class: 'person',
        confidence: 0.94,
        location_label: 'Front Door',
        bounding_box: { x: 100, y: 50, width: 220, height: 380 }
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success || !data.event) throw new Error('Event persistence failed');
    eventId = data.event.id;
  });

  // 7. Query Event History
  await test('GET /events retrieves stored events with pagination', async () => {
    const res = await fetch(`${BASE_URL}/events?limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok || !data.success || !Array.isArray(data.events)) throw new Error('Events query failed');
    if (data.events.length === 0) throw new Error('No events returned');
  });

  // 8. Query Alerts
  await test('GET /alerts lists security notifications', async () => {
    const res = await fetch(`${BASE_URL}/alerts`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok || !data.success || !Array.isArray(data.alerts)) throw new Error('Alerts query failed');
  });

  // 9. Dashboard Analytics Summary
  await test('GET /analytics/dashboard returns calculated counts', async () => {
    const res = await fetch(`${BASE_URL}/analytics/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok || !data.success || data.summary.today.total === undefined) throw new Error('Summary failed');
  });

  // 10. Data Science Analytics Charts
  await test('GET /analytics returns hourly, type, and confidence metrics', async () => {
    const res = await fetch(`${BASE_URL}/analytics`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok || !data.success || !Array.isArray(data.analytics.events_by_hour)) throw new Error('Analytics failed');
  });

  // 11. Update Settings
  await test('PUT /settings updates active hours and sensitivity', async () => {
    const res = await fetch(`${BASE_URL}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        expected_active_start: '06:30',
        expected_active_end: '22:30',
        confidence_threshold: 0.60
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error('Settings update failed');
  });

  console.log(`\n========================================`);
  console.log(`🎯 Test Summary: ${passCount} Passed, ${failCount} Failed`);
  console.log(`========================================\n`);

  if (failCount > 0) process.exit(1);
}

runTests();
