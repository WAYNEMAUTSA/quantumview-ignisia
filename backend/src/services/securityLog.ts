import { supabase } from '../db/supabase.js';
import { SecurityLogEntry } from '../types/index.js';

/**
 * Log a fraud assessment to the security dashboard (Supabase).
 * Creates a record in `security_logs` table for blocked/dropped requests.
 */
export async function logSecurityEvent(entry: SecurityLogEntry): Promise<void> {
  try {
    const { error } = await supabase.from('security_logs').insert({
      gateway_txn_id: entry.gateway_txn_id,
      event_type: entry.event_type,
      risk_score: entry.risk_score,
      fraud_flag: entry.fraud_flag,
      assessment: entry.assessment,
      original_timestamp: entry.original_timestamp,
      retry_timestamp: entry.retry_timestamp,
      time_delta_ms: entry.time_delta_ms,
      header_consistency: entry.header_consistency,
      flagged_fields: entry.flagged_fields,
      request_headers: entry.request_headers,
      original_headers: entry.original_headers,
      ip_address: entry.ip_address,
      user_agent: entry.user_agent,
    });

    if (error) {
      console.error('[SecurityLog] Failed to log security event:', error.message);
      return;
    }

    const level = entry.fraud_flag ? 'BLOCKED' : entry.assessment === 'drop' ? 'DROPPED' : 'ALLOWED';
    console.log(
      `[SecurityLog] ${level} — txn: ${entry.gateway_txn_id}, risk: ${entry.risk_score}, ` +
      `delta: ${entry.time_delta_ms}ms, consistency: ${(entry.header_consistency * 100).toFixed(0)}%`
    );
  } catch (err: any) {
    // Never crash the pipeline on audit failure
    console.error('[SecurityLog] Unexpected error:', err.message);
  }
}

/**
 * Fetch recent security log entries for the dashboard.
 */
export async function getSecurityLogs(limit = 50, offset = 0): Promise<{
  entries: SecurityLogEntry[];
  total: number;
}> {
  const { data, count, error } = await supabase
    .from('security_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[SecurityLog] Failed to fetch logs:', error.message);
    return { entries: [], total: 0 };
  }

  return { entries: (data || []) as SecurityLogEntry[], total: count || 0 };
}

/**
 * Get fraud statistics for the dashboard summary.
 */
export async function getFraudStats(): Promise<{
  totalBlocked: number;
  totalDropped: number;
  totalAllowed: number;
  avgRiskScore: number;
  topFlaggedFields: { field: string; count: number }[];
}> {
  const [blockedRes, droppedRes, allowedRes, riskRes] = await Promise.all([
    supabase.from('security_logs').select('id', { count: 'exact', head: true }).eq('assessment', 'block'),
    supabase.from('security_logs').select('id', { count: 'exact', head: true }).eq('assessment', 'drop'),
    supabase.from('security_logs').select('id', { count: 'exact', head: true }).eq('assessment', 'allow'),
    supabase.from('security_logs').select('risk_score'),
  ]);

  const riskScores = (riskRes.data || []).map((d: any) => d.risk_score as number);
  const avgRisk = riskScores.length > 0
    ? riskScores.reduce((a: number, b: number) => a + b, 0) / riskScores.length
    : 0;

  // Top flagged fields (approximate — in production use a proper aggregation)
  const fieldCounts = new Map<string, number>();
  const allLogs = (await supabase.from('security_logs').select('flagged_fields')).data || [];
  for (const log of allLogs as any[]) {
    for (const field of (log.flagged_fields || [])) {
      fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);
    }
  }

  const topFlaggedFields = Array.from(fieldCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([field, count]) => ({ field, count }));

  return {
    totalBlocked: blockedRes.count || 0,
    totalDropped: droppedRes.count || 0,
    totalAllowed: allowedRes.count || 0,
    avgRiskScore: Math.round(avgRisk * 10) / 10,
    topFlaggedFields,
  };
}
