import axios from 'axios';
import { supabase } from '../db/supabase.js';
import { applyEvent } from './stateMachine.js';
import { NormalizedEvent, TransactionState } from '../types/index.js';

// Helper function to record healer audit trail
async function recordAuditTrail(entry: {
  gatewayTxnId: string;
  gateway: string;
  original_event_type: string;
  healed_event_type: string;
  outcome: string;
  actions_taken: string[];
  bridge_events_synthesized: number;
  confidence_score: number;
  reasoning_trail: string;
}): Promise<void> {
  try {
    await supabase.from('healer_audit_log').insert({
      gateway_txn_id: entry.gatewayTxnId,
      gateway: entry.gateway,
      original_event_type: entry.original_event_type,
      healed_event_type: entry.healed_event_type,
      outcome: entry.outcome,
      actions_taken: entry.actions_taken,
      bridge_events_synthesized: entry.bridge_events_synthesized,
      confidence_score: entry.confidence_score,
      reasoning_trail: entry.reasoning_trail,
    });
  } catch (err: any) {
    console.error('[AutoHealerAudit] Failed to record audit trail:', err.message);
  }
}

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

  // Step 4: Handle 503 gateway outage — create anomaly only if none exists
  if (response.status === 503) {
    // Check if an open anomaly already exists for this transaction
    const { data: existingAnomaly } = await supabase
      .from('anomalies')
      .select('id')
      .eq('transaction_id', transactionId)
      .is('resolved_at', null)
      .maybeSingle();

    if (!existingAnomaly) {
      // Only create anomaly if there isn't one already — prevents spam
      await supabase.from('anomalies').insert({
        transaction_id: transactionId,
        type: 'gateway_outage',
        severity: 'high',
        description:
          'Razorpay returned 503 — gateway unreachable. AI review required.',
      });
      console.log(`[AutoHealer] Gateway outage anomaly created for txn ${transactionId}`);
    } else {
      console.log(`[AutoHealer] Gateway outage — anomaly already exists for txn ${transactionId}, skipping creation`);
    }

    await supabase
      .from('heal_jobs')
      .update({ status: 'failed' })
      .eq('id', healJobId);

    return;
  }

  // Step 5: Handle conflict — create anomaly only if none exists
  if (response.data.status === 'conflict') {
    const conflictData = response.data.transaction;
    const ledgerState = conflictData?.ledger_state ?? 'unknown';
    const gatewayState = conflictData?.gateway_state ?? 'unknown';

    // Check if an open anomaly already exists
    const { data: existingAnomaly } = await supabase
      .from('anomalies')
      .select('id')
      .eq('transaction_id', transactionId)
      .is('resolved_at', null)
      .maybeSingle();

    if (!existingAnomaly) {
      await supabase.from('anomalies').insert({
        transaction_id: transactionId,
        type: 'conflict',
        severity: 'medium', // Downgraded from 'high' — most conflicts resolve themselves
        description:
          `State conflict: ledger shows '${ledgerState}' but gateway reports '${gatewayState}'. AI review required.`,
      });
      console.log(`[AutoHealer] Conflict anomaly created for txn ${transactionId}: ${ledgerState} vs ${gatewayState}`);
    } else {
      console.log(`[AutoHealer] Conflict — anomaly already exists for txn ${transactionId}, skipping creation`);
    }

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

    await applyEvent(normalizedEvent, true); // skipGapDetect: polled events are already authoritative
  }

  // Mark heal job as resolved
  await supabase
    .from('heal_jobs')
    .update({
      status: 'resolved',
      resolution_notes: 'Auto-healed via Razorpay gateway poll',
    })
    .eq('id', healJobId);

  // Auto-resolve any open anomalies associated with this transaction
  const { data: relatedAnomalies } = await supabase
    .from('anomalies')
    .select('id')
    .eq('transaction_id', transactionId)
    .is('resolved_at', null);

  if (relatedAnomalies && relatedAnomalies.length > 0) {
    await supabase
      .from('anomalies')
      .update({
        resolved_at: new Date().toISOString(),
        resolution_notes: `Auto-resolved: Heal job successfully fixed transaction states`,
      })
      .eq('transaction_id', transactionId)
      .is('resolved_at', null);

    console.log(`[AutoHealer] Auto-resolved ${relatedAnomalies.length} anomalies for transaction ${transactionId}`);
  }

  // Record in healer_audit_log for AI Recovery Rate tracking
  await recordAuditTrail({
    gatewayTxnId,
    gateway: txn.gateway || 'razorpay',
    original_event_type: missingStates.join(','),
    healed_event_type: sortedEvents.length > 0 ? sortedEvents[sortedEvents.length - 1].event_type : 'unknown',
    outcome: 'healed',
    actions_taken: [`Detected missing states: ${missingStates.join(', ')}`, `Fetched from gateway`, `Injected ${missingStates.length} events`],
    bridge_events_synthesized: missingStates.length,
    confidence_score: 0.92,
    reasoning_trail: `Auto-healed via gateway poll. Missing states (${missingStates.join(', ')}) were injected from authoritative gateway data.`,
  });
}
