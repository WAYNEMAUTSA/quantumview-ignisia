import { Router, Request, Response } from 'express';
import { extractRazorpayContext, chaosHealer } from '../agents/chaosHealer.js';
import { supabase } from '../db/supabase.js';

const router = Router();

// POST /webhook/razorpay — incoming Razorpay webhook with real-time chaos healing
router.post('/razorpay', async (req: Request, res: Response) => {
  try {
    const body = req.body;

    // Extract context from Razorpay payload (handles nested or flat)
    const ctx = extractRazorpayContext(body);

    if (!ctx) {
      return res.status(400).json({ error: 'Invalid webhook payload — no transaction ID found' });
    }

    // Run through the Chaos Healer — handles out-of-order, dropped, duplicates
    const result = await chaosHealer(ctx);

    // Duplicate suppression — silently accepted, no anomaly created
    if (result.suppressed) {
      return res.status(200).json({
        received: true,
        eventId: ctx.gatewayTxnId,
        suppressed: true,
        agent_log: result.agent_log,
      });
    }

    // If the healer created synthetic bridge events, report it
    if (result.status === 'healed') {
      return res.status(200).json({
        received: true,
        eventId: ctx.gatewayTxnId,
        healed: true,
        events_processed: result.events_processed,
        agent_log: result.agent_log,
      });
    }

    // Normal processing
    return res.status(200).json({
      received: true,
      eventId: ctx.gatewayTxnId,
      agent_log: result.agent_log,
    });
  } catch (err: any) {
    console.error('[Webhook] Processing error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /webhook/stats/:txnId — Get transaction event timeline
router.get('/stats/:txnId', async (req: Request, res: Response) => {
  try {
    const { txnId } = req.params;

    const { data: txn } = await supabase
      .from('transactions')
      .select('*')
      .eq('gateway_txn_id', txnId)
      .single();

    if (!txn) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const { data: events } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('transaction_id', txn.id)
      .order('gateway_timestamp', { ascending: true });

    return res.json({
      transaction: txn,
      events: events || [],
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
