# Webhook Reconciliation Engine

A real-time dashboard and automation engine for monitoring, reconciling, and healing webhook-driven payment transactions. It detects anomalies (dropped events, state conflicts, gateway outages), runs auto-heal workflows via a BullMQ queue, provides fraud detection for replay attacks, and offers a visual review queue for manual intervention.

## ✨ Key Features

- **Real-Time Drift Detection**: Monitors transaction lifecycle gaps (dropped, out-of-order, duplicate events)
- **AI Auto-Healing**: Automatically fetches missing events from payment gateways and repairs transaction state
- **Chaos Healer Agent**: Real-time webhook processor that detects and fixes gaps, duplicates, and stale events
- **Fraud Detection Middleware**: Blocks replay attacks by calculating risk scores from time delta + header consistency
- **Security Dashboard**: Live monitoring of fraud blocks, drops, and allowed retries with expandable detail views
- **Anomaly Management**: Automatic detection + manual review queue for complex failures
- **Audit Trail**: Every AI agent decision is logged with reasoning, confidence scores, and actions taken
- **Live Dashboard**: Auto-refreshing metrics with drift charts, volume breakdowns, and agent activity

## Architecture Flow

```
Webhook Received
    ↓
Fraud Detection Middleware ← NEW
    ├── Checks for duplicate ID + header tampering
    ├── Calculates risk score (0–100)
    ├── BLOCKS (403) if high risk → logs to security_logs
    ├── DROPS silently if moderate risk → logs to security_logs
    └── ALLOWS if standard retry → passes through
    ↓
Chaos Healer (real-time)
    ├── Detects gaps/duplicates/out-of-order
    ├── Synthesizes bridge events if needed
    └── Logs to healer_audit_log
    ↓
State Machine
    ├── Updates transaction state (UNREACHABLE if fraud blocked)
    └── Gap Detector finds missing states
    ↓
BullMQ Heal Queue
    ├── Fetches from payment gateway
    ├── Replays missing events
    ├── Auto-resolves anomalies
    └── Logs to healer_audit_log
    ↓
Dashboard Metrics (every 10s)
    ├── Drift Rate
    ├── AI Recovery Rate
    ├── Open Anomalies
    └── Heal Success Rate
```

## Project Structure

```
├── backend/              # Express + Supabase + BullMQ
│   ├── src/
│   │   ├── db/           # Supabase client, SQL schema, migrations
│   │   ├── middleware/   # Express middleware (fraudDetection)
│   │   ├── queues/       # BullMQ heal queue + InMemoryQueue fallback
│   │   ├── routes/       # Express routes (webhook, mock, transactions, metrics, anomalies, security, injector)
│   │   ├── services/     # Business logic (stateMachine, autoHealer, gapDetector, securityLog, dataInjector)
│   │   ├── types/        # Shared TypeScript types
│   │   ├── workers/      # BullMQ workers (healWorker, webhookWorker)
│   │   ├── agents/       # AI agents (chaosHealer, chaosInjector)
│   │   └── index.ts      # Express server entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── render.yaml       # Render deployment manifest
│
├── frontend/             # React + Vite + Tailwind + Recharts
│   ├── src/
│   │   ├── components/   # UI components (MetricCards, DriftChart, TransactionList, AnomalyQueue, shadcn/ui)
│   │   ├── hooks/        # React hooks (useRealtime, use-toast, use-mobile)
│   │   ├── lib/          # API client, Supabase client, utilities
│   │   ├── pages/        # Page components (Dashboard, Transactions, ManualReview, SecurityDashboard)
│   │   ├── App.tsx       # Main app with tab navigation
│   │   ├── main.tsx      # Vite entry point
│   │   └── index.css     # Tailwind + custom CSS tokens
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
├── package.json          # Root workspace scripts
├── .env.example
└── README.md
```

## Environment Variables

### Backend

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port the Express server listens on | `3000` |
| `SUPABASE_URL` | Supabase project URL | *(required)* |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (server-side) | *(required)* |
| `UPSTASH_REDIS_URL` | Redis URL for BullMQ queue (Upstash) | *(optional)* |
| `FRONTEND_URL` | Allowed origin for CORS | `*` |
| `SELF_URL` | Base URL the backend uses to call itself (chaos demo, heal callbacks) | `http://localhost:3000` |

### Frontend

