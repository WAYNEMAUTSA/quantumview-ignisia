import axios from 'axios';
import { supabase } from '../db/supabase.js';
import { applyEvent } from './stateMachine.js';
import { NormalizedEvent, TransactionState } from '../types/index.js';

export async function healTransaction(
  transactionId: string,
  missingStates: string[],
  healJobId: string
): Promise<void> {
  // Step 1: Mark heal job as in_progress and increment attempts
  const { data: currentJob } = await supabase
    .from('heal_jobs')
    .select('attempts')
    .eq('id', healJobId)
    .single();

  const newAttempts = (currentJob?.attempts ?? 0) + 1;

  await supabase
    .from('heal_jobs')
    .update({
      status: 'in_progress',
      last_attempted_at: new Date().toISOString(),
      attempts: newAttempts,
    })
    .eq('id', healJobId);

  // Step 2: Look up the gateway_txn_id from transactions
  const { data: txn, error: txnErr } = await supabase
    .from('transactions')
    .select('gateway_txn_id, gateway')
    .eq('id', transactionId)
    .single();

  if (txnErr || !txn) {
    throw new Error(`Failed to fetch transaction: ${txnErr?.message ?? 'not found'}`);
  }

  const gatewayTxnId = txn.gateway_txn_id;

  // Step 3: Call the mock Razorpay fetch endpoint
  const selfUrl = process.env.SELF_URL ?? 'http://localhost:3000';
  const url = `${selfUrl}/mock/razorpay/${gatewayTxnId}/fetch`;

  let response;
  try {
    response = await axios.get<{
      status: string;
      transaction?: {
        id: string;
        ledger_state?: string;
        gateway_state?: string;
        events?: { event_type: string; timestamp: string }[];
      };
    }>(url, { validateStatus: () => true });
  } catch (err: any) {
    throw new Error(`Failed to call gateway fetch: ${err.message}`);
  }

  // Step 4: Handle 503 gateway outage
  if (response.status === 503) {
    const { data: healJob } = await supabase
      .from('heal_jobs')
      .select('attempts')
      .eq('id', healJobId)
      .single();

    const attempts = healJob?.attempts ?? 1;

    if (attempts >= 3) {
      await supabase.from('anomalies').insert({
        transaction_id: transactionId,
        type: 'gateway_outage',
        severity: 'high',
        description:
          'Razorpay returned 503 on all 3 fetch attempts. Manual review required.',
      });

      await supabase
        .from('heal_jobs')
        .update({ status: 'failed' })
        .eq('id', healJobId);
    } else {
      await supabase
        .from('heal_jobs')
        .update({ status: 'pending' })
        .eq('id', healJobId);
    }

    return;
  }

  // Step 5: Handle conflict
  if (response.data.status === 'conflict') {
    await supabase.from('anomalies').insert({
      transaction_id: transactionId,
      type: 'conflict',
      severity: 'high',
      description:
        'Ledger shows CAPTURED but Razorpay returned FAILED. States are mutually exclusive.',
    });

    await supabase
      .from('heal_jobs')
      .update({ status: 'failed' })
      .eq('id', healJobId);

    return;
  }

  // Step 6: Success path — inject missing events
  const events = response.data.transaction?.events ?? [];

  // Sort events by timestamp to replay in order
  const sortedEvents = events.sort(
    (a: any, b: any) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const evt of sortedEvents) {
    if (!missingStates.includes(evt.event_type)) continue;

    // Insert the recovered event into webhook_events
    const idempotencyKey = `razorpay:${gatewayTxnId}:${evt.event_type}`;

    await supabase
      .from('webhook_events')
      .insert({
        transaction_id: transactionId,
        idempotency_key: idempotencyKey,
        event_type: evt.event_type,
        gateway_timestamp: new Date(evt.timestamp),
        source: 'gateway_poll',
        raw_payload: evt,
      });

    // Re-run applyEvent for the injected event so the transaction state is updated
    const normalizedEvent: NormalizedEvent = {
      gatewayTxnId,
      gateway: 'razorpay',
      eventType: evt.event_type as TransactionState,
      gatewayTimestamp: new Date(evt.timestamp),
      amount: 0, // amount not needed for recovery replay
      currency: 'INR',
      idempotencyKey,
      rawPayload: evt,
    };

    await applyEvent(normalizedEvent);
  }

  // Mark heal job as resolved
  await supabase
    .from('heal_jobs')
    .update({
      status: 'resolved',
      resolution_notes: 'Auto-healed via Razorpay gateway poll',
    })
    .eq('id', healJobId);
}
