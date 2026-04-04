import axios from 'axios';

type InjectorScenario =
  | 'normal'
  | 'duplicate'
  | 'out_of_order'
  | 'dropped'
  | 'invalid_payload'
  | 'gateway_outage'
  | 'state_conflict'
  | 'fraud_replay';

interface InjectorConfig {
  enabled: boolean;
  intervalMs: number;
  batchSize: number;
  eventSequence: string[];
  scenarioWeights: Record<InjectorScenario, number>;
}

const DEFAULT_CONFIG: InjectorConfig = {
  enabled: true,
  intervalMs: 1500,
  batchSize: 3,
  eventSequence: [
    'payment.created',
    'payment.authorized',
    'payment.captured',
  ],
  scenarioWeights: {
    normal: 55,
    duplicate: 5,
    out_of_order: 5,
    dropped: 10,
    invalid_payload: 0,
    gateway_outage: 8,
    state_conflict: 7,
    fraud_replay: 10, // 10% of injections are fraud replays
  },
};

let injectorInterval: NodeJS.Timeout | null = null;
let currentConfig: InjectorConfig = { ...DEFAULT_CONFIG };

/**
 * Start the continuous data injector
 * Periodically fires synthetic Razorpay webhooks
 */
export function startDataInjector(config: Partial<InjectorConfig> = {}): void {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  currentConfig = finalConfig;

  if (!finalConfig.enabled) {
    console.log('Data injector is disabled');
    return;
  }

  if (injectorInterval) {
    clearInterval(injectorInterval);
    injectorInterval = null;
  }

  console.log(
    `Starting data injector: batches of ${finalConfig.batchSize} every ${finalConfig.intervalMs}ms`
  );

  injectorInterval = setInterval(async () => {
    await injectBatch(finalConfig);
  }, finalConfig.intervalMs);
}

/**
 * Stop the data injector
 */
export function stopDataInjector(): void {
  if (injectorInterval) {
    clearInterval(injectorInterval);
    injectorInterval = null;
    console.log('Data injector stopped');
  }
}

/**
 * Inject a batch of synthetic transactions
 */
async function injectBatch(config: InjectorConfig): Promise<void> {
  const selfUrl = process.env.SELF_URL ?? 'http://127.0.0.1:3000';
  const webhookUrl = `${selfUrl}/webhook/razorpay`;

  for (let i = 0; i < config.batchSize; i++) {
    const scenario = pickScenario(config.scenarioWeights);
    await injectScenario(webhookUrl, config, scenario);

    // Small delay between transactions in the batch (200ms)
    await sleep(200);
  }
}