| Variable | Description | Default |
|---|---|---|
| `VITE_API_URL` | URL of the backend API | `http://localhost:3000` |
| `VITE_SUPABASE_URL` | Supabase project URL (realtime subscriptions) | *(optional)* |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (realtime subscriptions) | *(optional)* |

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm run install:all
```

### 2. Setup Environment Variables

Copy `.env.example` to `.env` in the root directory and edit:

```env
PORT=3000
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
UPSTASH_REDIS_URL=your_upstash_redis_url
SELF_URL=http://localhost:3000
```

### 3. Setup Database (CRITICAL)

Go to **Supabase SQL Editor** and run these files in order:

```bash
# Run in Supabase SQL Editor (in order):
backend/src/db/schema.sql                            # Base schema
backend/src/db/migration_add_resolution_notes.sql    # Anomaly tracking
backend/src/db/QUICK_FIX_healer_audit_log.sql        # ⚠️ FIXES audit log schema
backend/src/db/migration_add_drift_snapshots.sql     # Drift history
backend/src/db/migration_add_security_logs.sql       # Fraud detection logs
```

### 4. Start the App

```bash
npm run dev
```

- **Backend**: http://localhost:3000
- **Frontend**: http://localhost:8080

### 5. Verify It Works

```bash
# Test with dropped events scenario
curl -X POST http://localhost:3000/mock/simulate \
  -H "Content-Type: application/json" \
  -d '{"scenario":"dropped"}'
```

Check backend console for:
```
[HealerAudit] Successfully recorded: outcome=healed, txn=pay_DROP001
```

Refresh dashboard → Metrics should update within 10 seconds.

## Running Locally

### Option 1: Run both concurrently from root

```bash
npm run install:all     # Install all dependencies (root + backend + frontend)
npm run dev             # Starts backend on :3000 and frontend on :8080
```

### Option 2: Run separately

**Backend:**
```bash
cd backend
npm install
npm run dev             # Starts Express at http://localhost:3000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev             # Starts Vite dev server at http://localhost:8080
```

## API Endpoints

### Core Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/webhook/razorpay` | Incoming Razorpay webhook (with fraud detection) |
| `GET` | `/transactions` | List transactions (optional `?state=`, `?gateway=`, `?limit=`, `?page=`) |
| `GET` | `/transactions/:id/events` | Full event log for one transaction |
| `GET` | `/metrics` | Dashboard metrics (drift rate, heal success, AI recovery rate, open anomalies) |
| `GET` | `/metrics/drift-history` | Drift rate time series for charting |
| `GET` | `/metrics/healer-history` | Recent AI agent interventions from audit log |
| `GET` | `/anomalies` | Unresolved anomalies |
| `PATCH` | `/anomalies/:id/resolve` | Mark anomaly as resolved (body: `{ note: "...", targetState: "..." }`) |
| `POST` | `/anomalies/:id/reject` | Reject anomaly with no auto-heal (body: `{ note: "..." }`) |
| `POST` | `/anomalies/:id/refetch` | Re-fetch from gateway and replay events (auto-resolves on success) |
| `POST` | `/anomalies/auto-handle` | AI auto-handles all unresolved anomalies |
| `GET` | `/mock/razorpay/:txnId/fetch` | Mock gateway fetch for heal simulation |
| `POST` | `/mock/simulate` | Trigger chaos demo scenario |

### Security Dashboard

| Method | Path | Description |
|---|---|---|
| `GET` | `/security/logs` | Paginated fraud/security log entries (`?limit=50&offset=0`) |
| `GET` | `/security/stats` | Fraud statistics (blocked, dropped, allowed, avg risk, top flagged headers) |

### Injector Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/injector/start` | Start random injector with profile (body: `{ profile: "chaos" }`) |
| `POST` | `/injector/stop` | Stop the random injector |
| `GET` | `/injector/status` | Check injector status |

## Metrics & Monitoring

### Dashboard Metrics

The `/metrics` endpoint returns real-time data for:

- **Drift Rate**: Percentage of transactions with state gaps (dropped, out-of-order, or duplicate events)
- **AI Recovery Rate**: Percentage of AI interventions that successfully healed or suppressed anomalies
  - Formula: `(healed + suppressed) / (processed + healed + suppressed) × 100`
  - Updated whenever anomalies are resolved, rejected, or auto-healed
- **Open Anomalies**: Count of unresolved anomalies requiring attention
- **Heal Success Rate**: Success rate of automated heal jobs
- **Webhooks (60 min)**: Number of webhook events received in the last hour

