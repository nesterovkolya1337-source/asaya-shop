CREATE TABLE payments (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), provider text NOT NULL,
 account_id text NOT NULL, environment text NOT NULL CHECK(environment IN ('test','production')),
 external_id text NOT NULL, status text NOT NULL CHECK(status IN ('pending','authorized','paid','failed','cancelled','partially_refunded','refunded')),
 amount_minor bigint NOT NULL CHECK(amount_minor>0), currency text NOT NULL CHECK(currency='RUB'),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,account_id,environment,external_id)
);
CREATE TABLE payment_operations (
 id uuid PRIMARY KEY, payment_id uuid NOT NULL REFERENCES payments(id),
 external_operation_id text NOT NULL, kind text NOT NULL, status text NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor>0), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(payment_id,external_operation_id)
);
CREATE TABLE refunds (
 id uuid PRIMARY KEY, payment_id uuid NOT NULL REFERENCES payments(id), idempotency_key text NOT NULL UNIQUE,
 amount_minor bigint NOT NULL CHECK(amount_minor>0), status text NOT NULL CHECK(status IN ('pending','succeeded','failed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shipments (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), provider text NOT NULL,
 external_id text, account_id text NOT NULL, environment text NOT NULL,
 status text NOT NULL, tracking_url text, snapshot jsonb NOT NULL,
 UNIQUE(provider,account_id,environment,external_id)
);
CREATE TABLE shipment_events (
 id uuid PRIMARY KEY, shipment_id uuid NOT NULL REFERENCES shipments(id), status text NOT NULL,
 occurred_at timestamptz NOT NULL, external_event_id text NOT NULL,
 UNIQUE(shipment_id,external_event_id)
);
