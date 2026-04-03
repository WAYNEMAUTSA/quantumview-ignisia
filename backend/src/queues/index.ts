import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { HealJobData } from '../types/index.js';

const connection = new IORedis(process.env.UPSTASH_REDIS_URL as string, {
  maxRetriesPerRequest: null,
});

export const healQueue = new Queue<HealJobData>('heal-jobs', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});
