import { supabase } from '../db/supabase.js';
import { healQueue } from '../queues/index.js';
import { NormalizedEvent } from '../types/index.js';
import { getMissingStates } from './gapDetector.js';

export async function applyEvent(event: NormalizedEvent): Promise<void> {
  // Step 1: Upsert into transactions table
  const { data: txnData, error: txnError } = await supabase
    .from('transactions')
    .upsert(
      {
        gateway: event.gateway,
        gateway_txn_id: event.gatewayTxnId,
        current_state: event.eventType,
        amount: event.amount,
        currency: event.currency,
      },
      {
        onConflict: 'gateway,gateway_txn_id',
      }
    )
    .select('id')
    .single();

  if (txnError) {
    throw new Error(`Failed to upsert transaction: ${txnError.message}`);
  }

  const transactionId = txnData.id;

  // Step 2: Insert into webhook_events (idempotent)
  const { error: eventError } = await supabase
    .from('webhook_events')
    .insert({
      transaction_id: transactionId,
      idempotency_key: event.idempotencyKey,
      event_type: event.eventType,
      gateway_timestamp: event.gatewayTimestamp,
      source: 'webhook',
      raw_payload: event.rawPayload,
    });

  if (eventError) {
    // If this is a conflict on idempotency_key, the event was already processed
    if (eventError.code === '23505') {
      console.log('Duplicate event detected, skipping:', event.idempotencyKey);
      return;
    }
    throw new Error(`Failed to insert webhook_event: ${eventError.message}`);
  }

  // Step 3: Check for missing predecessor states
  const missingStates = await getMissingStates(transactionId, event.eventType);

  // Step 4a: No missing states — ledger is already up to date
  if (missingStates.length === 0) {
    return;
  }

  // Step 4b: Missing states detected — create a heal job
  const { data: healData, error: healError } = await supabase
    .from('heal_jobs')
    .insert({
      transaction_id: transactionId,
      status: 'pending',
      missing_states: missingStates,
    })
    .select('id')
    .single();

  if (healError) {
    throw new Error(`Failed to insert heal_job: ${healError.message}`);
  }

  await healQueue.add(`heal-${transactionId}`, {
    transactionId,
    missingStates,
    gateway: event.gateway,
    healJobId: healData.id,
  });

  // Mark the transaction state as unknown since we have gaps
  const { error: updateError } = await supabase
    .from('transactions')
    .update({ current_state: 'unknown' })
    .eq('id', transactionId);

  if (updateError) {
    throw new Error(
      `Failed to update transaction state to unknown: ${updateError.message}`
    );
  }
}
