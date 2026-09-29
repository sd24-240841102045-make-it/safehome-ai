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
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
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
        user_feedback TEXT,
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
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        expected_active_start TEXT DEFAULT '07:00',
        expected_active_end TEXT DEFAULT '23:00',
        confidence_threshold REAL DEFAULT 0.50,
        event_cooldown_sec INTEGER DEFAULT 30,
        snapshot_retention_days INTEGER DEFAULT 7,
        event_retention_days INTEGER DEFAULT 90,
        save_snapshots INTEGER DEFAULT 1,
        opt_in_live_preview INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_events_user_id ON events (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_events_started_at ON events (started_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_events_category ON events (category)`,
      `CREATE INDEX IF NOT EXISTS idx_events_is_unusual ON events (is_unusual)`,
      `CREATE INDEX IF NOT EXISTS idx_pairing_codes_code ON pairing_codes (code)`
    ];

    for (const s of stmts) {
      await this.run(s);
    }

    // Seed default demo profile for testing
    const demo = await this.get('SELECT id FROM profiles WHERE id = ?', ['00000000-0000-0000-0000-000000000001']);
    if (!demo) {
      await this.run(
        'INSERT INTO profiles (id, email, full_name) VALUES (?, ?, ?)',
        ['00000000-0000-0000-0000-000000000001', 'demo@safehome.local', 'Demo Homeowner']
      );
      await this.run(
        'INSERT INTO homes (id, user_id, name, timezone) VALUES (?, ?, ?, ?)',
        ['00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Main Home', 'UTC']
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
