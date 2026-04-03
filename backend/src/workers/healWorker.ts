import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { healTransaction } from '../services/autoHealer.js';

const connection = new IORedis(process.env.UPSTASH_REDIS_URL as string, {
  maxRetriesPerRequest: null,
});

interface HealJobData {
  transactionId: string;
  missingStates: string[];
  healJobId: string;
}

async function processJob(job: Job<HealJobData>): Promise<void> {
  await healTransaction(
    job.data.transactionId,
    job.data.missingStates,
    job.data.healJobId
  );
  console.log('Heal job processed:', job.data.transactionId);
}

export const healWorker = new Worker<HealJobData>('heal-jobs', processJob, {
  connection,
});

healWorker.on('failed', (job, err) => {
  console.error(
    `Failed to process heal job ${job?.id}:`,
    err.message
  );
});
