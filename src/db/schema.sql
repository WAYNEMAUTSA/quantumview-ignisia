CREATE TYPE transaction_state AS ENUM (
  'created', 'authorized', 'captured',
  'settled', 'failed', 'refunded',
  'refund_initiated', 'disputed', 'unknown'
);

CREATE TYPE event_source AS ENUM ('webhook', 'gateway_poll');
CREATE TYPE heal_status AS ENUM ('pending', 'in_progress', 'resolved', 'failed');
CREATE TYPE anomaly_type AS ENUM (
  'conflict', 'gateway_outage',
  'impossible_transition', 'max_retries_exceeded'
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway TEXT NOT NULL,
  gateway_txn_id TEXT NOT NULL,
  current_state transaction_state NOT NULL DEFAULT 'created',
  amount NUMERIC,
  currency TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(gateway, gateway_txn_id)
);

CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES transactions(id),
  idempotency_key TEXT UNIQUE NOT NULL,
  event_type transaction_state NOT NULL,
  gateway_timestamp TIMESTAMPTZ NOT NULL,
  source event_source NOT NULL DEFAULT 'webhook',
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE heal_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES transactions(id),
  status heal_status NOT NULL DEFAULT 'pending',
  missing_states TEXT[] NOT NULL,
  attempts INT DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES transactions(id),
  type anomaly_type NOT NULL,
  severity TEXT NOT NULL DEFAULT 'high',
  description TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_transaction_id 
  ON webhook_events(transaction_id, gateway_timestamp);
CREATE INDEX idx_heal_jobs_status 
  ON heal_jobs(status) WHERE status = 'pending';
CREATE INDEX idx_anomalies_resolved 
  ON anomalies(resolved_at) WHERE resolved_at IS NULL;
