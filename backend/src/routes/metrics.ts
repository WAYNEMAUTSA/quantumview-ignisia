import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabase.js';

const router = Router();

// GET /metrics — dashboard metrics
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Total transactions
    const { count: totalTransactions } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true });

    // Transactions with open heal_jobs (drift)
    const { count: openHealJobs } = await supabase
      .from('heal_jobs')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'resolved');

    // Drift rate = (open heal jobs / total transactions) * 100
    const driftRate =
      totalTransactions && totalTransactions > 0
        ? ((openHealJobs ?? 0) / totalTransactions) * 100
        : 0;

    // Heal job stats
    const { count: resolvedHealJobs } = await supabase
      .from('heal_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'resolved');

    const { count: failedHealJobs } = await supabase
      .from('heal_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed');

    // Heal success rate = resolved / (resolved + failed) * 100
    const healSuccessDenominator = (resolvedHealJobs ?? 0) + (failedHealJobs ?? 0);
    const healSuccessRate =
      healSuccessDenominator > 0
        ? ((resolvedHealJobs ?? 0) / healSuccessDenominator) * 100
        : 0;

    // Webhooks in last 60 minutes
    const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: totalWebhooks } = await supabase
      .from('webhook_events')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sixtyMinutesAgo);

    // Unresolved anomalies
    const { count: openAnomalies } = await supabase
      .from('anomalies')
      .select('*', { count: 'exact', head: true })
      .is('resolved_at', null);

    return res.json({
      driftRate: parseFloat(driftRate.toFixed(1)),
      healSuccessRate: parseFloat(healSuccessRate.toFixed(1)),
      totalWebhooks: totalWebhooks ?? 0,
      openAnomalies: openAnomalies ?? 0,
      totalTransactions: totalTransactions ?? 0,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
