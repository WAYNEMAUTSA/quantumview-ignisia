

-- Drop the old table with wrong schema
DROP TABLE IF EXISTS healer_audit_log CASCADE;

-- Recreate with correct schema that the code expects
CREATE TABLE healer_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_txn_id TEXT NOT NUL
  gateway TEXT NOT NULL DEFAULT 'razorpay',
  original_event_type TEXT,
  healed_event_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  actions_taken JSONB NOT NULL DEFAULT '[]',
  bridge_events_synthesized INT NOT NULL DEFAULT 0,
  confidence_score NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  reasoning_trail TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_healer_audit_gateway_txn
  ON healer_audit_log(gateway_txn_id);

CREATE INDEX IF NOT EXISTS idx_healer_audit_created_at
  ON healer_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_healer_audit_outcome
  ON healer_audit_log(outcome);

-- Verify the table was created correctly
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'healer_audit_log'
ORDER BY ordinal_position;
