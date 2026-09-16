CREATE TABLE inventory_reservations (
 order_id uuid NOT NULL REFERENCES orders(id), product_id uuid NOT NULL, warehouse_id uuid NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0), expires_at timestamptz NOT NULL,
 status text NOT NULL CHECK(status IN ('active','released','consumed')),
 FOREIGN KEY(product_id,warehouse_id) REFERENCES inventory_balances(product_id,warehouse_id),
 PRIMARY KEY(order_id,product_id,warehouse_id)
);
CREATE INDEX reservations_expiry_idx ON inventory_reservations(expires_at) WHERE status='active';
CREATE TABLE inventory_movements (
 id uuid PRIMARY KEY, order_id uuid REFERENCES orders(id), product_id uuid NOT NULL REFERENCES products(id),
 warehouse_id uuid NOT NULL REFERENCES warehouses(id), kind text NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,product_id,warehouse_id,kind)
);
