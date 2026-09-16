CREATE TABLE fulfillment_jobs (
 order_id uuid PRIMARY KEY REFERENCES orders(id),
 account_id text NOT NULL, environment text NOT NULL CHECK(environment IN ('test','production')),
 shop_id bigint NOT NULL CHECK(shop_id>0), warehouse_id bigint NOT NULL CHECK(warehouse_id>0), sender_id bigint NOT NULL CHECK(sender_id>0),
 external_key text NOT NULL, external_id bigint CHECK(external_id>0),
 request_snapshot jsonb NOT NULL, request_hash text NOT NULL,
 state text NOT NULL CHECK(state IN ('prepared','sending','uncertain','created','review')),
 started_at timestamptz, verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(shop_id,environment,external_key), UNIQUE(shop_id,environment,external_id)
);
CREATE TABLE order_logistics (
 order_id uuid PRIMARY KEY REFERENCES orders(id),
 account_id text NOT NULL, environment text NOT NULL CHECK(environment IN ('test','production')),
 fulfillment_status text, fulfillment_raw_status text, fulfillment_synced_at timestamptz,
 cdek_uuid uuid, tracking_number text CHECK(tracking_number ~ '^[0-9]{5,30}$'),
 delivery_status text, delivery_raw_status text, delivery_occurred_at timestamptz,
 delivery_synced_at timestamptz, delivery_requested_at timestamptz,
 delivery_next_attempt_at timestamptz, delivery_attempts integer NOT NULL DEFAULT 0,
 UNIQUE(account_id,environment,cdek_uuid), UNIQUE(account_id,environment,tracking_number)
);
CREATE TABLE order_logistics_events (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id),
 provider text NOT NULL CHECK(provider IN ('cdek_ff','cdek')),
 raw_status text NOT NULL, status text NOT NULL, occurred_at timestamptz NOT NULL,
 observed_at timestamptz NOT NULL, deleted boolean NOT NULL DEFAULT false,
 UNIQUE(order_id,provider,raw_status,occurred_at)
);
CREATE INDEX order_logistics_refresh_idx ON order_logistics(delivery_synced_at) WHERE tracking_number IS NOT NULL;
CREATE INDEX order_logistics_events_order_idx ON order_logistics_events(order_id,occurred_at);
