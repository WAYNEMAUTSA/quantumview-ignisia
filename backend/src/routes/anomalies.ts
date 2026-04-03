import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabase.js';
import { applyEvent } from '../services/stateMachine.js';
import axios from 'axios';

const router = Router();

// GET /anomalies — unresolved anomalies with transaction data
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { data: anomalies, error } = await supabase
      .from('anomalies')
      .select(
        `
        *,
        transactions (
          gateway,
          gateway_txn_id,
          amount
        )
      `
      )
      .is('resolved_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ data: anomalies });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /anomalies/:id/resolve — mark anomaly as resolved and update transaction state
router.patch('/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { note, targetState } = req.body;

    // First, get the anomaly with its transaction
    const { data: anomaly, error: anomalyErr } = await supabase
      .from('anomalies')
      .select('*, transactions(gateway, gateway_txn_id, amount, current_state)')
      .eq('id', id)
      .single();

    if (anomalyErr || !anomaly) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }

    // If targetState is provided, update the transaction's current_state
    if (targetState && anomaly.transactions) {
      await supabase
        .from('transactions')
        .update({ current_state: targetState })
        .eq('gateway_txn_id', anomaly.transactions.gateway_txn_id);
    }

    // Mark the anomaly as resolved
    const { data, error } = await supabase
      .from('anomalies')
      .update({
        resolved_at: new Date().toISOString(),
        resolution_notes: note || 'Manually resolved',
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /anomalies/:id/refetch — retry fetching from gateway and replay events
router.post('/:id/refetch', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get the anomaly with its transaction
    const { data: anomaly, error: anomalyErr } = await supabase
      .from('anomalies')
      .select('*, transactions(gateway, gateway_txn_id, amount, current_state)')
      .eq('id', id)
      .single();

    if (anomalyErr || !anomaly) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }

    if (!anomaly.transactions?.gateway_txn_id) {
      return res.status(400).json({ error: 'No gateway_txn_id found for this transaction' });
    }

    const gatewayTxnId = anomaly.transactions.gateway_txn_id;
    const selfUrl = process.env.SELF_URL ?? 'http://localhost:3000';
    const fetchUrl = `${selfUrl}/mock/razorpay/${gatewayTxnId}/fetch`;

    // Call the mock gateway to fetch current state
    const response = await axios.get(fetchUrl, { validateStatus: () => true });

    if (response.status === 503) {
      return res.status(503).json({ error: 'Gateway is currently unavailable. Try again later.' });
    }

    if (response.status === 200 && response.data.status === 'conflict') {
      return res.status(409).json({
        error: 'State conflict detected. Manual review still required.',
        conflict: response.data.transaction,
      });
    }

    // Replay the events from the gateway
    const events = response.data.transaction?.events ?? [];
    const sortedEvents = events.sort(
      (a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let replayed = 0;
    for (const evt of sortedEvents) {
      const idempotencyKey = `razorpay:${gatewayTxnId}:${evt.event_type}`;

      // Insert the recovered event into webhook_events (ignore duplicates)
      const { error: eventError } = await supabase
        .from('webhook_events')
        .insert({
          transaction_id: anomaly.transactions.id,
          idempotency_key: idempotencyKey,
          event_type: evt.event_type,
          gateway_timestamp: new Date(evt.timestamp),
          source: 'gateway_poll',
          raw_payload: evt,
        });

      // Skip if duplicate (idempotency conflict)
      if (eventError && eventError.code !== '23505') {
        console.error('Failed to insert recovered event:', eventError.message);
        continue;
      }

      if (!eventError) {
        replayed++;
      }
    }

    // Update the transaction state
    if (sortedEvents.length > 0) {
      const latestState = sortedEvents[sortedEvents.length - 1].event_type;
      await supabase
        .from('transactions')
        .update({ current_state: latestState })
        .eq('gateway_txn_id', gatewayTxnId);
    }

    return res.json({
      message: `Re-fetched and replayed ${replayed} events from gateway.`,
      replayed,
      total: sortedEvents.length,
      newState: sortedEvents.length > 0 ? sortedEvents[sortedEvents.length - 1].event_type : null,
    });
  } catch (err: any) {
    console.error('Re-fetch error:', err.message);
    return res.status(500).json({ error: `Failed to re-fetch: ${err.message}` });
  }
});

export default router;
