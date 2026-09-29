import crypto from 'crypto';
import { all, get, run } from '../services/db.js';

export async function getDevices(req, res, next) {
  try {
    const devices = await all(
      'SELECT id, name, device_type, status, ip_address, user_agent, last_ping, created_at FROM devices WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ success: true, devices });
  } catch (err) {
    next(err);
  }
}

export async function createDevice(req, res, next) {
  try {
    const { name, device_type = 'phone_camera', home_id } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Device name is required.' });
    }

    const deviceId = `dev_${crypto.randomUUID().slice(0, 8)}`;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || '';

    await run(
      'INSERT INTO devices (id, user_id, home_id, name, device_type, status, ip_address, user_agent, last_ping) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [deviceId, req.user.id, home_id || null, name, device_type, 'online', ip, userAgent, new Date().toISOString()]
    );

    const device = await get('SELECT * FROM devices WHERE id = ?', [deviceId]);
    res.status(201).json({ success: true, device });
  } catch (err) {
    next(err);
  }
}

export async function updateDeviceStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const device = await get('SELECT id FROM devices WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found.' });
    }

    await run(
      'UPDATE devices SET status = ?, last_ping = ? WHERE id = ?',
      [status, new Date().toISOString(), id]
    );

    res.json({ success: true, message: 'Device status updated.', status });
  } catch (err) {
    next(err);
  }
}