### Fraud Detection

Every duplicate webhook attempt is scored on a 0–100 risk scale:

| Score | Action | Description |
|---|---|---|
| 0–24 | **ALLOW** | Standard retry — same headers, short time delta |
| 25–59 | **DROP** | Suspicious retry — silently dropped, logged to security dashboard |
| 60–100 | **BLOCK** | Fraudulent — 403 response, logged to security dashboard |

Risk factors:
- **Time delta** (0–50 pts): Larger gap between original and retry = higher risk
- **Header consistency** (0–50 pts): Changed signatures, IPs, or user agents = higher risk

### AI Agent Audit Log

All AI agent actions are recorded in the `healer_audit_log` table with:
- Transaction ID and gateway
- Original vs healed event type
- Outcome (`healed`, `suppressed`, `processed`)
- Actions taken and reasoning trail
- Confidence score
- Number of bridge events synthesized

The audit log is updated when:
- **Chaos Healer** processes incoming webhooks (real-time)
- **Auto Healer** successfully completes a heal job via gateway polling
- **Manual resolution** of an anomaly via the dashboard
- **Refetch & replay** successfully resolves an anomaly

### Anomaly Resolution Flow

1. **Detection**: Gap detection or state conflict creates an anomaly
2. **Auto-Heal**: BullMQ heal job attempts to fetch missing events from gateway
3. **Manual Review**: If auto-heal fails, anomaly appears in the review queue
4. **Resolution Options**:
   - **Resolve**: Manually mark as resolved with optional target state update
   - **Reject**: Mark as rejected with no healing action (counts as "suppressed")
   - **Refetch**: Re-poll gateway and replay events (auto-resolves on success)

All resolution actions are logged in the audit trail and immediately update the AI Recovery Rate.

## Chaos Demo

Trigger simulated failure scenarios:

```bash
# Dropped webhooks — only fires "captured", skipping created/authorized
curl -X POST http://localhost:3000/mock/simulate \
  -H "Content-Type: application/json" \
  -d '{"scenario":"dropped"}'

# Surge — 10 transactions × 3 events × 2 rounds (60 webhooks total)
curl -X POST http://localhost:3000/mock/simulate \
  -H "Content-Type: application/json" \
  -d '{"scenario":"surge"}'

# Out-of-order events
curl -X POST http://localhost:3000/mock/simulate \
  -H "Content-Type: application/json" \
  -d '{"scenario":"out_of_order"}'

# Normal flow
curl -X POST http://localhost:3000/mock/simulate \
  -H "Content-Type: application/json" \
  -d '{"scenario":"normal"}'
```

Each scenario fires webhooks to `/webhook/razorpay` and returns the count of webhooks fired.

## Testing & Data Injection

### Option 1: Random Injector (Recommended for Testing)

The random injector automatically cycles through different scenarios, including **fraud replay attacks** (~10% of batches):

```bash
cd backend
npm run injector:start   # Start continuous data injection
npm run injector:stop    # Stop the random injector
npm run injector:status  # Check current status
```

Profiles:
| Profile | Description |
|---|---|
| `realistic` | Mixed normal and anomalous traffic (default) |
| `balanced` | Equal distribution of scenarios |
| `chaos` | High rate of dropped and out-of-order events |
| `normal-only` | Clean transaction flow only |
| `fraud` | **70% fraud replay** — heavy replay attack simulation for security dashboard testing |

Start fraud mode:
```bash
curl -X POST http://localhost:3000/injector/start \
  -H "Content-Type: application/json" \
  -d '{"profile": "fraud"}'
```

### Option 2: One-Time Test Data Injection

Inject a batch of test data including transactions, events, anomalies, and audit log entries:

```bash
cd backend
npm run inject:test-data
```

This creates:
- 20 transactions across different states
- Webhook events for each transaction
- 15 healer audit entries (boosts AI Recovery Rate display)
- 5 open anomalies for testing the review queue
- 8 heal jobs with various statuses

### Option 3: Manual Testing

**Resolve an anomaly:**
```bash
curl -X PATCH http://localhost:3000/anomalies/{anomaly-id}/resolve \
  -H "Content-Type: application/json" \
  -d '{"note": "Manually verified", "targetState": "captured"}'
```

**Reject an anomaly:**
```bash
curl -X POST http://localhost:3000/anomalies/{anomaly-id}/reject \
  -H "Content-Type: application/json" \
  -d '{"note": "False positive"}'
```

