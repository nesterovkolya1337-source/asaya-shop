-- Additive only. Apply separately after deployment approval and backup.
-- No existing balances, orders or warehouse bindings are changed.
CREATE TABLE stock_sources (
 warehouse_id uuid PRIMARY KEY REFERENCES warehouses(id),
 source_hash text NOT NULL CHECK(length(source_hash)=64),
 environment text NOT NULL CHECK(environment IN ('test','production')),
 generated_at timestamptz NOT NULL, fetched_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL, payload_hash text NOT NULL,
 healthy boolean NOT NULL DEFAULT true,
 last_error text, unknown_skus text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE stock_source_items (
 warehouse_id uuid NOT NULL REFERENCES stock_sources(warehouse_id),
 product_id uuid NOT NULL REFERENCES products(id),
 provider_quantity integer NOT NULL CHECK(provider_quantity BETWEEN 0 AND 1000000),
 listed boolean NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 0 AND 1000000),
 PRIMARY KEY(warehouse_id,product_id)
);
-- Used in every selling projection. Manual balances are allowed only in test mode.
CREATE FUNCTION asaya_stock_limit(pid uuid,wid uuid,require_source boolean,at_time timestamptz DEFAULT statement_timestamp())
RETURNS integer LANGUAGE sql STABLE AS $$
 SELECT COALESCE((SELECT CASE
  WHEN NOT s.healthy OR s.expires_at<=at_time OR (require_source AND s.environment<>'production') THEN 0
  ELSE COALESCE(i.quantity,0) END
 FROM stock_sources s LEFT JOIN stock_source_items i ON i.warehouse_id=s.warehouse_id AND i.product_id=pid
 WHERE s.warehouse_id=wid),CASE WHEN require_source THEN 0 ELSE 2147483647 END)::integer;
$$;
