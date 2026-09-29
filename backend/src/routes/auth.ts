import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/supabase.js';
import { DatabaseService } from '../services/db.js';

const RegisterSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  full_name: z.string().min(2, 'Full name is required')
});

const LoginSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required')
});

export function createAuthRouter(authService: AuthService, db: DatabaseService, authMiddleware: any): Router {
  const router = Router();

  // 1. Register Homeowner Account
  router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = RegisterSchema.parse(req.body);
      const result = await authService.register(validated.email, validated.password, validated.full_name);

      res.status(201).json({
        success: true,
        message: 'Account registered successfully.',
        user: result.user,
        token: result.token
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: err.errors[0].message });
      }
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // 2. Login Homeowner
  router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = LoginSchema.parse(req.body);
      const result = await authService.login(validated.email, validated.password);

      res.json({
        success: true,
        message: 'Authentication successful.',
        user: result.user,
        token: result.token
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: err.errors[0].message });
      }
      res.status(401).json({ success: false, error: err.message || 'Invalid email or password' });
    }
  });

  // 3. Current User Profile & Home Context
  router.get('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      const profile = await db.get(
        'SELECT id, email, full_name, role, created_at FROM profiles WHERE id = ?',
        [userId]
      );

      const home = await db.get(
        'SELECT id, name, address, timezone, active_hours_start, active_hours_end FROM homes WHERE user_id = ? LIMIT 1',
        [userId]
      );

      const settings = await db.get(
        'SELECT * FROM user_settings WHERE user_id = ?',
        [userId]
      );

      res.json({
        success: true,
        user: profile || req.user,
        home: home || null,
        settings: settings || null
      });
    } catch (err) {
      next(err);
    }
  });

  // 4. Logout
  router.post('/logout', authMiddleware, (req: Request, res: Response) => {
    res.json({ success: true, message: 'Logged out successfully.' });
  });

  return router;
}
