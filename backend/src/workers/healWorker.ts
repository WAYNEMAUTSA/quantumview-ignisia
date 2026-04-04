import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { healTransaction } from '../services/autoHealer.js';
import { InMemoryQueue } from '../queues/InMemoryQueue.js';

const connection = new IORedis(process.env.UPSTASH_REDIS_URL as string, {
  maxRetriesPerRequest: null,
});

interface HealJobData {
  transactionId: string;
  missingStates: string[];
  healJobId: string;
}

async function processJob(job: Job<HealJobData> | { id: string; data: HealJobData }): Promise<void> {
  await healTransaction(
    job.data.transactionId,
    job.data.missingStates,
    job.data.healJobId,
  );
  console.log('Heal job processed:', job.data.transactionId);
}

// Detect if Redis is available
let redisAvailable = true;

connection.on('error', (err: Error) => {
  if (err.message.includes('max requests limit exceeded') && redisAvailable) {
    redisAvailable = false;
    console.error('[HealWorker] Redis limit hit — switching to in-memory worker');
    startInMemoryWorker();
  }
});

connection.ping().catch((err: Error) => {
  if (err.message.includes('max requests limit exceeded')) {
    redisAvailable = false;
    console.error('[HealWorker] Redis unavailable on startup — using in-memory worker');
    startInMemoryWorker();
  }
});

/**
 * In-memory worker — processes heal jobs directly without Redis.
 */
function startInMemoryWorker(): void {
  const memQueue = new InMemoryQueue();
  memQueue.setProcessor(processJob as any);
  memQueue.on('failed', (job: any) => {
    console.error(`[InMemoryWorker] Heal job ${job.id} failed`);
  });
  console.log('[InMemoryWorker] Started — heal jobs will be processed in-memory');
}

// Create the appropriate worker based on Redis availability
export const healWorker = redisAvailable
  ? new Worker<HealJobData>('heal-jobs', processJob, { connection })
  : null;

if (healWorker) {
  healWorker.on('failed', (job, err) => {
    console.error(`Failed to process heal job ${job?.id}:`, err.message);
  });
} else {
  startInMemoryWorker();
}
