import express from 'express';
import { checkHealth as checkDbHealth } from '../services/db.js';

const router = express.Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const DATA_SCIENCE_URL = process.env.DATA_SCIENCE_URL || 'http://127.0.0.1:8001';

router.get('/health', async (req, res) => {
  const timestamp = new Date().toISOString();

  // 1. Check Database
  const dbHealth = await checkDbHealth();

  // 2. Check AI Service
  let aiStatus = 'offline';
  let aiDetails = null;
  try {
    const aiRes = await fetch(`${AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(1500) });
    if (aiRes.ok) {
      aiStatus = 'online';
      aiDetails = await aiRes.json();
    }
  } catch (err) {
    aiStatus = 'offline';
  }

  // 3. Check Data Science Service
  let dsStatus = 'offline';
  let dsDetails = null;
  try {
    const dsRes = await fetch(`${DATA_SCIENCE_URL}/health`, { signal: AbortSignal.timeout(1500) });
    if (dsRes.ok) {
      dsStatus = 'online';
      dsDetails = await dsRes.json();
    }
  } catch (err) {
    dsStatus = 'offline';
  }

  const overallStatus = (dbHealth.status === 'online' && aiStatus === 'online') ? 'healthy' : 'degraded';

  res.json({
    status: overallStatus,
    backend: 'online',
    database: dbHealth.status,
    database_type: dbHealth.type || 'unknown',
    ai_service: aiStatus,
    data_science: dsStatus,
    timestamp,
    services: {
      ai: aiDetails,
      data_science: dsDetails
    }
  });
});

export default router;
