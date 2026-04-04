import 'dotenv/config'

import express, { Request, Response } from 'express';
import cors from 'cors';
import webhookRouter from './routes/webhook.js';
import mockRouter from './routes/mock.js';
import transactionsRouter from './routes/transactions.js';
import metricsRouter from './routes/metrics.js';
import anomaliesRouter from './routes/anomalies.js';
import securityRouter from './routes/security.js';
import { webhookWorker } from './workers/webhookWorker.js';
import { healWorker } from './workers/healWorker.js';
import { startDataInjector } from './services/dataInjector.js';
import injectorRouter from './routes/injector.js';
import { recordDriftSnapshot } from './services/driftRecorder.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, timestamp: new Date() });
});

app.use('/webhook', webhookRouter);
app.use('/mock', mockRouter);
app.use('/transactions', transactionsRouter);
app.use('/metrics', metricsRouter);
app.use('/anomalies', anomaliesRouter); // Includes POST /anomalies/auto-handle
app.use('/injector', injectorRouter);
app.use('/security', securityRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

webhookWorker.on('ready', () => {
  console.log('Webhook worker is ready');
});

if (healWorker) {
  healWorker.on('ready', () => {
    console.log('Heal worker is ready (Redis-backed BullMQ)');
    startServices();
  });
} else {
  // In-memory fallback — start services immediately
  console.log('Heal worker is ready (in-memory fallback mode)');
  startServices();
}

function startServices(): void {
  // Start data injector (enabled by default in config)
  startDataInjector();

  // Start drift snapshot recorder — every 10 seconds
  setInterval(async () => {
    try {
      await recordDriftSnapshot();
    } catch (err: any) {
      console.error('Drift snapshot error:', err.message);
    }
  }, 10_000);
  console.log('Drift snapshot recorder started (every 10s)');
}

export default app;
