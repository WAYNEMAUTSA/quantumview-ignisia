import { Router, Request, Response } from 'express';
import { normalizeRazorpay } from '../normalizers/razorpay';
import { webhookQueue } from '../queues';

const router = Router();

router.post('/razorpay', async (req: Request, res: Response) => {
  try {
    const body = req.body;

    const txnId = body.payload?.payment?.entity?.id;
    const eventName = body.event;
    const idempotencyKey = `razorpay:${txnId}:${eventName}`;

    const existingJob = await webhookQueue.getJob(idempotencyKey);
    if (existingJob) {
      return res.status(200).json({ status: 'duplicate' });
    }

    const normalizedEvent = normalizeRazorpay(body);

    await webhookQueue.add(idempotencyKey, normalizedEvent, {
      jobId: idempotencyKey,
    });

    return res.status(200).json({ status: 'queued' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
