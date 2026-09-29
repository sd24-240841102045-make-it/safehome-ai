import sqlite3 from 'sqlite3';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const databaseUrl = process.env.DATABASE_URL || 'sqlite:./safehome.sqlite';
const isPostgres = databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://');

let pgPool = null;
let sqliteDb = null;

export async function initDatabase() {
  if (isPostgres) {
    console.log('[DB] Connecting to PostgreSQL / Supabase at:', databaseUrl.replace(/:[^:@]*@/, ':****@'));
    pgPool = new pg.Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    // Test connection
    const client = await pgPool.connect();
    console.log('[DB] PostgreSQL connected successfully.');
    client.release();
  } else {
    const dbPath = databaseUrl.replace('sqlite:', '').trim();
    const resolvedPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
    const dbDir = path.dirname(resolvedPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    console.log(`[DB] Initializing local SQLite database at: ${resolvedPath}`);
    await new Promise((resolve, reject) => {
      sqliteDb = new sqlite3.Database(resolvedPath, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Run schema creation for SQLite
    await setupSqliteSchema();
    console.log('[DB] SQLite tables and indexes initialized.');
  }
}

async function setupSqliteSchema() {
  const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
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
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
      last_ping TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT,
      home_id TEXT,
      event_type TEXT NOT NULL,
      object_class TEXT NOT NULL,
      confidence REAL NOT NULL,
      bounding_box TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      location_label TEXT DEFAULT 'Main Entrance',
      snapshot_url TEXT,
      is_unusual INTEGER DEFAULT 0,
      anomaly_score REAL DEFAULT 0.0,
      metadata TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event_id TEXT,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      expected_active_start TEXT DEFAULT '07:00',
      expected_active_end TEXT DEFAULT '23:00',
      confidence_threshold REAL DEFAULT 0.50,
      detection_cooldown_sec INTEGER DEFAULT 3,
      auto_delete_events_days INTEGER DEFAULT 30,
      save_snapshots INTEGER DEFAULT 1,
      notifications_enabled INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_events_user_time ON events (user_id, timestamp DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_events_type ON events (event_type)`,
    `CREATE INDEX IF NOT EXISTS idx_events_unusual ON events (is_unusual)`,
    `CREATE INDEX IF NOT EXISTS idx_alerts_user_unread ON alerts (user_id, is_read, created_at DESC)`
  ];

  for (const sql of schemaStatements) {
    await run(sql);
  }

  // Insert or update default demo user
  const hash = bcrypt.hashSync('SafeHome@2026', 10);
  const demoUser = await get('SELECT id FROM users WHERE id = ?', ['usr_demo_01']);
  if (!demoUser) {
    await run(
      'INSERT INTO users (id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      ['usr_demo_01', 'demo@safehome.local', hash, 'Alex Homeowner', 'homeowner']
    );
    await run(
      'INSERT INTO homes (id, user_id, name, address, active_hours_start, active_hours_end) VALUES (?, ?, ?, ?, ?, ?)',
      ['home_demo_01', 'usr_demo_01', 'Main Home', '104 Maple Avenue', '07:00', '23:00']
    );
    await run(
      'INSERT INTO devices (id, user_id, home_id, name, device_type, status) VALUES (?, ?, ?, ?, ?, ?)',
      ['dev_phone_01', 'usr_demo_01', 'home_demo_01', 'Android Phone Node', 'phone_camera', 'offline']
    );
    await run(
      'INSERT INTO user_settings (user_id, expected_active_start, expected_active_end, confidence_threshold) VALUES (?, ?, ?, ?)',
      ['usr_demo_01', '07:00', '23:00', 0.55]
    );
    console.log('[DB] Demo user and initial environment seeded.');
  } else {
    await run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, 'usr_demo_01']);
  }
}

// Universal query helpers
export async function query(sql, params = []) {
  if (isPostgres) {
    // Convert ? to $1, $2, etc for Postgres
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    const res = await pgPool.query(pgSql, params);
    return res.rows;
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }
}

export async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

export async function all(sql, params = []) {
  return query(sql, params);
}

export async function run(sql, params = []) {
  if (isPostgres) {
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    const res = await pgPool.query(pgSql, params);
    return { changes: res.rowCount };
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
}

export async function checkHealth() {
  try {
    if (isPostgres) {
      await pgPool.query('SELECT 1');
      return { status: 'online', type: 'PostgreSQL/Supabase' };
    } else {
      await get('SELECT 1');
      return { status: 'online', type: 'SQLite' };
    }
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}
