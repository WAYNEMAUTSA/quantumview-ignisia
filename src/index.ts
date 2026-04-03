import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import webhookRouter from './routes/webhook';
import { webhookWorker } from './workers/webhookWorker';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, timestamp: new Date() });
});

app.use('/webhook', webhookRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

webhookWorker.on('ready', () => {
  console.log('Webhook worker is ready');
});

export default app;
