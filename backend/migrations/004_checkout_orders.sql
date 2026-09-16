CREATE TABLE checkout_sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL CHECK(status IN ('open','placed','cancelled','expired')),
 provider text, provider_account text, external_session_id text,
 snapshot jsonb NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,provider_account,external_session_id)
);
CREATE SEQUENCE public_order_sequence START 10001;
CREATE TABLE orders (
 id uuid PRIMARY KEY, public_number text NOT NULL UNIQUE,
 checkout_id uuid NOT NULL UNIQUE REFERENCES checkout_sessions(id), user_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL CHECK(status IN ('draft','placed','processing','completed','cancelled')),
 payment_status text NOT NULL CHECK(payment_status IN ('pending','authorized','paid','failed','cancelled','partially_refunded','refunded')),
 delivery_status text NOT NULL CHECK(delivery_status IN ('not_created','preparing','shipped','arrived_to_pickup_point','delivered','cancelled','returned')),
 currency text NOT NULL CHECK(currency='RUB'), subtotal_minor bigint NOT NULL CHECK(subtotal_minor>=0),
 delivery_minor bigint NOT NULL CHECK(delivery_minor>=0), total_minor bigint NOT NULL,
 CHECK(total_minor = subtotal_minor + delivery_minor AND total_minor<=1000000000000),
 customer_snapshot jsonb NOT NULL, delivery_snapshot jsonb NOT NULL, consent_snapshot jsonb NOT NULL,
 external_ycp_order_id text, external_ycp_order_number bigint,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_user_created_idx ON orders(user_id,created_at DESC);
CREATE TABLE order_items (
 order_id uuid NOT NULL REFERENCES orders(id), product_id uuid NOT NULL REFERENCES products(id),
 sku text NOT NULL, name_snapshot text NOT NULL, quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100),
 unit_minor bigint NOT NULL CHECK(unit_minor>=0), line_minor bigint NOT NULL,
 CHECK(line_minor=unit_minor*quantity), purchased_count integer NOT NULL DEFAULT 0,
 refused_count integer NOT NULL DEFAULT 0,
 CHECK(purchased_count>=0 AND refused_count>=0 AND purchased_count+refused_count<=quantity),
 PRIMARY KEY(order_id,product_id)
);
CREATE TABLE order_status_history (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), kind text NOT NULL,
 status text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), source text NOT NULL
);
