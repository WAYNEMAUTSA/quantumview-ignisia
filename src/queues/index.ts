import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.UPSTASH_REDIS_URL as string, {
  maxRetriesPerRequest: null,
});

export const webhookQueue = new Queue('webhook-processing', { connection });
export const healQueue = new Queue('heal-jobs', { connection });
