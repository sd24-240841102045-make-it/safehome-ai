import express from 'express';
import { getDashboardSummary, getAnalytics } from '../controllers/analyticsController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.get('/dashboard', getDashboardSummary);
router.get('/', getAnalytics);

export default router;
