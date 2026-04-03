import { supabase } from '../db/supabase.js';
import { TransactionState } from '../types/index.js';

// The expected order of lifecycle states for a healthy transaction
const LIFECYCLE_ORDER: TransactionState[] = [
  'initiated',
  'created',
  'authorized',
  'captured',
  'settled',
];

/**
 * Given a transaction ID and the latest event type, detect which
 * predecessor states are missing from the event log.
 */
export async function getMissingStates(
  transactionId: string,
  latestEventType: TransactionState
): Promise<string[]> {
  // Get all events for this transaction ordered by timestamp
  const { data: events, error } = await supabase
    .from('webhook_events')
    .select('event_type')
    .eq('transaction_id', transactionId)
    .order('gateway_timestamp', { ascending: true });

  if (error) {
    console.error('Failed to fetch events for gap detection:', error.message);
    return [];
  }

  const presentStates = new Set(events?.map((e) => e.event_type) || []);

  // Find the index of the latest state in the lifecycle
  const latestIndex = LIFECYCLE_ORDER.indexOf(latestEventType);
  if (latestIndex === -1) {
    // Unknown state — can't determine gaps
    return [];
  }

  // Check which predecessors are missing
  const missing: string[] = [];
  for (let i = 0; i < latestIndex; i++) {
    const state = LIFECYCLE_ORDER[i];
    if (!presentStates.has(state)) {
      missing.push(state);
    }
  }

  return missing;
}
