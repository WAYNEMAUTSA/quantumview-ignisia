import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { HealJobData } from '../types/index.js';
import { InMemoryQueue } from './InMemoryQueue.js';

const connection = new IORedis(process.env.UPSTASH_REDIS_URL as string, {
  maxRetriesPerRequest: null,
  retryStrategy: (times: number) => {
    if (times > 3) {
      console.error('[Redis] Connection failed — switching to in-memory queue');
      return null;
    }
    return Math.min(times * 200, 2000);
  },
});

let redisAvailable = true;
let _healQueue: Queue<HealJobData> | InMemoryQueue | null = null;

// Detect max-requests-limit error and switch to in-memory
connection.on('error', (err: Error) => {
  if (err.message.includes('max requests limit exceeded') && redisAvailable) {
    redisAvailable = false;
    console.error('[Redis] Max request limit hit — switching to in-memory fallback');
    _healQueue = new InMemoryQueue();
  }
});

// Test Redis on init
connection.ping().catch((err: Error) => {
  if (err.message.includes('max requests limit exceeded')) {
    redisAvailable = false;
    console.error('[Redis] Max request limit on startup — using in-memory queue');
  }
});

export function getHealQueue(): Queue<HealJobData> | InMemoryQueue {
  if (!_healQueue) {
    if (redisAvailable) {
      _healQueue = new Queue<HealJobData>('heal-jobs', {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      });

      (_healQueue as Queue<HealJobData>).on('error', (err: Error) => {
        if (err.message.includes('max requests limit exceeded') && redisAvailable) {
          redisAvailable = false;
          console.error('[Redis] Max request limit — swapping to in-memory queue');
          _healQueue = new InMemoryQueue();
        }
      });
    } else {
      _healQueue = new InMemoryQueue();
    }
  }
  return _healQueue;
}

export const healQueue = getHealQueue();
export { redisAvailable };
