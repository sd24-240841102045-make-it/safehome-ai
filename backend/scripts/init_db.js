/**
 * SafeHome AI - Database Initializer
 * Supports PostgreSQL (production) and SQLite (local development).
 * DATABASE_URL env var controls which backend is used:
 *   postgres://... or postgresql://... => PostgreSQL (production)
 *   sqlite:... or unset               => SQLite (local dev)
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'sqlite:./safehome.sqlite';
const isPostgres = DATABASE_URL.startsWith('postgres://') || DATABASE_URL.startsWith('postgresql://');

console.log(`[DB Init] Mode: ${isPostgres ? 'PostgreSQL (production)' : 'SQLite (local dev)'}`);

// ─── PostgreSQL ──────────────────────────────────────────────────────────────

async function initPostgres() {
  const pg = (await import('pg')).default;
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  console.log('[DB Init] Connected to PostgreSQL.');

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        role TEXT DEFAULT 'homeowner',
        password_hash TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS homes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        address TEXT,
        timezone TEXT DEFAULT 'UTC',
        active_hours_start TEXT DEFAULT '07:00',
        active_hours_end TEXT DEFAULT '23:00',
        current_mode TEXT DEFAULT 'home',
        mode_changed_at TIMESTAMPTZ DEFAULT NOW(),
        arming_delay_s INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        home_id TEXT,
        name TEXT NOT NULL,
        device_type TEXT DEFAULT 'phone_camera',
        status TEXT DEFAULT 'offline',
        ip_address TEXT,
        user_agent TEXT,
        last_seen TIMESTAMPTZ,
        last_heartbeat_at TIMESTAMPTZ,
        battery_level REAL,
        battery_charging INTEGER DEFAULT 0,
        network_online INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS device_status (
        device_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        home_id TEXT,
        status TEXT DEFAULT 'offline',
        battery_level REAL,
        battery_charging INTEGER DEFAULT 0,
        network_online INTEGER DEFAULT 1,
        last_heartbeat_at TIMESTAMPTZ,
        last_frame_at TIMESTAMPTZ,
        fps REAL DEFAULT 0.0,
        latency_ms REAL DEFAULT 0.0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pairing_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        home_id TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        device_name TEXT DEFAULT 'Android Phone Sensor',
        expires_at TIMESTAMPTZ NOT NULL,
        is_used INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        home_id TEXT,
        device_id TEXT,
        event_type TEXT NOT NULL,
        object_class TEXT NOT NULL,
        category TEXT NOT NULL,
        confidence REAL NOT NULL,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        last_seen TIMESTAMPTZ DEFAULT NOW(),
        frame_count INTEGER DEFAULT 1,
        snapshot_path TEXT,
        is_unusual INTEGER DEFAULT 0,
        anomaly_score REAL DEFAULT 0.0,
        anomaly_reason TEXT,
        user_feedback TEXT,
        feedback_reason TEXT,
        bbox_x REAL, bbox_y REAL, bbox_w REAL, bbox_h REAL,
        frame_width INTEGER, frame_height INTEGER,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        event_id TEXT,
        severity TEXT NOT NULL DEFAULT 'WARNING',
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        is_resolved INTEGER DEFAULT 0,
        resolved_at TIMESTAMPTZ,
        occurrence_count INTEGER DEFAULT 1,
        dedupe_key TEXT,
        last_seen TIMESTAMPTZ,
        rule_id TEXT,
        suppressed_reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
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
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS monitoring_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        home_id TEXT, device_id TEXT,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        ended_at TIMESTAMPTZ,
        duration_seconds INTEGER DEFAULT 0,
        frame_count INTEGER DEFAULT 0,
        drop_count INTEGER DEFAULT 0,
        avg_fps REAL DEFAULT 0.0,
        avg_latency_ms REAL DEFAULT 0.0,
        end_reason TEXT DEFAULT 'clean_disconnect'
      );

      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        home_id TEXT, device_id TEXT,
        incident_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'WARNING',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        opened_at TIMESTAMPTZ DEFAULT NOW(),
        acknowledged_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS rules (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        home_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        is_enabled INTEGER DEFAULT 1,
        modes TEXT DEFAULT '["home","away","night"]',
        target_categories TEXT DEFAULT '["person"]',
        min_confidence REAL DEFAULT 0.50,
        severity TEXT NOT NULL DEFAULT 'WARNING',
        action TEXT NOT NULL DEFAULT 'alert',
        cooldown_sec INTEGER DEFAULT 30,
        is_default INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS mode_profiles (
        id TEXT PRIMARY KEY,
        home_id TEXT NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        mode TEXT NOT NULL,
        arming_delay_s INTEGER DEFAULT 0,
        push_notifications_enabled INTEGER DEFAULT 1,
        audible_alarm_enabled INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS home_members (
        id TEXT PRIMARY KEY,
        home_id TEXT NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        role TEXT DEFAULT 'member',
        invited_by TEXT,
        joined_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS home_invites (
        id TEXT PRIMARY KEY,
        home_id TEXT NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
        invite_code TEXT NOT NULL UNIQUE,
        email TEXT,
        role TEXT DEFAULT 'member',
        created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        is_accepted INTEGER DEFAULT 0,
        accepted_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS security_audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        home_id TEXT,
        event_type TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS metric_rollups (
        id TEXT PRIMARY KEY,
        home_id TEXT NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
        device_id TEXT,
        period_start TIMESTAMPTZ NOT NULL,
        period_type TEXT NOT NULL,
        event_count INTEGER DEFAULT 0,
        alert_count INTEGER DEFAULT 0,
        avg_processing_time_ms REAL DEFAULT 0.0,
        uptime_seconds INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        home_id TEXT,
        razorpay_order_id TEXT NOT NULL UNIQUE,
        razorpay_payment_id TEXT,
        razorpay_signature TEXT,
        amount INTEGER NOT NULL,
        currency TEXT DEFAULT 'INR',
        status TEXT NOT NULL DEFAULT 'created',
        plan_id TEXT NOT NULL,
        plan_name TEXT NOT NULL,
        billing_cycle TEXT NOT NULL DEFAULT 'monthly',
        receipt TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
        plan_id TEXT NOT NULL DEFAULT 'free',
        plan_name TEXT NOT NULL DEFAULT 'Free Community Guard',
        status TEXT NOT NULL DEFAULT 'active',
        billing_cycle TEXT NOT NULL DEFAULT 'monthly',
        amount INTEGER NOT NULL DEFAULT 0,
        currency TEXT DEFAULT 'INR',
        current_period_start TIMESTAMPTZ DEFAULT NOW(),
        current_period_end TIMESTAMPTZ,
        latest_payment_id TEXT,
        features TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_events_user_id    ON events (user_id);
      CREATE INDEX IF NOT EXISTS idx_events_home_id    ON events (home_id);
      CREATE INDEX IF NOT EXISTS idx_events_started_at ON events (started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_category   ON events (category);
      CREATE INDEX IF NOT EXISTS idx_events_is_unusual ON events (is_unusual);
      CREATE INDEX IF NOT EXISTS idx_pairing_codes_code ON pairing_codes (code);
      CREATE INDEX IF NOT EXISTS idx_alerts_user_unread ON alerts (user_id, is_read, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_log_user    ON security_audit_log (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_user     ON monitoring_sessions (user_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_incidents_user    ON incidents (user_id, status, opened_at DESC);
      CREATE INDEX IF NOT EXISTS idx_rules_user        ON rules (user_id, is_enabled);
      CREATE INDEX IF NOT EXISTS idx_home_members      ON home_members (home_id);
      CREATE INDEX IF NOT EXISTS idx_home_invites_code ON home_invites (invite_code);
      CREATE INDEX IF NOT EXISTS idx_payments_user     ON payments (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_payments_order    ON payments (razorpay_order_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id);
    `);

    console.log('[DB Init] PostgreSQL schema applied (18 tables + indexes).');

    // Seed demo user (idempotent)
    const demoUserId = '00000000-0000-0000-0000-000000000001';
    const demoHomeId = '00000000-0000-0000-0000-000000000002';
    const existing = await client.query('SELECT id FROM profiles WHERE id = $1', [demoUserId]);

    if (existing.rows.length === 0) {
      const demoHash = bcrypt.hashSync('demo1234', 10);
      await client.query(
        `INSERT INTO profiles (id, email, full_name, role, password_hash) VALUES ($1,$2,$3,$4,$5)`,
        [demoUserId, 'demo@safehome.local', 'Demo Homeowner', 'homeowner', demoHash]
      );
      await client.query(
        `INSERT INTO homes (id, user_id, name, address, timezone, current_mode) VALUES ($1,$2,$3,$4,$5,$6)`,
        [demoHomeId, demoUserId, 'My SafeHome', '123 Smart Avenue', 'UTC', 'home']
      );
      await client.query(`INSERT INTO user_settings (user_id) VALUES ($1)`, [demoUserId]);

      const defaultRules = [
        { name: 'Person Intrusion Detection', desc: 'Alert on person in Away/Night mode', modes: '["away","night"]', cats: '["person"]', conf: 0.50, sev: 'WARNING', action: 'alert' },
        { name: 'Masked Face Threat', desc: 'Critical alarm on masked face detection', modes: '["home","away","night"]', cats: '["person"]', conf: 0.45, sev: 'CRITICAL', action: 'alarm' },
        { name: 'Vehicle Monitoring', desc: 'Log vehicles at perimeter', modes: '["away","night"]', cats: '["vehicle"]', conf: 0.60, sev: 'INFO', action: 'log_only' }
      ];
      for (const r of defaultRules) {
        await client.query(
          `INSERT INTO rules (id,user_id,home_id,name,description,modes,target_categories,min_confidence,severity,action,is_default)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1)`,
          [crypto.randomUUID(), demoUserId, demoHomeId, r.name, r.desc, r.modes, r.cats, r.conf, r.sev, r.action]
        );
      }
      console.log('[DB Init] Demo seed data inserted.');
    } else {
      console.log('[DB Init] Demo user already exists — skipping seed.');
    }

    await client.query('COMMIT');
    console.log('[DB Init] PostgreSQL transaction committed.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// ─── SQLite ──────────────────────────────────────────────────────────────────

async function initSqlite() {
  const sqlite3 = (await import('sqlite3')).default;
  const isBackendDir = process.cwd().endsWith('backend');
  const dbRelPath = DATABASE_URL.replace('sqlite:', '').trim();
  const DB_PATH = path.isAbsolute(dbRelPath)
    ? dbRelPath
    : path.resolve(isBackendDir ? process.cwd() : path.join(process.cwd(), 'backend'), dbRelPath);

  console.log(`[DB Init] SQLite path: ${DB_PATH}`);
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('[DB Init] Removed stale database file.');
  }
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new sqlite3.Database(DB_PATH);
  const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ changes: this.changes, lastID: this.lastID });
      });
    });

  const stmts = [
    `CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL, role TEXT DEFAULT 'homeowner', password_hash TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS homes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, address TEXT, timezone TEXT DEFAULT 'UTC', active_hours_start TEXT DEFAULT '07:00', active_hours_end TEXT DEFAULT '23:00', current_mode TEXT DEFAULT 'home', mode_changed_at TEXT DEFAULT CURRENT_TIMESTAMP, arming_delay_s INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, home_id TEXT, name TEXT NOT NULL, device_type TEXT DEFAULT 'phone_camera', status TEXT DEFAULT 'offline', ip_address TEXT, user_agent TEXT, last_seen TEXT, last_heartbeat_at TEXT, battery_level REAL, battery_charging INTEGER DEFAULT 0, network_online INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS device_status (device_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, home_id TEXT, status TEXT DEFAULT 'offline', battery_level REAL, battery_charging INTEGER DEFAULT 0, network_online INTEGER DEFAULT 1, last_heartbeat_at TEXT, last_frame_at TEXT, fps REAL DEFAULT 0.0, latency_ms REAL DEFAULT 0.0, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS pairing_codes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, home_id TEXT NOT NULL, code TEXT NOT NULL UNIQUE, device_name TEXT DEFAULT 'Android Phone Sensor', expires_at TEXT NOT NULL, is_used INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, home_id TEXT, device_id TEXT, event_type TEXT NOT NULL, object_class TEXT NOT NULL, category TEXT NOT NULL, confidence REAL NOT NULL, started_at TEXT DEFAULT CURRENT_TIMESTAMP, last_seen TEXT DEFAULT CURRENT_TIMESTAMP, frame_count INTEGER DEFAULT 1, snapshot_path TEXT, is_unusual INTEGER DEFAULT 0, anomaly_score REAL DEFAULT 0.0, anomaly_reason TEXT, user_feedback TEXT, feedback_reason TEXT, bbox_x REAL, bbox_y REAL, bbox_w REAL, bbox_h REAL, frame_width INTEGER, frame_height INTEGER, metadata TEXT, FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS alerts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, event_id TEXT, severity TEXT NOT NULL DEFAULT 'WARNING', category TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, is_read INTEGER DEFAULT 0, is_resolved INTEGER DEFAULT 0, resolved_at TEXT, occurrence_count INTEGER DEFAULT 1, dedupe_key TEXT, last_seen TEXT, rule_id TEXT, suppressed_reason TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS user_settings (user_id TEXT PRIMARY KEY, expected_active_start TEXT DEFAULT '07:00', expected_active_end TEXT DEFAULT '23:00', notification_quiet_hours_start TEXT DEFAULT '22:00', notification_quiet_hours_end TEXT DEFAULT '07:00', confidence_threshold REAL DEFAULT 0.50, event_cooldown_sec INTEGER DEFAULT 30, snapshot_retention_days INTEGER DEFAULT 7, event_retention_days INTEGER DEFAULT 90, save_snapshots INTEGER DEFAULT 1, opt_in_live_preview INTEGER DEFAULT 0, audio_enabled INTEGER DEFAULT 0, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS monitoring_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, home_id TEXT, device_id TEXT, started_at TEXT DEFAULT CURRENT_TIMESTAMP, ended_at TEXT, duration_seconds INTEGER DEFAULT 0, frame_count INTEGER DEFAULT 0, drop_count INTEGER DEFAULT 0, avg_fps REAL DEFAULT 0.0, avg_latency_ms REAL DEFAULT 0.0, end_reason TEXT DEFAULT 'clean_disconnect', FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS incidents (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, home_id TEXT, device_id TEXT, incident_type TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'WARNING', title TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', opened_at TEXT DEFAULT CURRENT_TIMESTAMP, acknowledged_at TEXT, resolved_at TEXT, metadata TEXT, FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS rules (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, home_id TEXT, name TEXT NOT NULL, description TEXT, is_enabled INTEGER DEFAULT 1, modes TEXT DEFAULT '["home","away","night"]', target_categories TEXT DEFAULT '["person"]', min_confidence REAL DEFAULT 0.50, severity TEXT NOT NULL DEFAULT 'WARNING', action TEXT NOT NULL DEFAULT 'alert', cooldown_sec INTEGER DEFAULT 30, is_default INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS mode_profiles (id TEXT PRIMARY KEY, home_id TEXT NOT NULL, user_id TEXT NOT NULL, mode TEXT NOT NULL, arming_delay_s INTEGER DEFAULT 0, push_notifications_enabled INTEGER DEFAULT 1, audible_alarm_enabled INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS home_members (id TEXT PRIMARY KEY, home_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT DEFAULT 'member', invited_by TEXT, joined_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS home_invites (id TEXT PRIMARY KEY, home_id TEXT NOT NULL, invite_code TEXT NOT NULL UNIQUE, email TEXT, role TEXT DEFAULT 'member', created_by TEXT NOT NULL, expires_at TEXT NOT NULL, is_accepted INTEGER DEFAULT 0, accepted_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE, FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS security_audit_log (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, home_id TEXT, event_type TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT, details TEXT, ip_address TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS metric_rollups (id TEXT PRIMARY KEY, home_id TEXT NOT NULL, device_id TEXT, period_start TEXT NOT NULL, period_type TEXT NOT NULL, event_count INTEGER DEFAULT 0, alert_count INTEGER DEFAULT 0, avg_processing_time_ms REAL DEFAULT 0.0, uptime_seconds INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, home_id TEXT, razorpay_order_id TEXT NOT NULL UNIQUE, razorpay_payment_id TEXT, razorpay_signature TEXT, amount INTEGER NOT NULL, currency TEXT DEFAULT 'INR', status TEXT NOT NULL DEFAULT 'created', plan_id TEXT NOT NULL, plan_name TEXT NOT NULL, billing_cycle TEXT NOT NULL DEFAULT 'monthly', receipt TEXT, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, plan_id TEXT NOT NULL DEFAULT 'free', plan_name TEXT NOT NULL DEFAULT 'Free Community Guard', status TEXT NOT NULL DEFAULT 'active', billing_cycle TEXT NOT NULL DEFAULT 'monthly', amount INTEGER NOT NULL DEFAULT 0, currency TEXT DEFAULT 'INR', current_period_start TEXT DEFAULT CURRENT_TIMESTAMP, current_period_end TEXT, latest_payment_id TEXT, features TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
    `CREATE INDEX IF NOT EXISTS idx_events_user_id    ON events (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_events_started_at ON events (started_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_events_category   ON events (category)`,
    `CREATE INDEX IF NOT EXISTS idx_alerts_user_unread ON alerts (user_id, is_read, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_user    ON security_audit_log (user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_incidents_user    ON incidents (user_id, status, opened_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_rules_user        ON rules (user_id, is_enabled)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_user     ON payments (user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id)`
  ];

  for (const s of stmts) await run(s);

  const demoUserId = '00000000-0000-0000-0000-000000000001';
  const demoHomeId = '00000000-0000-0000-0000-000000000002';
  const demoHash = bcrypt.hashSync('demo1234', 10);
  await run(`INSERT INTO profiles (id,email,full_name,role,password_hash) VALUES (?,?,?,?,?)`,
    [demoUserId, 'demo@safehome.local', 'Demo Homeowner', 'homeowner', demoHash]);
  await run(`INSERT INTO homes (id,user_id,name,address,timezone,current_mode) VALUES (?,?,?,?,?,?)`,
    [demoHomeId, demoUserId, 'My SafeHome', '123 Smart Avenue', 'UTC', 'home']);
  await run(`INSERT INTO user_settings (user_id) VALUES (?)`, [demoUserId]);

  const defaultRules = [
    { name: 'Person Intrusion Detection', desc: 'Alert on person in Away/Night mode', modes: '["away","night"]', cats: '["person"]', conf: 0.50, sev: 'WARNING', action: 'alert' },
    { name: 'Masked Face Threat', desc: 'Critical alarm on masked face detection', modes: '["home","away","night"]', cats: '["person"]', conf: 0.45, sev: 'CRITICAL', action: 'alarm' },
    { name: 'Vehicle Monitoring', desc: 'Log vehicles at perimeter', modes: '["away","night"]', cats: '["vehicle"]', conf: 0.60, sev: 'INFO', action: 'log_only' }
  ];
  for (const r of defaultRules) {
    await run(
      `INSERT INTO rules (id,user_id,home_id,name,description,modes,target_categories,min_confidence,severity,action,is_default) VALUES (?,?,?,?,?,?,?,?,?,?,1)`,
      [crypto.randomUUID(), demoUserId, demoHomeId, r.name, r.desc, r.modes, r.cats, r.conf, r.sev, r.action]
    );
  }

  db.close();
  console.log('[DB Init] SQLite database created with 18 tables + seed data.');
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

(async () => {
  try {
    if (isPostgres) {
      await initPostgres();
    } else {
      await initSqlite();
    }
    console.log('[DB Init] Database initialization complete.');
    process.exit(0);
  } catch (err) {
    console.error('[DB Init] Failed:', err);
    process.exit(1);
  }
})();
