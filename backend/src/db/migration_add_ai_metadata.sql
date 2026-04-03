-- Migration: Add ai_metadata column to webhook_events for agent traceability
-- Run this in Supabase SQL Editor

-- Add AI metadata column
ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS ai_metadata JSONB;

-- Add processing source enum
ALTER TYPE event_source ADD VALUE IF NOT EXISTS 'ai_healed';

-- Add heal_audit_log table for full reasoning trail
CREATE TABLE IF NOT EXISTS healer_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_txn_id TEXT NOT NULL,
  gateway TEXT NOT NULL DEFAULT 'razorpay',
  original_event_type TEXT,
  healed_event_type TEXT NOT NULL,
  outcome TEXT NOT NULL, -- 'processed', 'healed', 'suppressed', 'fatal'
  actions_taken JSONB NOT NULL DEFAULT '[]',
  bridge_events_synthesized INT NOT NULL DEFAULT 0,
  confidence_score NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  reasoning_trail TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_healer_audit_gateway_txn
  ON healer_audit_log(gateway_txn_id);

CREATE INDEX idx_healer_audit_created_at
  ON healer_audit_log(created_at DESC);

CREATE INDEX idx_healer_audit_outcome
  ON healer_audit_log(outcome);

-- Helper: Count healed vs normal events for dashboard
CREATE OR REPLACE VIEW healer_stats AS
SELECT
  COUNT(*) FILTER (WHERE raw_payload IS NOT NULL AND (raw_payload->>'healed')::BOOLEAN = true) AS healed_count,
  COUNT(*) FILTER (WHERE raw_payload IS NULL OR (raw_payload->>'healed')::BOOLEAN IS NULL OR (raw_payload->>'healed')::BOOLEAN = false) AS normal_count,
  COUNT(*) AS total_count,
  CASE
    WHEN COUNT(*) = 0 THEN 0
    ELSE ROUND(
      COUNT(*) FILTER (WHERE raw_payload IS NOT NULL AND (raw_payload->>'healed')::BOOLEAN = true)::NUMERIC / COUNT(*) * 100,
      1
    )
  END AS heal_rate_percent
FROM webhook_events;
