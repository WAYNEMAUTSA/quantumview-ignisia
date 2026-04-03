import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

// ─── Route A: GET /mock/razorpay/:txnId/fetch ───────────────────────────
router.get('/razorpay/:txnId/fetch', async (req: Request, res: Response) => {
  const txnId = Array.isArray(req.params.txnId)
    ? req.params.txnId[0]
    : req.params.txnId;

  // Simulate gateway outage
  if (txnId.endsWith('503')) {
    return res.status(503).json({ error: 'gateway outage' });
  }

  // Simulate state conflict
  if (txnId.endsWith('conflict')) {
    return res.status(200).json({
      status: 'conflict',
      transaction: {
        id: txnId,
        ledger_state: 'captured',
        gateway_state: 'failed',
        events: [],
      },
    });
  }

  // Normal success path
  return res.status(200).json({
    status: 'success',
    transaction: {
      id: txnId,
      events: [
        { event_type: 'created', timestamp: new Date(Date.now() - 300000) },
        { event_type: 'authorized', timestamp: new Date(Date.now() - 240000) },
        { event_type: 'captured', timestamp: new Date(Date.now() - 180000) },
      ],
    },
  });
});

// ─── Route B: POST /mock/simulate ──────────────────────────────────────
router.post('/simulate', async (req: Request, res: Response) => {
  const { scenario }: { scenario: 'normal' | 'out_of_order' | 'surge' | 'dropped' } = req.body;

  const selfUrl = process.env.SELF_URL ?? 'http://localhost:3000';
  const webhookUrl = `${selfUrl}/webhook/razorpay`;

  function razorpayPayload(event: string, txnId: string) {
    return {
      event,
      payload: {
        payment: {
          entity: {
            id: txnId,
            amount: 420000,
            currency: 'INR',
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };
  }

  const payloads: { event: string; txnId: string }[] = [];

  if (scenario === 'normal') {
    const ids = ['pay_NORMAL001', 'pay_NORMAL002', 'pay_NORMAL003'];
    const events = ['payment.created', 'payment.authorized', 'payment.captured'];
    for (const txnId of ids) {
      for (const evt of events) {
        payloads.push({ event: evt, txnId });
      }
    }
  }

  if (scenario === 'out_of_order') {
    const ids = ['pay_OOO001', 'pay_OOO002'];
    for (const txnId of ids) {
      payloads.push({ event: 'payment.captured', txnId });
      payloads.push({ event: 'payment.authorized', txnId });
    }
  }

  if (scenario === 'surge') {
    const ids = Array.from({ length: 10 }, (_, i) => `pay_SURGE${String(i + 1).padStart(3, '0')}`);
    const events = ['payment.created', 'payment.authorized', 'payment.captured'];

    for (const txnId of ids) {
      for (const evt of events) {
        payloads.push({ event: evt, txnId });
      }
    }
    // Duplicates
    for (const txnId of ids) {
      for (const evt of events) {
        payloads.push({ event: evt, txnId });
      }
    }
  }

  if (scenario === 'dropped') {
    const ids = ['pay_DROP001', 'pay_DROP002'];
    for (const txnId of ids) {
      payloads.push({ event: 'payment.captured', txnId });
    }
  }

  // Fire webhooks sequentially with small delay to avoid overwhelming the server
  let fired = 0;
  let failed = 0;
  for (const { event, txnId } of payloads) {
    try {
      await axios.post(webhookUrl, razorpayPayload(event, txnId), { timeout: 5000 });
      fired++;
    } catch {
      failed++;
    }
    // Small delay between requests
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return res.status(200).json({ fired, failed, scenario });
});

export default router;
