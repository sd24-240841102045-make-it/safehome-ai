import { Request, Response, NextFunction } from 'express';
import { AuthService, AuthUser } from '../services/supabase.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      token?: string;
    }
  }
}

export function createAuthMiddleware(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required. No Bearer token provided.'
        });
      }

      const token = authHeader.split(' ')[1];
      const user = await authService.verifyToken(token);

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired session token.'
        });
      }

      // Identity derived strictly from verified token (Non-negotiable Rule 5)
      req.user = user;
      req.token = token;
      next();
    } catch (err: any) {
      return res.status(401).json({
        success: false,
        error: 'Authentication verification failed: ' + err.message
      });
    }
  };
}
