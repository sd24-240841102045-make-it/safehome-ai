import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/db.js';
import { config } from '../config.js';
import { logger } from '../services/logger.js';

export function createHealthRouter(db: DatabaseService): Router {
  const router = Router();

  // 1. Overall System Health Check
  router.get('/health', async (req: Request, res: Response) => {
    const timestamp = new Date().toISOString();

    // Check Database
    const dbHealth = await db.checkHealth();

    // Check Unified Python AI Service
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
      modules: aiDetails?.modules || null,
      hardware: aiDetails?.hardware || null
    });
  });

  // 2. Hardware Acceleration & GPU Status Telemetry
  router.get('/system/hardware', async (req: Request, res: Response) => {
    try {
      const resp = await fetch(`${config.PYTHON_SERVICE_URL}/hardware`, {
        headers: {
          'X-Internal-Secret': config.AI_SERVICE_SECRET
        },
        signal: AbortSignal.timeout(2000)
      });
      if (resp.ok) {
        const data = await resp.json();
        return res.json(data);
      }
      return res.status(502).json({ success: false, error: 'Hardware service unavailable' });
    } catch (err: any) {
      return res.json({
        success: true,
        hardware: {
          accelerator: 'CPU',
          gpu_available: false,
          device_name: 'CPU Multi-threaded',
          inference_mode: 'CPU SIMD',
          target_device: 'cpu'
        }
      });
    }
  });

  return router;
}
