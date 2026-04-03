import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabase.js';

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

// PATCH /anomalies/:id/resolve — mark anomaly as resolved
router.patch('/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

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

    if (!data) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }

    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
