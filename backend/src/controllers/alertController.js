import { all, get, run } from '../services/db.js';

export async function getAlerts(req, res, next) {
  try {
    const { unread_only, severity, limit = 50 } = req.query;
    const conditions = ['user_id = ?'];
    const params = [req.user.id];

    if (unread_only === 'true' || unread_only === '1') {
      conditions.push('is_read = 0');
    }

    if (severity) {
      conditions.push('severity = ?');
      params.push(severity.toUpperCase());
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const sql = `
      SELECT id, event_id, severity, title, message, is_read, created_at
      FROM alerts
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?
    `;

    const rows = await all(sql, [...params, parseInt(limit, 10)]);
    const alerts = rows.map((a) => ({ ...a, is_read: Boolean(a.is_read) }));

    const unreadCountRow = await get(
      'SELECT COUNT(*) as unread FROM alerts WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );

    res.json({
      success: true,
      alerts,
      unread_count: unreadCountRow ? parseInt(unreadCountRow.unread, 10) : 0
    });
  } catch (err) {
    next(err);
  }
}

export async function markAlertRead(req, res, next) {
  try {
    const { id } = req.params;
    const alert = await get('SELECT id FROM alerts WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found.' });
    }

    await run('UPDATE alerts SET is_read = 1 WHERE id = ?', [id]);
    res.json({ success: true, message: 'Alert marked as read.' });
  } catch (err) {
    next(err);
  }
}

export async function markAllAlertsRead(req, res, next) {
  try {
    await run('UPDATE alerts SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, message: 'All alerts marked as read.' });
  } catch (err) {
    next(err);
  }
}

export async function deleteAlert(req, res, next) {
  try {
    const { id } = req.params;
    const alert = await get('SELECT id FROM alerts WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found.' });
    }

    await run('DELETE FROM alerts WHERE id = ?', [id]);
    res.json({ success: true, message: 'Alert removed.' });
  } catch (err) {
    next(err);
  }
}
