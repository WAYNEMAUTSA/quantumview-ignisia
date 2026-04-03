// Mock API service – replace internals with real fetch calls when ready.
// All functions return Promises to match real API patterns.

type DriftPoint = { timestamp: string; value: number };

type DashboardMetrics = {
  driftRate: number;
  healSuccessRate: number;
  totalWebhooksLastHour: number;
  manualQueueSize: number;
  driftRateHistory: DriftPoint[];
};

type HealEvent = {
  id: string;
  transactionId: string;
  description: string;
  timestamp: string;
};

type Transaction = {
  id: string;
  gateway: "razorpay" | "stripe" | "cashfree";
  status: "created" | "captured" | "settled" | "refunded";
  amount: number;
  currency: string;
  isHealing: boolean;
  timeline: Array<{ step: string; present: boolean }>;
  rawEvents: object[];
};

type ManualReviewItem = {
  id: string;
  transactionId: string;
  anomalyType: string;
  humanReadableReason: string;
  createdAt: string;
};

type WebhookVolume = { gateway: string; count: number };

// ── Simulation state ──────────────────────────────────────────────
let phase: "healthy" | "degraded" | "healed" = "healthy";
const APP_START = Date.now();

function currentPhase(): typeof phase {
  const elapsed = Date.now() - APP_START;
  if (elapsed < 10_000) return "healthy";
  if (elapsed < 20_000) return "degraded";
  return "healed";
}

function delay(ms = 400): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function generateDriftHistory(): DriftPoint[] {
  const now = Date.now();
  const p = currentPhase();
  return Array.from({ length: 60 }, (_, i) => {
    const t = new Date(now - (59 - i) * 60_000).toISOString();
    let v = 0;
    if (p === "degraded") v = i > 50 ? 12 + Math.random() * 2 : Math.random() * 0.5;
    if (p === "healed") v = i > 55 ? 2 + Math.random() * 0.5 : i > 50 ? 6 - (i - 50) * 0.8 : Math.random() * 0.5;
    return { timestamp: t, value: Math.round(v * 100) / 100 };
  });
}

// ── Public API ────────────────────────────────────────────────────

export async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  await delay();
  const p = currentPhase();
  return {
    driftRate: p === "healthy" ? 0 : p === "degraded" ? 12.3 : 1.8,
    healSuccessRate: p === "healthy" ? 100 : p === "degraded" ? 80 : 95,
    totalWebhooksLastHour: 1_247 + Math.floor(Math.random() * 30),
    manualQueueSize: p === "degraded" ? 1 : 0,
    driftRateHistory: generateDriftHistory(),
  };
}

export async function fetchWebhookVolume(): Promise<WebhookVolume[]> {
  await delay();
  return [
    { gateway: "Razorpay", count: 520 + Math.floor(Math.random() * 40) },
    { gateway: "Stripe", count: 430 + Math.floor(Math.random() * 30) },
    { gateway: "Cashfree", count: 297 + Math.floor(Math.random() * 20) },
  ];
}

export async function fetchRecentHeals(): Promise<HealEvent[]> {
  await delay();
  const p = currentPhase();
  const base: HealEvent[] = [
    { id: "h1", transactionId: "tx_a1b2c3", description: "Healed tx_a1b2c3 – injected missing 'created' event", timestamp: new Date(Date.now() - 120_000).toISOString() },
    { id: "h2", transactionId: "tx_d4e5f6", description: "Healed tx_d4e5f6 – reconciled duplicate 'captured' event", timestamp: new Date(Date.now() - 300_000).toISOString() },
    { id: "h3", transactionId: "tx_g7h8i9", description: "Healed tx_g7h8i9 – injected missing 'settled' event", timestamp: new Date(Date.now() - 600_000).toISOString() },
  ];
  if (p === "healed") {
    base.unshift({
      id: "h0",
      transactionId: "tx_x9y8z7",
      description: "Healed tx_x9y8z7 – injected missing 'created' event (auto)",
      timestamp: new Date().toISOString(),
    });
  }
  return base.slice(0, 5);
}

