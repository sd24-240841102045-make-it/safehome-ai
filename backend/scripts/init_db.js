import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const isBackendDir = process.cwd().endsWith('backend');
const DB_PATH = path.resolve(
  isBackendDir ? process.cwd() : path.join(process.cwd(), 'backend'),
  'safehome.sqlite'
);

console.log(`[Database Recreator] Target database: ${DB_PATH}`);

// 1. Remove old database file if present for a clean recreation
if (fs.existsSync(DB_PATH)) {
  try {
    fs.unlinkSync(DB_PATH);
    console.log('[Database Recreator] Removed stale safehome.sqlite');
  } catch (err) {
    console.warn(`[Database Recreator] Warning removing old db: ${err.message}`);
  }
}

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new sqlite3.Database(DB_PATH);

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });

async function recreateDatabase() {
  console.log('[Database Recreator] Creating 15 canonical tables and performance indexes...');

  const schemaStatements = [
    // 1. PROFILES
    `CREATE TABLE profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      role TEXT DEFAULT 'homeowner',
      password_hash TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    // 2. HOMES
    `CREATE TABLE homes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      timezone TEXT DEFAULT 'UTC',
      active_hours_start TEXT DEFAULT '07:00',
      active_hours_end TEXT DEFAULT '23:00',
      current_mode TEXT DEFAULT 'home',
      mode_changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      arming_delay_s INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,

    // 3. DEVICES
    `CREATE TABLE devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      home_id TEXT,
      name TEXT NOT NULL,
      device_type TEXT DEFAULT 'phone_camera',
      status TEXT DEFAULT 'offline',
      ip_address TEXT,
      user_agent TEXT,
      last_seen TEXT,
      last_heartbeat_at TEXT,
      battery_level REAL,
      battery_charging INTEGER DEFAULT 0,
      network_online INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,

    // 4. DEVICE STATUS (Live Telemetry)
    `CREATE TABLE device_status (
      device_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      home_id TEXT,
      status TEXT DEFAULT 'offline',
      battery_level REAL,
      battery_charging INTEGER DEFAULT 0,
      network_online INTEGER DEFAULT 1,
      last_heartbeat_at TEXT,
      last_frame_at TEXT,
      fps REAL DEFAULT 0.0,
      latency_ms REAL DEFAULT 0.0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,

    // 5. PAIRING CODES
    `CREATE TABLE pairing_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      home_id TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      device_name TEXT DEFAULT 'Android Phone Sensor',
      expires_at TEXT NOT NULL,
      is_used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,

    // 6. EVENTS
    `CREATE TABLE events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      home_id TEXT,
      device_id TEXT,
      event_type TEXT NOT NULL,
      object_class TEXT NOT NULL,
      category TEXT NOT NULL,
      confidence REAL NOT NULL,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      frame_count INTEGER DEFAULT 1,
      snapshot_path TEXT,
      is_unusual INTEGER DEFAULT 0,
      anomaly_score REAL DEFAULT 0.0,
      anomaly_reason TEXT,
      user_feedback TEXT,
      feedback_reason TEXT,
      bbox_x REAL,
      bbox_y REAL,
      bbox_w REAL,
      bbox_h REAL,
      frame_width INTEGER,
      frame_height INTEGER,
      metadata TEXT,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,

    // 7. ALERTS
    `CREATE TABLE alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event_id TEXT,
      severity TEXT NOT NULL DEFAULT 'WARNING',
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      is_resolved INTEGER DEFAULT 0,
      resolved_at TEXT,
      occurrence_count INTEGER DEFAULT 1,
      dedupe_key TEXT,
      last_seen TEXT,
      rule_id TEXT,
      suppressed_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,

    // 8. USER SETTINGS
    `CREATE TABLE user_settings (
      user_id TEXT PRIMARY KEY,
      expected_active_start TEXT DEFAULT '07:00',
      expected_active_end TEXT DEFAULT '23:00',
      notification_quiet_hours_start TEXT DEFAULT '22:00',
      notification_quiet_hours_end TEXT DEFAULT '07:00',
      confidence_threshold REAL DEFAULT 0.50,
      event_cooldown_sec INTEGER DEFAULT 30,
      snapshot_retention_days INTEGER DEFAULT 7,
      event_retention_days INTEGER DEFAULT 90,
      save_snapshots INTEGER DEFAULT 1,
      opt_in_live_preview INTEGER DEFAULT 0,
      audio_enabled INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,

    // 9. MONITORING SESSIONS
    `CREATE TABLE monitoring_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      home_id TEXT,
      device_id TEXT,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      ended_at TEXT,
      duration_seconds INTEGER DEFAULT 0,
      frame_count INTEGER DEFAULT 0,
      drop_count INTEGER DEFAULT 0,
      avg_fps REAL DEFAULT 0.0,
      avg_latency_ms REAL DEFAULT 0.0,
      end_reason TEXT DEFAULT 'clean_disconnect',
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,

    // 10. INCIDENTS
    `CREATE TABLE incidents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      home_id TEXT,
      device_id TEXT,
      incident_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'WARNING',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      opened_at TEXT DEFAULT CURRENT_TIMESTAMP,
      acknowledged_at TEXT,
      resolved_at TEXT,
      metadata TEXT,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,

    // 11. RULES
    `CREATE TABLE rules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      home_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      is_enabled INTEGER DEFAULT 1,
      modes TEXT DEFAULT '["home", "away", "night"]',
      target_categories TEXT DEFAULT '["person"]',
      min_confidence REAL DEFAULT 0.50,
      severity TEXT NOT NULL DEFAULT 'WARNING',
      action TEXT NOT NULL DEFAULT 'alert',
      cooldown_sec INTEGER DEFAULT 30,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,

    // 12. MODE PROFILES
    `CREATE TABLE mode_profiles (
      id TEXT PRIMARY KEY,
      home_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      arming_delay_s INTEGER DEFAULT 0,
      push_notifications_enabled INTEGER DEFAULT 1,
      audible_alarm_enabled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,

    // 13. HOME MEMBERS
    `CREATE TABLE home_members (
      id TEXT PRIMARY KEY,
      home_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      invited_by TEXT,
      joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,

    // 14. HOME INVITES
    `CREATE TABLE home_invites (
      id TEXT PRIMARY KEY,
      home_id TEXT NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      email TEXT,
      role TEXT DEFAULT 'member',
      created_by TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      is_accepted INTEGER DEFAULT 0,
      accepted_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE
    )`,

    // 15. SECURITY AUDIT LOG
    `CREATE TABLE security_audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      home_id TEXT,
      event_type TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,

    // 16. METRIC ROLLUPS
    `CREATE TABLE metric_rollups (
      id TEXT PRIMARY KEY,
      home_id TEXT NOT NULL,
      device_id TEXT,
      period_start TEXT NOT NULL,
      period_type TEXT NOT NULL,
      event_count INTEGER DEFAULT 0,
      alert_count INTEGER DEFAULT 0,
      avg_processing_time_ms REAL DEFAULT 0.0,
      uptime_seconds INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE
    )`,

    // PERFORMANCE INDEXES
    `CREATE INDEX idx_events_user_id ON events (user_id)`,
    `CREATE INDEX idx_events_home_id ON events (home_id)`,
    `CREATE INDEX idx_events_started_at ON events (started_at DESC)`,
    `CREATE INDEX idx_events_category ON events (category)`,
    `CREATE INDEX idx_events_is_unusual ON events (is_unusual)`,
    `CREATE INDEX idx_pairing_codes_code ON pairing_codes (code)`,
    `CREATE INDEX idx_alerts_user_unread ON alerts (user_id, is_read, created_at DESC)`,
    `CREATE INDEX idx_security_audit_log_user ON security_audit_log (user_id, created_at DESC)`,
    `CREATE INDEX idx_monitoring_sessions_user ON monitoring_sessions (user_id, started_at DESC)`,
    `CREATE INDEX idx_incidents_user_status ON incidents (user_id, status, opened_at DESC)`,
    `CREATE INDEX idx_rules_user_home ON rules (user_id, is_enabled)`,
    `CREATE INDEX idx_home_members_home ON home_members (home_id)`,
    `CREATE INDEX idx_home_invites_code ON home_invites (invite_code)`
  ];

  for (const stmt of schemaStatements) {
    await run(stmt);
  }

  console.log('[Database Recreator] Seeding default demo homeowner, home & security rules...');

  const demoUserId = '00000000-0000-0000-0000-000000000001';
  const demoHomeId = '00000000-0000-0000-0000-000000000002';
  const demoPasswordHash = bcrypt.hashSync('demo1234', 10);

  // 1. Profile
  await run(
    `INSERT INTO profiles (id, email, full_name, role, password_hash)
     VALUES (?, ?, ?, ?, ?)`,
    [demoUserId, 'demo@safehome.local', 'Demo Homeowner', 'homeowner', demoPasswordHash]
  );

  // 2. Home
  await run(
    `INSERT INTO homes (id, user_id, name, address, timezone, current_mode)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [demoHomeId, demoUserId, 'My SafeHome', '123 Smart Avenue', 'UTC', 'home']
  );

  // 3. User Settings
  await run(
    `INSERT INTO user_settings (user_id, expected_active_start, expected_active_end, confidence_threshold)
     VALUES (?, '07:00', '23:00', 0.50)`,
    [demoUserId]
  );

  // 4. Default Security Rules
  const defaultRules = [
    {
      id: crypto.randomUUID(),
      name: 'Person Intrusion Detection',
      description: 'Trigger immediate warning alert when any person is detected in Away or Night modes',
      modes: JSON.stringify(['away', 'night']),
      target_categories: JSON.stringify(['person']),
      min_confidence: 0.50,
      severity: 'WARNING',
      action: 'alert'
    },
    {
      id: crypto.randomUUID(),
      name: 'Masked Face & Concealment Threat',
      description: 'Trigger critical safety alarm upon detecting masked or partially concealed faces',
      modes: JSON.stringify(['home', 'away', 'night']),
      target_categories: JSON.stringify(['person']),
      min_confidence: 0.45,
      severity: 'CRITICAL',
      action: 'alarm'
    },
    {
      id: crypto.randomUUID(),
      name: 'Vehicle & Loitering Monitoring',
      description: 'Log and monitor vehicles or prolonged presence at perimeter',
      modes: JSON.stringify(['away', 'night']),
      target_categories: JSON.stringify(['vehicle']),
      min_confidence: 0.60,
      severity: 'INFO',
      action: 'log_only'
    }
  ];

  for (const r of defaultRules) {
    await run(
      `INSERT INTO rules (id, user_id, home_id, name, description, modes, target_categories, min_confidence, severity, action, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [r.id, demoUserId, demoHomeId, r.name, r.description, r.modes, r.target_categories, r.min_confidence, r.severity, r.action]
    );
  }

  // 5. Initial Security Audit Log entry
  await run(
    `INSERT INTO security_audit_log (id, user_id, home_id, event_type, resource_type, resource_id, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      demoUserId,
      demoHomeId,
      'system_initialized',
      'database',
      'safehome.sqlite',
      JSON.stringify({ status: 'canonical_schema_recreated', tables_count: 16 }),
      '127.0.0.1'
    ]
  );

  console.log('[Database Recreator] ✅ Database recreated successfully with canonical schema & seed data.');
  db.close();
}

recreateDatabase().catch((err) => {
  console.error('[Database Recreator] ❌ Failed to recreate database:', err);
  process.exit(1);
});
