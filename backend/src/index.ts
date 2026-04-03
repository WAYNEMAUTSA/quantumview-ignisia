import 'dotenv/config'

import express, { Request, Response } from 'express';
import cors from 'cors';
import webhookRouter from './routes/webhook.js';
import mockRouter from './routes/mock.js';
import transactionsRouter from './routes/transactions.js';
import metricsRouter from './routes/metrics.js';
import anomaliesRouter from './routes/anomalies.js';
import { webhookWorker } from './workers/webhookWorker.js';
import { healWorker } from './workers/healWorker.js';
import { startDataInjector } from './services/dataInjector.js';
import injectorRouter from './routes/injector.js';

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
app.use('/anomalies', anomaliesRouter);
app.use('/injector', injectorRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

webhookWorker.on('ready', () => {
  console.log('Webhook worker is ready');
});

healWorker.on('ready', () => {
  console.log('Heal worker is ready');
  const autoStart = process.env.INJECTOR_AUTO_START === 'true';
  startDataInjector({
    enabled: autoStart,
    intervalMs: Number(process.env.INJECTOR_INTERVAL_MS ?? 5000),
    batchSize: Number(process.env.INJECTOR_BATCH_SIZE ?? 2),
  });
});

export default app;
