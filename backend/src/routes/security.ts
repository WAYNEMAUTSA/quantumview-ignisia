import { Router, Request, Response } from 'express';
import { getSecurityLogs, getFraudStats } from '../services/securityLog.js';

const router = Router();

// GET /security/logs — paginated security log entries
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const { entries, total } = await getSecurityLogs(limit, offset);

    return res.json({
      entries,
      pagination: { limit, offset, total, hasMore: offset + limit < total },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /security/stats — fraud statistics summary
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getFraudStats();
    return res.json(stats);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
