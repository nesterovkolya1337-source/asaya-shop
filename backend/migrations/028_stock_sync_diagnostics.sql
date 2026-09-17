-- Additive diagnostics for a configured source before its first successful read.
-- Existing successful snapshots and inventory/reservation quantities are preserved.
ALTER TABLE stock_sources
 ALTER COLUMN generated_at DROP NOT NULL,
 ALTER COLUMN fetched_at DROP NOT NULL,
 ALTER COLUMN expires_at DROP NOT NULL,
 ALTER COLUMN payload_hash DROP NOT NULL,
 ADD COLUMN last_attempt_at timestamptz,
 ADD COLUMN next_attempt_at timestamptz,
 ADD COLUMN consecutive_failures integer NOT NULL DEFAULT 0 CHECK(consecutive_failures>=0),
 ADD CONSTRAINT stock_success_has_snapshot CHECK(NOT healthy OR
  (generated_at IS NOT NULL AND fetched_at IS NOT NULL AND expires_at IS NOT NULL AND payload_hash IS NOT NULL));
