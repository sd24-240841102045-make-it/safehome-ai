import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../safehome.sqlite');
const snapshotsDir = path.resolve(__dirname, '../data/snapshots');

console.log('🛡️ Starting Complete SafeHome AI Data & Snapshot Wipe...');

// 1. Physically remove all snapshot files from disk
if (fs.existsSync(snapshotsDir)) {
  const files = fs.readdirSync(snapshotsDir);
  let deletedFiles = 0;
  for (const file of files) {
    const fullPath = path.join(snapshotsDir, file);
    if (fs.statSync(fullPath).isFile()) {
      fs.unlinkSync(fullPath);
      deletedFiles++;
    }
  }
  console.log(`✅ Permanently deleted ${deletedFiles} snapshot files from ${snapshotsDir}`);
} else {
  fs.mkdirSync(snapshotsDir, { recursive: true });
}

// 2. Clear all tables in SQLite database
if (fs.existsSync(dbPath)) {
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ Failed to open database:', err);
      process.exit(1);
    }
  });

  const tablesToClear = [
    'events',
    'alerts',
    'incidents',
    'monitoring_sessions',
    'device_status',
    'pairing_codes',
    'security_audit_log',
    'metric_rollups',
    'devices',
    'home_invites',
    'home_members',
    'rules',
    'mode_profiles'
  ];

  db.serialize(() => {
    for (const table of tablesToClear) {
      db.run(`DELETE FROM ${table}`, (err) => {
        if (err) {
          console.warn(`⚠️ Note on table ${table}: ${err.message}`);
        } else {
          console.log(`✅ Cleared all records from table: ${table}`);
        }
      });
    }

    // Reset default user_settings and homes if needed, or leave base user profile
    db.run('VACUUM', (err) => {
      if (err) {
        console.error('❌ Error vacuuming database:', err);
      } else {
        console.log('✅ SQLite VACUUM complete. All database space reclaimed.');
      }
      db.close();
      console.log('🎉 All surveillance data, logs, incidents, rules, and snapshots have been permanently erased!');
    });
  });
} else {
  console.log('ℹ️ Database file does not exist yet.');
}
