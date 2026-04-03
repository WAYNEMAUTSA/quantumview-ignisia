import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabase.js';

const router = Router();

// GET /metrics — dashboard metrics with real-world drift calculation
router.get('/', async (_req: Request, res: Response) => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // ── Total transactions in recent window ──
    const { count: totalTransactions } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', fiveMinutesAgo);

    // ── Drift: transactions with state gaps ──
    const { data: recentTxns, error: txnsErr } = await supabase
      .from('transactions')
      .select('id')
      .gte('created_at', fiveMinutesAgo);

    if (txnsErr) throw new Error(txnsErr.message);

    let driftedCount = 0;
    let droppedCount = 0;
    let outOfOrderCount = 0;
    let duplicateCount = 0;

    if (recentTxns && recentTxns.length > 0) {
      const txnIds = recentTxns.map((t) => t.id);

      const { data: allEvents, error: eventsErr } = await supabase
        .from('webhook_events')
        .select('transaction_id, event_type, gateway_timestamp, source')
        .in('transaction_id', txnIds)
        .order('gateway_timestamp', { ascending: true });

      if (!eventsErr && allEvents) {
        const eventsByTxn: Record<string, typeof allEvents> = {};
        allEvents.forEach((evt) => {
          if (!eventsByTxn[evt.transaction_id]) eventsByTxn[evt.transaction_id] = [];
          eventsByTxn[evt.transaction_id].push(evt);
        });

        for (const txnId of txnIds) {
          const events = eventsByTxn[txnId] || [];
          const eventTypes = events.map((e) => e.event_type);
          const hasCreated = eventTypes.includes('created');
          const hasAuthorized = eventTypes.includes('authorized');
          const hasCaptured = eventTypes.includes('captured');

          // Dropped: captured without created or authorized
          if (hasCaptured && !hasCreated) {
            driftedCount++;
            droppedCount++;
            continue;
          }
          if (hasCaptured && !hasAuthorized) {
            driftedCount++;
            droppedCount++;
            continue;
          }

          // Check for out-of-order events
          for (let i = 1; i < events.length; i++) {
            const prev = events[i - 1].event_type;
            const curr = events[i].event_type;
            if (
              (prev === 'captured' && (curr === 'created' || curr === 'authorized')) ||
              (prev === 'authorized' && curr === 'created')
            ) {
              outOfOrderCount++;
              if (!eventTypes.includes('drifted_flagged')) {
                driftedCount++;
                eventTypes.push('drifted_flagged' as any);
              }
              break;
            }
          }

          // Duplicates
          const typeCount: Record<string, number> = {};
          events.forEach((evt) => {
            const key = `${evt.event_type}:${evt.source}`;
            typeCount[key] = (typeCount[key] || 0) + 1;
          });
          const hasDuplicates = Object.values(typeCount).some((c) => c > 1);
          if (hasDuplicates) {
            duplicateCount++;
          }
        }
      }
    }

    const total = totalTransactions ?? 0;
    const driftRate = total > 0 ? (driftedCount / total) * 100 : 0;

    // ── Heal job stats ──
    const { count: resolvedHealJobs } = await supabase
      .from('heal_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'resolved');

    const { count: failedHealJobs } = await supabase
      .from('heal_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed');

    const healSuccessDenominator = (resolvedHealJobs ?? 0) + (failedHealJobs ?? 0);
    const healSuccessRate =
      healSuccessDenominator > 0
        ? ((resolvedHealJobs ?? 0) / healSuccessDenominator) * 100
        : 100;

    // ── Webhooks in last 60 minutes ──
    const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: totalWebhooks } = await supabase
      .from('webhook_events')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sixtyMinutesAgo);

    // ── Unresolved anomalies ──
    const { count: openAnomalies } = await supabase
      .from('anomalies')
      .select('*', { count: 'exact', head: true })
      .is('resolved_at', null);

    // ── Healer stats ──
    const { count: healedEvents } = await supabase
      .from('webhook_events')
      .select('*', { count: 'exact', head: true })
      .not('raw_payload', 'is', null)
      .contains('raw_payload', { healed: true });

    const { count: totalEvents } = await supabase
      .from('webhook_events')
      .select('*', { count: 'exact', head: true });

    // ── Healer audit log summary ──
    const { count: totalHealed } = await supabase
      .from('healer_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('outcome', 'healed');

    const { count: totalSuppressed } = await supabase
      .from('healer_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('outcome', 'suppressed');

    const { count: totalProcessed } = await supabase
      .from('healer_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('outcome', 'processed');

    const totalInterventions = (totalHealed ?? 0) + (totalSuppressed ?? 0);
    const totalAgentActions = (totalProcessed ?? 0) + totalInterventions;
    const recoveryRate = totalAgentActions > 0
      ? (totalInterventions / totalAgentActions) * 100
      : 0;

    return res.json({
      driftRate: parseFloat(driftRate.toFixed(1)),
      driftBreakdown: {
        total,
        drifted: driftedCount,
        healthy: total - driftedCount,
        dropped: droppedCount,
        outOfOrder: outOfOrderCount,
        duplicates: duplicateCount,
      },
      healStats: {
        totalEvents: totalEvents ?? 0,
        healedEvents: healedEvents ?? 0,
        normalEvents: (totalEvents ?? 0) - (healedEvents ?? 0),
        totalAgentInterventions: totalInterventions,
        healed: totalHealed ?? 0,
        suppressed: totalSuppressed ?? 0,
        processed: totalProcessed ?? 0,
        recoveryRate: parseFloat(recoveryRate.toFixed(1)),
      },
      healSuccessRate: parseFloat(healSuccessRate.toFixed(1)),
      totalWebhooks: totalWebhooks ?? 0,
      openAnomalies: openAnomalies ?? 0,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /metrics/drift-history — last 60 drift snapshots for charting
router.get('/drift-history', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('drift_snapshots')
      .select('recorded_at, drift_rate, dropped_events_count, out_of_order_count, duplicate_count, total_recent_txns, drifted_txns')
      .order('recorded_at', { ascending: true })
      .limit(120); // last 20 minutes at 10s intervals

    if (error) throw new Error(error.message);

    const formatted = (data || []).map((s) => ({
      timestamp: new Date(s.recorded_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      driftRate: parseFloat(s.drift_rate),
      dropped: s.dropped_events_count,
      outOfOrder: s.out_of_order_count,
      duplicates: s.duplicate_count,
      total: s.total_recent_txns,
      drifted: s.drifted_txns,
    }));

    return res.json({ data: formatted });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /metrics/healer-history — last 50 healer agent interventions
router.get('/healer-history', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('healer_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);

    const formatted = (data || []).map((s) => ({
      id: s.id,
      gateway_txn_id: s.gateway_txn_id?.substring(0, 20) + '...',
      outcome: s.outcome,
      bridge_events: s.bridge_events_synthesized,
      confidence: s.confidence_score,
      actions: s.actions_taken,
      reasoning: s.reasoning_trail,
      created_at: new Date(s.created_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    }));

    return res.json({ data: formatted });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