**Refetch from gateway:**
```bash
curl -X POST http://localhost:3000/anomalies/{anomaly-id}/refetch
```

### Verifying Metrics

After injecting data, refresh the dashboard to see:
- **Drift Rate** changes based on dropped/out-of-order events
- **AI Recovery Rate** increases as anomalies are resolved
- **Open Anomalies** count decreases on resolution
- **Security Dashboard** populates with fraud replay entries (every ~10th batch)
- **AI Agent Audit Log** shows detailed reasoning for each action

The dashboard auto-refreshes every 10 seconds. Security tab polls every 3 seconds.

## Deployment (Render)

### Backend

1. Connect the repo to Render as a **Web Service**.
2. Set **Root Directory**: `backend`
3. Set **Build Command**: `npm install && npm run build`
4. Set **Start Command**: `npm start`
5. Add environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `UPSTASH_REDIS_URL`, `FRONTEND_URL`, `SELF_URL`.

A `backend/render.yaml` is provided for one-click setup.

### Frontend

1. Connect the repo to Render as a **Static Site**.
2. Set **Root Directory**: `frontend`
3. Set **Build Command**: `npm install && npm run build`
4. Set **Publish Directory**: `dist`
5. Set `VITE_API_URL` to your Render backend URL.

## Database

The Supabase schema is in `backend/src/db/schema.sql`. Run it in your Supabase SQL editor to create all tables, enums, and indexes.

### Migrations

Run these migrations in order after the base schema:

| # | Migration | Purpose |
|---|-----------|---------|
| 1 | `migration_add_resolution_notes.sql` | Adds `resolution_notes` to anomalies |
| 2 | `QUICK_FIX_healer_audit_log.sql` | **CRITICAL**: Creates `healer_audit_log` with correct schema |
| 3 | `migration_add_drift_snapshots.sql` | Creates drift snapshot table |
| 4 | `migration_add_security_logs.sql` | Creates `security_logs` table for fraud detection |

**⚠️ Important**: Do NOT run `migration_add_healer_audit_log.sql` — it has the wrong schema. Use `QUICK_FIX_healer_audit_log.sql` instead.

All migrations are idempotent and can be run multiple times safely.

## Troubleshooting

### AI Agent Audit Log is Empty

**Cause**: Schema mismatch in `healer_audit_log` table.

**Fix**: Run `backend/src/db/QUICK_FIX_healer_audit_log.sql` in Supabase SQL Editor, then restart backend.

### AI Recovery Rate Stays at 0%

**Cause**: No rows in `healer_audit_log` (see above).

**Verify**: Check backend console for `[HealerAudit]` messages. If you see "Failed to record audit trail", the schema is wrong.

### Open Anomalies Not Auto-Resolving

Anomalies auto-resolve when:
- ✅ Heal job successfully fetches and replays events from gateway
- ✅ Manual refetch completes successfully

Anomalies stay open when:
- ❌ Gateway returns 503 (outage) after 3 attempts
- ❌ State conflict detected (ledger vs gateway mismatch)

**Note**: Only one anomaly per transaction is created — duplicate anomaly creation is prevented.

### Heal Jobs Not Processing

**Check Redis connection**:
```bash
# Verify UPSTASH_REDIS_URL is set in .env
echo $UPSTASH_REDIS_URL
```

**Check worker logs**:
```bash
# Look for these in backend console:
[HealWorker] Processing job
[AutoHealer] Fetched from gateway
[AutoHealer] Auto-resolved X anomalies
```

**In-memory fallback**: If Redis hits its request limit, the system automatically switches to an in-memory queue. Heal jobs will still process — check for `[InMemoryQueue]` or `[InMemoryWorker]` log lines.

### Dashboard Metrics Not Updating

- Dashboard auto-refreshes every **10 seconds**
- Security tab auto-refreshes every **3 seconds** (shows "last updated" timestamp + green pulse dot)
- Check browser console for API errors
- Verify backend is running: `curl http://localhost:3000/health`

### Security Dashboard Shows No Data

The security dashboard only logs **duplicate webhook attempts**. First-time events pass through without logging. To populate it:

1. Start the fraud injection mode: `POST /injector/start` with `{"profile": "fraud"}`
2. Or send the same webhook twice to the same transaction ID
3. The second attempt triggers fraud detection → logs to `security_logs` → appears on the dashboard