const MOCK_TXS: Transaction[] = [
  { id: "tx_a1b2c3", gateway: "razorpay", status: "settled", amount: 24999, currency: "INR", isHealing: false, timeline: [{ step: "created", present: true }, { step: "captured", present: true }, { step: "settled", present: true }], rawEvents: [{ event: "created", at: "2025-01-15T09:00:00Z" }] },
  { id: "tx_d4e5f6", gateway: "stripe", status: "captured", amount: 4999, currency: "USD", isHealing: false, timeline: [{ step: "created", present: true }, { step: "captured", present: true }], rawEvents: [{ event: "created", at: "2025-01-15T09:05:00Z" }] },
  { id: "tx_x9y8z7", gateway: "cashfree", status: "captured", amount: 14999, currency: "INR", isHealing: false, timeline: [{ step: "created", present: false }, { step: "captured", present: true }], rawEvents: [{ event: "captured", at: "2025-01-15T09:10:00Z" }] },
  { id: "tx_g7h8i9", gateway: "razorpay", status: "refunded", amount: 8500, currency: "INR", isHealing: false, timeline: [{ step: "created", present: true }, { step: "captured", present: true }, { step: "settled", present: true }, { step: "refunded", present: true }], rawEvents: [{ event: "created", at: "2025-01-15T08:00:00Z" }] },
  { id: "tx_j1k2l3", gateway: "stripe", status: "created", amount: 2999, currency: "USD", isHealing: false, timeline: [{ step: "created", present: true }], rawEvents: [{ event: "created", at: "2025-01-15T09:15:00Z" }] },
  { id: "tx_m4n5o6", gateway: "cashfree", status: "settled", amount: 32000, currency: "INR", isHealing: false, timeline: [{ step: "created", present: true }, { step: "captured", present: true }, { step: "settled", present: true }], rawEvents: [{ event: "created", at: "2025-01-15T07:30:00Z" }] },
  { id: "tx_p7q8r9", gateway: "razorpay", status: "captured", amount: 6750, currency: "INR", isHealing: false, timeline: [{ step: "created", present: true }, { step: "captured", present: true }], rawEvents: [{ event: "created", at: "2025-01-15T09:20:00Z" }] },
  { id: "tx_s1t2u3", gateway: "stripe", status: "settled", amount: 12000, currency: "USD", isHealing: false, timeline: [{ step: "created", present: true }, { step: "captured", present: true }, { step: "settled", present: true }], rawEvents: [{ event: "created", at: "2025-01-15T06:00:00Z" }] },
];

export async function fetchTransactions(page = 1, perPage = 5): Promise<{ data: Transaction[]; total: number }> {
  await delay();
  const p = currentPhase();
  const txs = MOCK_TXS.map((tx) => {
    if (tx.id === "tx_x9y8z7" && p === "degraded") return { ...tx, isHealing: true };
    if (tx.id === "tx_x9y8z7" && p === "healed") return { ...tx, isHealing: false, timeline: [{ step: "created", present: true }, { step: "captured", present: true }] };
    return tx;
  });
  const start = (page - 1) * perPage;
  return { data: txs.slice(start, start + perPage), total: txs.length };
}

export async function fetchManualQueue(): Promise<ManualReviewItem[]> {
  await delay();
  const p = currentPhase();
  if (p === "degraded") {
    return [
      {
        id: "mq_1",
        transactionId: "tx_x9y8z7",
        anomalyType: "Missing lifecycle event",
        humanReadableReason:
          "A 'captured' webhook was received for tx_x9y8z7 but no corresponding 'created' event exists. The transaction lifecycle is incomplete, which causes ledger drift.",
        createdAt: new Date(Date.now() - 5_000).toISOString(),
      },
    ];
  }
  return [];
}

export async function healTransaction(transactionId: string): Promise<{ success: boolean }> {
  await delay(800);
  console.log(`[mock] Heal requested for ${transactionId}`);
  return { success: true };
}

export async function resolveManualReview(itemId: string, newStatus: string): Promise<{ success: boolean }> {
  await delay(800);
  console.log(`[mock] Manual resolve ${itemId} → ${newStatus}`);
  return { success: true };
}