async function injectScenario(
  webhookUrl: string,
  config: InjectorConfig,
  scenario: InjectorScenario
): Promise<void> {
  const baseTxnId = makeTxnId();
  const txnId =
    scenario === 'gateway_outage'
      ? `${baseTxnId}503`
      : scenario === 'state_conflict'
      ? `${baseTxnId}conflict`
      : baseTxnId;

  const send = async (eventType: string, payloadOverride?: any) => {
    const payload = payloadOverride ?? makePayload(txnId, eventType);
    try {
      const res = await axios.post(webhookUrl, payload, { timeout: 5000, validateStatus: () => true });
      console.log(`[DataInjector] ${scenario} -> ${eventType} for ${txnId} (status ${res.status})`);
    } catch (err: any) {
      console.error(`[DataInjector] ${scenario} failed for ${txnId}:`, err.message);
    }
  };

  if (scenario === 'normal') {
    for (const eventType of config.eventSequence) {
      await send(eventType);
      await sleep(100);
    }
    return;
  }

  if (scenario === 'duplicate') {
    // A realistic duplicate is usually a retry of a delivery, often on final event.
    await send('payment.created');
    await send('payment.authorized');
    await send('payment.captured');
    await sleep(150);
    await send('payment.captured');
    return;
  }

  if (scenario === 'out_of_order') {
    // Slightly out-of-order arrival while still plausible.
    await send('payment.authorized');
    await send('payment.created');
    await send('payment.captured');
    return;
  }

  if (scenario === 'dropped') {
    // A common real-world drop: missing intermediate event.
    await send('payment.created');
    await send('payment.captured');
    return;
  }

  if (scenario === 'invalid_payload') {
    await send('payment.created', {
      event: 'payment.created',
      payload: {
        payment: {
          entity: {
            // Deliberately omit id to test payload validation path
            amount: generateRandomAmount(),
            currency: 'INR',
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });
    return;
  }

  // These scenarios intentionally force the healer to hit mock edge cases.
  if (scenario === 'gateway_outage' || scenario === 'state_conflict') {
    await send('payment.captured');
  }

  // FRAUD REPLAY — simulates replay attacks for security dashboard testing
  if (scenario === 'fraud_replay') {
    const fraudTxnId = `pay_FRAUD_${Date.now().toString().slice(-6)}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    // Phase 1: Send legitimate event first
    const legitPayload = makePayload(fraudTxnId, 'payment.captured');
    legitPayload._original_headers = {
      'x-razorpay-signature': `sig_${Math.random().toString(36).substring(2, 10)}`,
      'x-forwarded-for': '192.168.1.100',
      'user-agent': 'Razorpay-Webhook/1.0',
    };
    await send('payment.captured', legitPayload);

    // Phase 2: Wait a realistic delay (simulates attacker capturing and replaying later)
    const delayMs = Math.random() > 0.5 ? 3000 : 15000; // 50% short delay, 50% long delay
    await sleep(delayMs);

    // Phase 3: Send the REPLAY — same event type + txn ID but with DIFFERENT headers
    // This triggers the fraud detection middleware
    const replayPayload = makePayload(fraudTxnId, 'payment.captured');
    // Deliberately change headers to simulate a replay from different source
    replayPayload._original_headers = {
      'x-razorpay-signature': `sig_FAKE_${Math.random().toString(36).substring(2, 10)}`, // Changed signature
      'x-forwarded-for': '203.0.113.42', // Different IP
      'user-agent': 'python-requests/2.31', // Different user agent
    };

    const fraudRes = await axios.post(webhookUrl, replayPayload, { timeout: 5000, validateStatus: () => true });
    console.log(`[DataInjector] fraud_replay -> replayed ${fraudTxnId} after ${delayMs}ms (status ${fraudRes.status})`);
    return;
  }
}

function makeTxnId(): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 9).toUpperCase();
  return `pay_INJ${timestamp}${randomId}`;
}

function makePayload(txnId: string, eventType: string): any {
  return {
    event: eventType,
    payload: {
      payment: {
        entity: {
          id: txnId,
          amount: generateRandomAmount(),
          currency: 'INR',
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    },
  };
}

function pickScenario(weights: Record<InjectorScenario, number>): InjectorScenario {
  const entries = Object.entries(weights) as Array<[InjectorScenario, number]>;
  const total = entries.reduce((sum, [, value]) => sum + Math.max(0, value), 0);

  if (total <= 0) {
    return 'normal';
  }

  let cursor = Math.random() * total;
  for (const [scenario, weight] of entries) {
    cursor -= Math.max(0, weight);
    if (cursor <= 0) {
      return scenario;
    }
  }

  return 'normal';
}

/**
 * Generate a random transaction amount (realistic enterprise payment amounts)
 */
function generateRandomAmount(): number {
  // Enterprise payment amounts: ₹10,000 to ₹500,000 (in paise: 1,000,000 to 50,000,000)
  const amounts = [10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000];
  return amounts[Math.floor(Math.random() * amounts.length)] * 100; // Convert to paise
}

/**
 * Utility sleep function
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get injector status
 */
export function getInjectorStatus(): {
  active: boolean;
  config: InjectorConfig;
} {
  return {
    active: injectorInterval !== null,
    config: currentConfig,
  };
}
