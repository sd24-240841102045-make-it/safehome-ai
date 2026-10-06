import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { DatabaseService } from '../services/db.js';
import { RazorpayPaymentService } from '../services/razorpay.js';
import { logger } from '../services/logger.js';

const CreateOrderSchema = z.object({
  plan_id: z.enum(['pro', 'enterprise']),
  billing_cycle: z.enum(['monthly', 'yearly']).default('monthly'),
  home_id: z.string().optional()
});

const VerifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1)
});

export function createPaymentsRouter(db: DatabaseService, authMiddleware: any): Router {
  const router = Router();
  const paymentService = new RazorpayPaymentService(db);

  /**
   * GET /api/payments/config
   * Public endpoint to fetch Razorpay public key & checkout options
   */
  router.get('/payments/config', (req: Request, res: Response) => {
    try {
      const config = paymentService.getPublicConfig();
      res.json({ success: true, data: config });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/payments/plans
   * List available subscription plans & pricing
   */
  router.get('/payments/plans', (req: Request, res: Response) => {
    try {
      const plans = paymentService.getAvailablePlans();
      res.json({ success: true, data: plans });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Protected Payments Endpoints
   */
  router.use('/payments/subscription', authMiddleware);
  router.use('/payments/history', authMiddleware);
  router.use('/payments/invoice', authMiddleware);
  router.use('/payments/create-order', authMiddleware);
  router.use('/payments/verify', authMiddleware);
  router.use('/payments/cancel-subscription', authMiddleware);

  /**
   * GET /api/payments/subscription
   * Get active subscription details for the authenticated homeowner
   */
  router.get('/payments/subscription', async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const subscription = await paymentService.getUserSubscription(userId);
      res.json({ success: true, data: subscription });
    } catch (err: any) {
      logger.error(`[Payments API] Failed to fetch subscription: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/payments/history
   * Get payment invoices & transaction history
   */
  router.get('/payments/history', async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const history = await paymentService.getUserPaymentHistory(userId);
      res.json({ success: true, data: history });
    } catch (err: any) {
      logger.error(`[Payments API] Failed to fetch payment history: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/payments/invoice/:id
   * Get printable invoice data for a completed payment
   */
  router.get('/payments/invoice/:id', async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const invoiceId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const invoice = await paymentService.getInvoiceDetails(invoiceId, userId);
      res.json({ success: true, data: invoice });
    } catch (err: any) {
      res.status(404).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/payments/create-order
   * Create a new Razorpay checkout order
   */
  router.post('/payments/create-order', async (req: Request, res: Response) => {
    try {
      const parsed = CreateOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.format()
        });
      }

      const userId = req.user!.id;
      const order = await paymentService.createOrder({
        userId,
        homeId: parsed.data.home_id,
        planId: parsed.data.plan_id,
        billingCycle: parsed.data.billing_cycle
      });

      res.status(201).json({ success: true, data: order });
    } catch (err: any) {
      logger.error(`[Payments API] Order creation error: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/payments/verify
   * Cryptographically verify payment signature & activate subscription
   */
  router.post('/payments/verify', async (req: Request, res: Response) => {
    try {
      const parsed = VerifyPaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid payment verification payload',
          details: parsed.error.format()
        });
      }

      const userId = req.user!.id;
      const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';

      const result = await paymentService.verifyPayment({
        userId,
        razorpayOrderId: parsed.data.razorpay_order_id,
        razorpayPaymentId: parsed.data.razorpay_payment_id,
        razorpaySignature: parsed.data.razorpay_signature,
        ipAddress: ip
      });

      res.json({ success: true, data: result });
    } catch (err: any) {
      logger.error(`[Payments API] Verification failure: ${err.message}`);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/payments/cancel-subscription
   * Cancel active paid plan and revert homeowner to Complimentary Free tier
   */
  router.post('/payments/cancel-subscription', async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const reason = req.body?.reason;

      const result = await paymentService.cancelSubscription(userId, reason, ip);
      res.json({ success: true, data: result });
    } catch (err: any) {
      logger.error(`[Payments API] Cancellation failure: ${err.message}`);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/payments/webhook
   * Handle Razorpay asynchronous webhooks
   */
  router.post('/payments/webhook', async (req: Request, res: Response) => {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      const rawBody = JSON.stringify(req.body);

      if (signature) {
        const isValid = paymentService.verifyWebhookSignature(rawBody, signature);
        if (!isValid) {
          logger.warn('[Razorpay Webhook] Invalid webhook signature detected.');
          return res.status(400).json({ status: 'invalid_signature' });
        }
      }

      const event = req.body?.event;
      logger.info(`[Razorpay Webhook] Received event: ${event}`);

      // Process payment.captured or order.paid
      if (event === 'payment.captured' && req.body?.payload?.payment?.entity) {
        const p = req.body.payload.payment.entity;
        const orderId = p.order_id;
        const paymentId = p.id;
        if (orderId && paymentId) {
          await db.run(
            `UPDATE payments SET status = 'captured', razorpay_payment_id = ?, updated_at = CURRENT_TIMESTAMP WHERE razorpay_order_id = ?`,
            [paymentId, orderId]
          );
        }
      }

      res.json({ status: 'ok' });
    } catch (err: any) {
      logger.error(`[Razorpay Webhook] Error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
