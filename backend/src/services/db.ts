import sqlite3 from 'sqlite3';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';
import { logger } from './logger.js';

export interface DatabaseService {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  get<T = any>(sql: string, params?: any[]): Promise<T | null>;
  run(sql: string, params?: any[]): Promise<{ changes: number; lastID?: number }>;
  checkHealth(): Promise<{ status: 'online' | 'offline'; type: string; error?: string }>;
}

class SqliteDatabaseService implements DatabaseService {
  private db!: sqlite3.Database;

  async init(dbPath: string): Promise<void> {
    const resolved = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await new Promise<void>((resolve, reject) => {
      this.db = new sqlite3.Database(resolved, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    await this.setupSchema();
    logger.info(`[DB] SQLite initialized at: ${resolved}`);
  }

  private async setupSchema(): Promise<void> {
    const stmts = [
      `CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT DEFAULT 'homeowner',
        password_hash TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS homes (
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
      `CREATE TABLE IF NOT EXISTS devices (
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
      `CREATE TABLE IF NOT EXISTS pairing_codes (
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
      `CREATE TABLE IF NOT EXISTS events (
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
      `CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        event_id TEXT,
        severity TEXT NOT NULL,
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
      `CREATE TABLE IF NOT EXISTS user_settings (
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
      `CREATE TABLE IF NOT EXISTS security_audit_log (
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
      `CREATE TABLE IF NOT EXISTS metric_rollups (
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
      `CREATE TABLE IF NOT EXISTS monitoring_sessions (
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
      `CREATE TABLE IF NOT EXISTS device_status (
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
      `CREATE TABLE IF NOT EXISTS incidents (
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
      `CREATE TABLE IF NOT EXISTS rules (
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
      `CREATE TABLE IF NOT EXISTS mode_profiles (
        id TEXT PRIMARY KEY,
        home_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        arming_delay_s INTEGER DEFAULT 0,
        push_notifications_enabled INTEGER DEFAULT 1,
        audible_alarm_enabled INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS home_members (
        id TEXT PRIMARY KEY,
        home_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        invited_by TEXT,
        joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS home_invites (
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
      `CREATE INDEX IF NOT EXISTS idx_events_user_id ON events (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_events_started_at ON events (started_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_events_category ON events (category)`,
      `CREATE INDEX IF NOT EXISTS idx_events_is_unusual ON events (is_unusual)`,
      `CREATE INDEX IF NOT EXISTS idx_pairing_codes_code ON pairing_codes (code)`,
      `CREATE INDEX IF NOT EXISTS idx_security_audit_log_user ON security_audit_log (user_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_metric_rollups_period ON metric_rollups (home_id, period_start DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_user ON monitoring_sessions (user_id, started_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_incidents_user_status ON incidents (user_id, status, opened_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_rules_user_home ON rules (user_id, is_enabled)`,
      `CREATE INDEX IF NOT EXISTS idx_home_members_home ON home_members (home_id)`,
      `CREATE INDEX IF NOT EXISTS idx_home_invites_code ON home_invites (invite_code)`
    ];

    for (const s of stmts) {
      await this.run(s);
    }

    // Run graceful schema migrations for existing SQLite databases
    const migrations = [
      'ALTER TABLE profiles ADD COLUMN password_hash TEXT',
      'ALTER TABLE homes ADD COLUMN current_mode TEXT DEFAULT "home"',
      'ALTER TABLE homes ADD COLUMN mode_changed_at TEXT',
      'ALTER TABLE homes ADD COLUMN arming_delay_s INTEGER DEFAULT 0',
      'ALTER TABLE devices ADD COLUMN last_heartbeat_at TEXT',
      'ALTER TABLE devices ADD COLUMN battery_level REAL',
      'ALTER TABLE devices ADD COLUMN battery_charging INTEGER DEFAULT 0',
      'ALTER TABLE devices ADD COLUMN network_online INTEGER DEFAULT 1',
      'ALTER TABLE events ADD COLUMN feedback_reason TEXT',
      'ALTER TABLE events ADD COLUMN bbox_x REAL',
      'ALTER TABLE events ADD COLUMN bbox_y REAL',
      'ALTER TABLE events ADD COLUMN bbox_w REAL',
      'ALTER TABLE events ADD COLUMN bbox_h REAL',
      'ALTER TABLE events ADD COLUMN frame_width INTEGER',
      'ALTER TABLE events ADD COLUMN frame_height INTEGER',
      'ALTER TABLE alerts ADD COLUMN is_resolved INTEGER DEFAULT 0',
      'ALTER TABLE alerts ADD COLUMN resolved_at TEXT',
      'ALTER TABLE alerts ADD COLUMN occurrence_count INTEGER DEFAULT 1',
      'ALTER TABLE alerts ADD COLUMN dedupe_key TEXT',
      'ALTER TABLE alerts ADD COLUMN last_seen TEXT',
      'ALTER TABLE alerts ADD COLUMN rule_id TEXT',
      'ALTER TABLE alerts ADD COLUMN suppressed_reason TEXT',
      'ALTER TABLE user_settings ADD COLUMN notification_quiet_hours_start TEXT DEFAULT "22:00"',
      'ALTER TABLE user_settings ADD COLUMN notification_quiet_hours_end TEXT DEFAULT "07:00"',
      'ALTER TABLE user_settings ADD COLUMN audio_enabled INTEGER DEFAULT 0',
      'ALTER TABLE homes ADD COLUMN updated_at TEXT'
    ];

    for (const migration of migrations) {
      try {
        await this.run(migration);
      } catch {
        // Column already exists or already migrated
      }
    }

    // Seed default demo profile for testing
    const demo = await this.get('SELECT id FROM profiles WHERE id = ?', ['00000000-0000-0000-0000-000000000001']);
    if (!demo) {
      // bcrypt hash for 'demo1234'
      const demoHash = '$2a$10$f/r4t2rX8bXU1yA0pP0d4OGx9j6kM2KxS6Jv8R2F1H0L3K8J5P7Nu';
      await this.run(
        'INSERT INTO profiles (id, email, full_name, role, password_hash) VALUES (?, ?, ?, ?, ?)',
        ['00000000-0000-0000-0000-000000000001', 'demo@safehome.local', 'Demo Homeowner', 'homeowner', demoHash]
      );
      await this.run(
        'INSERT INTO homes (id, user_id, name, timezone, current_mode) VALUES (?, ?, ?, ?, ?)',
        ['00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Main Home', 'UTC', 'home']
      );
      await this.run(
        'INSERT INTO user_settings (user_id) VALUES (?)',
        ['00000000-0000-0000-0000-000000000001']
      );
    }
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve((rows as T[]) || []);
      });
    });
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] || null;
  }

  async run(sql: string, params: any[] = []): Promise<{ changes: number; lastID?: number }> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ changes: this.changes, lastID: this.lastID });
      });
    });
  }

  async checkHealth(): Promise<{ status: 'online' | 'offline'; type: string; error?: string }> {
    try {
      await this.get('SELECT 1');
      return { status: 'online', type: 'SQLite (Local)' };
    } catch (e: any) {
      return { status: 'offline', type: 'SQLite', error: e.message };
    }
  }
}

class PostgresDatabaseService implements DatabaseService {
  private pool!: pg.Pool;

  constructor(connStr: string) {
    this.pool = new pg.Pool({
      connectionString: connStr,
      ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    let idx = 1;
    const pgSql = sql.replace(/\?/g, () => `$${idx++}`);
    const res = await this.pool.query(pgSql, params);
    return res.rows as T[];
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] || null;
  }

  async run(sql: string, params: any[] = []): Promise<{ changes: number }> {
    let idx = 1;
    const pgSql = sql.replace(/\?/g, () => `$${idx++}`);
    const res = await this.pool.query(pgSql, params);
    return { changes: res.rowCount || 0 };
  }

  async checkHealth(): Promise<{ status: 'online' | 'offline'; type: string; error?: string }> {
    try {
      await this.pool.query('SELECT 1');
      return { status: 'online', type: 'Supabase PostgreSQL' };
    } catch (e: any) {
      return { status: 'offline', type: 'PostgreSQL', error: e.message };
    }
  }
}

// Database Factory
export async function createDatabaseService(): Promise<DatabaseService> {
  const isPostgres = config.DATABASE_URL.startsWith('postgres://') || config.DATABASE_URL.startsWith('postgresql://');
  if (isPostgres) {
    logger.info('[DB] Using Supabase PostgreSQL connection pool.');
    return new PostgresDatabaseService(config.DATABASE_URL);
  } else {
    const dbPath = config.DATABASE_URL.replace('sqlite:', '').trim();
    const service = new SqliteDatabaseService();
    await service.init(dbPath);
    return service;
  }
}
