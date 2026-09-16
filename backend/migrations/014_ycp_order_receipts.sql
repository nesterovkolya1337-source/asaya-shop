CREATE TABLE ycp_order_receipts (
 order_id uuid NOT NULL REFERENCES orders(id),
 kind text NOT NULL CHECK(kind IN ('delivered','cancelled')),
 request_hash text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(order_id,kind)
);
