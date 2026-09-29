import express from 'express';
import { getEvents, getEventById, createEvent } from '../controllers/eventController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.get('/', getEvents);
router.get('/:id', getEventById);
router.post('/', createEvent);

export default router;
