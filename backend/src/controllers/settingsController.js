import { get, run } from '../services/db.js';

export async function getSettings(req, res, next) {
  try {
    const settings = await get(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [req.user.id]
    );

    const home = await get(
      'SELECT name, address, active_hours_start, active_hours_end FROM homes WHERE user_id = ? LIMIT 1',
      [req.user.id]
    );

    res.json({
      success: true,
      settings: settings || {
        expected_active_start: '07:00',
        expected_active_end: '23:00',
        confidence_threshold: 0.55,
        detection_cooldown_sec: 5,
        auto_delete_events_days: 30,
        save_snapshots: 1,
        notifications_enabled: 1
      },
      home: home || {
        name: 'My Home',
        address: '104 Maple Avenue',
        active_hours_start: '07:00',
        active_hours_end: '23:00'
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function updateSettings(req, res, next) {
  try {
    const {
      expected_active_start,
      expected_active_end,
      confidence_threshold,
      detection_cooldown_sec,
      auto_delete_events_days,
      save_snapshots,
      notifications_enabled,
      home_name,
      home_address
    } = req.body;

    // Update user_settings
    await run(
      `INSERT INTO user_settings (
        user_id, expected_active_start, expected_active_end,
        confidence_threshold, detection_cooldown_sec, auto_delete_events_days,
        save_snapshots, notifications_enabled, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        expected_active_start = excluded.expected_active_start,
        expected_active_end = excluded.expected_active_end,
        confidence_threshold = excluded.confidence_threshold,
        detection_cooldown_sec = excluded.detection_cooldown_sec,
        auto_delete_events_days = excluded.auto_delete_events_days,
        save_snapshots = excluded.save_snapshots,
        notifications_enabled = excluded.notifications_enabled,
        updated_at = excluded.updated_at`,
      [
        req.user.id,
        expected_active_start || '07:00',
        expected_active_end || '23:00',
        confidence_threshold !== undefined ? parseFloat(confidence_threshold) : 0.55,
        detection_cooldown_sec || 5,
        auto_delete_events_days || 30,
        save_snapshots ? 1 : 0,
        notifications_enabled ? 1 : 0,
        new Date().toISOString()
      ]
    );

    // Update home if home_name provided
    if (home_name) {
      await run(
        `UPDATE homes SET name = ?, address = ?, active_hours_start = ?, active_hours_end = ? WHERE user_id = ?`,
        [home_name, home_address || '', expected_active_start || '07:00', expected_active_end || '23:00', req.user.id]
      );
    }

    res.json({ success: true, message: 'Settings saved successfully.' });
  } catch (err) {
    next(err);
  }
}
