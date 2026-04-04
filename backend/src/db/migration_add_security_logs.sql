-- Security Logs Table
-- Stores fraud assessment records from the webhook ingestion pipeline.
-- Used by the security dashboard for monitoring and AI review.

CREATE TABLE IF NOT EXISTS security_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gateway_txn_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  risk_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  fraud_flag BOOLEAN NOT NULL DEFAULT false,
  assessment TEXT NOT NULL CHECK (assessment IN ('block', 'drop', 'allow')),
  original_timestamp TIMESTAMPTZ NOT NULL,
  retry_timestamp TIMESTAMPTZ NOT NULL,
  time_delta_ms BIGINT NOT NULL DEFAULT 0,
  header_consistency NUMERIC(5,4) NOT NULL DEFAULT 1.0,
  flagged_fields TEXT[] DEFAULT '{}',
  request_headers JSONB DEFAULT '{}',
  original_headers JSONB DEFAULT '{}',
  ip_address TEXT NOT NULL DEFAULT 'unknown',
  user_agent TEXT DEFAULT 'unknown',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_security_logs_created_at ON security_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_logs_assessment ON security_logs(assessment);
CREATE INDEX IF NOT EXISTS idx_security_logs_fraud_flag ON security_logs(fraud_flag) WHERE fraud_flag = true;
CREATE INDEX IF NOT EXISTS idx_security_logs_gateway_txn_id ON security_logs(gateway_txn_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_risk_score ON security_logs(risk_score DESC);

-- RLS (optional — restrict to service role in production)
ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;

-- Allow read/write from service key (backend uses SUPABASE_SERVICE_KEY)
-- In production, add specific policies like:
-- CREATE POLICY "service_read" ON security_logs FOR SELECT USING (auth.role() = 'service_role');
-- CREATE POLICY "service_write" ON security_logs FOR INSERT WITH CHECK (auth.role() = 'service_role');
