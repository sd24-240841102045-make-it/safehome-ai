import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/db.js';
import { config } from '../config.js';
import { logger } from '../services/logger.js';

export function createHealthRouter(db: DatabaseService): Router {
  const router = Router();

  router.get('/health', async (req: Request, res: Response) => {
    const timestamp = new Date().toISOString();

    // 1. Check Database
    const dbHealth = await db.checkHealth();

    // 2. Check Unified Python AI Service
    let aiStatus: 'online' | 'offline' = 'offline';
    let aiDetails: any = null;
    try {
      const resp = await fetch(`${config.PYTHON_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(1500)
      });
      if (resp.ok) {
        aiStatus = 'online';
        aiDetails = await resp.json();
      }
    } catch (err: any) {
      aiStatus = 'offline';
      logger.warn('[Health] Python AI service check unreachable:', err.message);
    }

    const overallStatus = dbHealth.status === 'online' && aiStatus === 'online' ? 'healthy' : 'degraded';

    res.json({
      status: overallStatus,
      backend: 'online',
      database: dbHealth.status,
      database_type: dbHealth.type,
      ai_service: aiStatus,
      timestamp,
      modules: aiDetails?.modules || null
    });
  });

  return router;
}
