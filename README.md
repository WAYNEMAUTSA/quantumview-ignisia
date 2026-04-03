@SydneyPanasheRikoma ➜ /workspaces/quantumview-ignisia (main) $ git add -A && git commit -m "Remove Lovable branding and update README"
On branch main
Your branch is ahead of 'origin/main' by 3 commits.
  (use "git push" to publish your local commits)

nothing to commit, working tree clean# Webhook Reconciliation System

A production-ready microservice that ingests payment gateway webhooks (Razorpay, Stripe, Cashfree), detects out-of-order or missing events, auto-heals ledger gaps by polling the gateway API, and exposes a real-time dashboard to monitor drift rate, heal success rate, and manual review queue.

---

## Problem Statement

Payment gateways emit webhooks for each state change (created -> captured -> settled -> refunded). In real-world conditions:

- **Out-of-order delivery** - `captured` arrives before `created`
- **Silent drops** - webhooks lost during server restarts
- **Retry storms** - thousands of duplicate webhooks after downtime

Without a reconciliation layer, ledgers drift from reality, orders stall, double charges go undetected, and settlement mismatches accumulate until a costly compliance audit.

## Solution Overview

The system implements three core layers:

1. **Ingestion & Deduplication** - Idempotency keys (gateway + event_id) stored in Redis (BullMQ job IDs). Duplicates are dropped before any processing.
2. **State Machine** - Each transaction follows the expected lifecycle: `created -> captured -> settled -> (refunded)` If an event arrives without its required predecessor, a gap is detected.
3. **Auto-Healer** - Fetches the full transaction status from the gateway API, reconstructs missing events, injects them in order, and re-runs the state machine. If the gateway API fails, the anomaly is pushed to a manual review queue.

A live dashboard shows:

- **Drift rate** - % of transactions where ledger != gateway truth
- **Heal success rate** - % of gaps resolved automatically
- **Manual review queue** - anomalies requiring human intervention

## Tech Stack

| Component          | Technology                                                  |
| ------------------ | ----------------------------------------------------------- |
| Runtime            | Node.js + TypeScript                                        |
| API Framework      | Express                                                     |
| Queue              | BullMQ + Upstash Redis (free hosted Redis)                  |
| Database           | Supabase (PostgreSQL) - event log, ledger, transactions, heal logs |
| Idempotency Cache  | BullMQ job IDs (no separate cache needed)                   |
| Mock Gateway       | Express routes simulating Razorpay                          |
| Frontend           | React + Recharts + Tailwind CSS                             |
| Hosting            | Render (backend) + Vercel/Netlify (optional for frontend)   |

## Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PAYMENT GATEWAY (Razorpay/Stripe)                   │
│                                   │                                         │
│                         Webhook POST (event + transaction_id)               │
└───────────────────────────────────┬─────────────────────────────────────────┘
									│
									▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INGESTION SERVICE (Express)                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Step 1: IDEMPOTENCY CHECK (Redis / BullMQ job ID)                  │    │
│  │  Key = gateway_name + event_id + transaction_id                    │    │
│  │  Already seen? -> Return 200 (drop duplicate)                      │    │
│  │  New? -> Store key -> Continue                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Step 2: QUEUE (BullMQ + Upstash Redis)                             │    │
│  │  - Rate-limited (e.g., 100 jobs/sec)                                │    │
│  │  - Async worker picks up event                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└───────────────────────────────────┬─────────────────────────────────────────┘
									│
									▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STATE MACHINE (Worker)                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Given: transaction_id + incoming_event (e.g., "captured")         │    │
│  │  Query: Does this transaction have required previous event?         │    │
│  │                                                                     │    │
│  │  Expected flow: created -> captured -> settled -> (refunded optional) │  │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                    ┌───────────────┴───────────────┐                        │
│                    │                               │                        │
│                    ▼                               ▼                        │
│           ┌────────────────┐              ┌────────────────┐              │
│           │  VALID EVENT   │              │  GAP DETECTED  │              │
│           │  (Sequence OK) │              │  (Missing prev)│              │
│           └───────┬────────┘              └───────┬────────┘              │
│                   │                               │                        │
│                   ▼                               ▼                        │
│           Update ledger                   Trigger AUTO-HEALER              │
│           (Supabase)                           module                      │
└───────────────────┬───────────────────────────────┬────────────────────────┘
					│                               │
					▼                               ▼
		 ┌──────────────────────┐        ┌──────────────────────────────────┐
		 │  SUPABASE DATABASE    │        │         AUTO-HEALER              │
		 │  - events table       │        │  ┌────────────────────────────┐  │
		 │  - transactions table │        │  │ 1. Call Gateway GET API    │  │
		 │  - heal_log table     │        │  │    for full transaction    │  │
		 │  - manual_review table│        │  │    status & history        │  │
		 └──────────┬───────────┘        │  └────────────┬───────────────┘  │
					│                    │               │                  │
					│                    │               ▼                  │
					│                    │  ┌────────────────────────────┐  │
					│                    │  │ 2. Success?                │  │
					│                    │  │    -> Inject missing events │  │
					│                    │  │    -> Re-run state machine  │  │
					│                    │  │    -> Update ledger         │  │
					│                    │  │                            │  │
					│                    │  │ 3. Failure?                │  │
					│                    │  │    -> Push to manual_review │  │
					│                    │  │      queue with reason     │  │
					│                    │  └────────────────────────────┘  │
					│                    └─────────────────┬────────────────┘
					│                                      │
					│                                      ▼
					│                            ┌─────────────────┐
					│                            │ MANUAL REVIEW   │
					│                            │ QUEUE (Screen 3)│
					│                            └────────┬────────┘
					│                                     │
					└─────────────────┬───────────────────┘
									  │
									  ▼
						  ┌─────────────────────────┐
						  │      DASHBOARD (React)   │
						  │  - Drift rate (0-100%)   │
						  │  - Heal success rate     │
						  │  - Manual queue size     │
						  │  - Transaction explorer  │
						  │  - Live event feed       │
						  └─────────────────────────┘
```
