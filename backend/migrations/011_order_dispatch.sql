CREATE TABLE order_dispatch (
 order_id uuid PRIMARY KEY REFERENCES orders(id),
 shipment_id uuid NOT NULL UNIQUE REFERENCES shipments(id),
 carrier text NOT NULL CHECK(length(carrier) BETWEEN 1 AND 100),
 tracking_number text NOT NULL CHECK(length(tracking_number) BETWEEN 1 AND 100),
 dispatched_by uuid NOT NULL REFERENCES users(id),
 dispatched_at timestamptz NOT NULL DEFAULT now()
);
