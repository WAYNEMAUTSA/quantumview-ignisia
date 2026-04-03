import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabase.js';

const router = Router();

// GET /transactions — paginated list with optional filters
router.get('/', async (_req: Request, res: Response) => {
  try {
    const page = parseInt(_req.query.page as string) || 1;
    const limit = parseInt(_req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('transactions')
      .select(
        `
        *,
        webhook_events (
          id,
          event_type,
          gateway_timestamp,
          source
        )
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply optional filters
    if (_req.query.state) {
      query = query.eq('current_state', _req.query.state);
    }
    if (_req.query.gateway) {
      query = query.eq('gateway', _req.query.gateway);
    }

    const { data: transactions, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({
      data: transactions,
      total: transactions ? transactions.length : 0,
      page,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /transactions/:id/events — full event log for one transaction
router.get('/:id/events', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: events, error } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('transaction_id', id)
      .order('gateway_timestamp', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ data: events });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
