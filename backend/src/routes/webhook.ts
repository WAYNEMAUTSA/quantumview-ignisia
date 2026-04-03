import { Router, Request, Response } from 'express';
import { applyEvent } from '../services/stateMachine.js';
import { NormalizedEvent } from '../types/index.js';

const router = Router();

// POST /webhook/razorpay — incoming Razorpay webhook
router.post('/razorpay', async (req: Request, res: Response) => {
  try {
    const body = req.body;

    // Extract event type from Razorpay payload
    const eventType = body.event; // e.g. 'payment.created', 'payment.authorized'
    const entity = body.payload?.payment?.entity;

    if (!entity?.id) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // Map Razorpay event to normalized state
    const stateMap: Record<string, string> = {
      'payment.created': 'created',
      'payment.authorized': 'authorized',
      'payment.captured': 'captured',
      'payment.failed': 'failed',
      'payment.refunded': 'refunded',
    };

    const normalizedState = stateMap[eventType] || 'unknown';

    const normalizedEvent: NormalizedEvent = {
      gatewayTxnId: entity.id,
      gateway: 'razorpay',
      eventType: normalizedState as any,
      gatewayTimestamp: new Date((entity.created_at ?? Math.floor(Date.now() / 1000)) * 1000),
      amount: entity.amount / 100, // Convert from paise to rupees
      currency: entity.currency || 'INR',
      idempotencyKey: `razorpay:${entity.id}:${eventType}`,
      rawPayload: body,
    };

    await applyEvent(normalizedEvent);

    return res.status(200).json({ received: true, eventId: entity.id });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
