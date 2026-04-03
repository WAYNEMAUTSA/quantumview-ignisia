import { supabase } from '../db/supabase';

export const REQUIRED_PREDECESSORS: Record<string, string[]> = {
  'authorized': ['created'],
  'captured': ['created', 'authorized'],
  'settled': ['created', 'authorized', 'captured'],
  'failed': ['created'],
  'refund_initiated': ['created', 'authorized', 'captured', 'settled'],
  'refunded': ['created', 'authorized', 'captured', 'settled', 'refund_initiated'],
  'disputed': ['created', 'authorized', 'captured', 'settled'],
  'created': [],
};

export async function getMissingStates(
  transactionId: string,
  incomingState: string
): Promise<string[]> {
  const required = REQUIRED_PREDECESSORS[incomingState];
  if (!required || required.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('webhook_events')
    .select('event_type')
    .eq('transaction_id', transactionId);

  if (error) {
    throw new Error(`Failed to query webhook_events: ${error.message}`);
  }

  const observedStates = new Set(data.map((row) => row.event_type));
  const missing = required.filter((state) => !observedStates.has(state));

  return missing;
}
