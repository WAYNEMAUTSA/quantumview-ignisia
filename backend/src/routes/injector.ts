import { Router, Request, Response } from 'express';
import {
  startDataInjector,
  stopDataInjector,
  getInjectorStatus,
} from '../services/dataInjector.js';

const router = Router();

type InjectorProfile = 'realistic' | 'balanced' | 'chaos' | 'normal-only';

function getProfileConfig(profile?: InjectorProfile) {
  if (profile === 'normal-only') {
    return {
      intervalMs: 5000,
      batchSize: 2,
      scenarioWeights: {
        normal: 100,
        duplicate: 0,
        out_of_order: 0,
        dropped: 0,
        invalid_payload: 0,
        gateway_outage: 0,
        state_conflict: 0,
      },
    };
  }

  if (profile === 'balanced') {
    return {
      intervalMs: 4000,
      batchSize: 2,
      scenarioWeights: {
        normal: 85,
        duplicate: 4,
        out_of_order: 4,
        dropped: 4,
        invalid_payload: 0,
        gateway_outage: 2,
        state_conflict: 1,
      },
    };
  }

  if (profile === 'chaos') {
    return {
      intervalMs: 3000,
      batchSize: 3,
      scenarioWeights: {
        normal: 20,
        duplicate: 15,
        out_of_order: 20,
        dropped: 20,
        invalid_payload: 5,
        gateway_outage: 10,
        state_conflict: 10,
      },
    };
  }

  // default realistic profile
  return {
    intervalMs: 5000,
    batchSize: 2,
    scenarioWeights: {
      normal: 92,
      duplicate: 2,
      out_of_order: 2,
      dropped: 2,
      invalid_payload: 0,
      gateway_outage: 1,
      state_conflict: 1,
    },
  };
}

/**
 * GET /injector/status
 * Get current data injector status
 */
router.get('/status', (_req: Request, res: Response) => {
  try {
    const status = getInjectorStatus();
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /injector/start
 * Start the data injector with optional config
 */
router.post('/start', (req: Request, res: Response) => {
  try {
    const profile = req.body?.profile as InjectorProfile | undefined;
    const profileConfig = getProfileConfig(profile);
    const config = {
      enabled: true,
      ...profileConfig,
      ...req.body,
    };
    delete (config as any).profile;

    startDataInjector(config);
    const status = getInjectorStatus();
    return res.json({
      message: `Data injector started${profile ? ` (${profile})` : ''}`,
      status,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /injector/stop
 * Stop the data injector
 */
router.post('/stop', (_req: Request, res: Response) => {
  try {
    stopDataInjector();
    return res.json({ message: 'Data injector stopped' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
