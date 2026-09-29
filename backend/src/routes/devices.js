import express from 'express';
import { getDevices, createDevice, updateDeviceStatus } from '../controllers/deviceController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.get('/', getDevices);
router.post('/', createDevice);
router.patch('/:id/status', updateDeviceStatus);

export default router;
