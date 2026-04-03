import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { applyEvent } from '../services/stateMachine';
import { NormalizedEvent } from '../types';

const connection = new IORedis(process.env.UPSTASH_REDIS_URL as string, {
  maxRetriesPerRequest: null,
});

async function processJob(job: Job<NormalizedEvent>): Promise<void> {
  await applyEvent(job.data as NormalizedEvent);
  console.log('Processed event:', job.data.idempotencyKey);
}

export const webhookWorker = new Worker<NormalizedEvent>(
  'webhook-processing',
  processJob,
  { connection }
);

webhookWorker.on('failed', (job, err) => {
  console.error(
    `Failed to process job ${job?.id}:`,
    err.message
  );
});
