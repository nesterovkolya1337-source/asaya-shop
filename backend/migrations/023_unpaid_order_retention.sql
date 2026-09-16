ALTER TABLE orders ADD COLUMN legal_hold boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN pii_purged_at timestamptz;
CREATE INDEX orders_unpaid_retention_idx ON orders(updated_at) WHERE pii_purged_at IS NULL AND NOT legal_hold AND status='cancelled';
