import express from 'express';
import { getAlerts, markAlertRead, markAllAlertsRead, deleteAlert } from '../controllers/alertController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.get('/', getAlerts);
router.patch('/:id', markAlertRead);
router.post('/mark-all-read', markAllAlertsRead);
router.delete('/:id', deleteAlert);

export default router;
