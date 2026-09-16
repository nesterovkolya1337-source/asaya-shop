CREATE TABLE product_prices (
 product_id uuid PRIMARY KEY REFERENCES products(id), currency text NOT NULL CHECK(currency='RUB'),
 regular_minor bigint NOT NULL CHECK(regular_minor BETWEEN 0 AND 1000000000000),
 final_minor bigint NOT NULL CHECK(final_minor BETWEEN 0 AND regular_minor),
 approved boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE warehouses (
 id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
 active boolean NOT NULL DEFAULT false, address jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE inventory_balances (
 product_id uuid NOT NULL REFERENCES products(id), warehouse_id uuid NOT NULL REFERENCES warehouses(id),
 on_hand integer NOT NULL CHECK(on_hand >= 0), reserved integer NOT NULL DEFAULT 0,
 CHECK(reserved BETWEEN 0 AND on_hand), PRIMARY KEY(product_id,warehouse_id)
);
-- Component definitions are staged only. V1 reserves preassembled SKUs exclusively.
CREATE TABLE product_components (
 product_id uuid NOT NULL REFERENCES products(id), component_id uuid NOT NULL REFERENCES products(id),
 quantity integer NOT NULL CHECK(quantity>0), CHECK(product_id<>component_id),
 PRIMARY KEY(product_id,component_id)
);
CREATE TABLE delivery_quotes (
 id uuid PRIMARY KEY, user_id uuid, warehouse_id uuid NOT NULL REFERENCES warehouses(id),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 0 AND 1000000000000),
 currency text NOT NULL CHECK(currency='RUB'), cart_hash text NOT NULL,
 snapshot jsonb NOT NULL, expires_at timestamptz NOT NULL,
 environment text NOT NULL CHECK(environment IN ('test','production'))
);
