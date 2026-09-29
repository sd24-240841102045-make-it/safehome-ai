import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { DatabaseService } from '../services/db.js';
import { CreatePairingCodeSchema, ExchangePairingCodeSchema } from '../shared/schemas.js';
import { config } from '../config.js';
import { pairingLimiter } from '../middleware/rateLimit.js';

export function createDevicesRouter(db: DatabaseService, authMiddleware: any): Router {
  const router = Router();

  // 1. List User's Devices (Authenticated)
  router.get('/devices', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const devices = await db.query(
        'SELECT id, home_id, name, device_type, status, ip_address, last_seen, created_at FROM devices WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );
      res.json({ success: true, devices });
    } catch (err) {
      next(err);
    }
  });

  // 2. Generate 6-digit Pairing Code (Expires in 5 minutes, single-use)
  router.post('/devices/pair/generate', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { home_id, device_name = 'Android Phone Camera' } = CreatePairingCodeSchema.parse(req.body);

      // Default home_id to user's primary home if not supplied
      let targetHomeId = home_id;
      if (!targetHomeId) {
        const home = await db.get('SELECT id FROM homes WHERE user_id = ? LIMIT 1', [userId]);
        targetHomeId = home?.id || crypto.randomUUID();
      }

      // Generate random 6-character alphanumeric code
      const code = crypto.randomBytes(3).toString('hex').toUpperCase();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

      await db.run(
        `INSERT INTO pairing_codes (id, user_id, home_id, code, device_name, expires_at, is_used)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [crypto.randomUUID(), userId, targetHomeId, code, device_name, expiresAt]
      );

      res.status(201).json({
        success: true,
        pairing_code: code,
        expires_at: expiresAt,
        message: 'Pairing code valid for 5 minutes.'
      });
    } catch (err: any) {
      next(err);
    }
  });

  // 3. Exchange Pairing Code for Device-Scoped Token (Phone Calling In, Rate-Limited)
  router.post('/devices/pair', pairingLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = ExchangePairingCodeSchema.parse(req.body);

      const pairing = await db.get(
        'SELECT * FROM pairing_codes WHERE code = ? AND is_used = 0',
        [code.toUpperCase()]
      );

      if (!pairing) {
        return res.status(400).json({ success: false, error: 'Invalid or already used pairing code.' });
      }

      if (new Date(pairing.expires_at) < new Date()) {
        return res.status(400).json({ success: false, error: 'Pairing code has expired. Please generate a new one.' });
      }

      // Mark pairing code as used (single-use)
      await db.run('UPDATE pairing_codes SET is_used = 1 WHERE id = ?', [pairing.id]);

      // Create new device record
      const deviceId = crypto.randomUUID();
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

      await db.run(
        `INSERT INTO devices (id, user_id, home_id, name, device_type, status, ip_address, last_seen)
         VALUES (?, ?, ?, ?, 'phone_camera', 'online', ?, ?)`,
        [deviceId, pairing.user_id, pairing.home_id, pairing.device_name, ip, new Date().toISOString()]
      );

      // Issue device-scoped JWT token valid strictly for this device
      const deviceToken = jwt.sign(
        {
          sub: pairing.user_id,
          device_id: deviceId,
          home_id: pairing.home_id,
          role: 'device_sensor'
        },
        config.JWT_SECRET,
        { expiresIn: '30d' }
      );

      res.json({
        success: true,
        device_id: deviceId,
        device_token: deviceToken,
        message: 'Device successfully paired to home.'
      });
    } catch (err: any) {
      next(err);
    }
  });

  // 4. Delete / Unpair Device (User-Scoped)
  router.delete('/devices/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const device = await db.get('SELECT id FROM devices WHERE id = ? AND user_id = ?', [id, userId]);
      if (!device) {
        return res.status(404).json({ success: false, error: 'Device not found or access denied.' });
      }

      await db.run('DELETE FROM devices WHERE id = ?', [id]);
      res.json({ success: true, message: 'Device unpaired and deleted.' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
