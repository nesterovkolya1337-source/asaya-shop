CREATE TABLE order_packing (
 order_id uuid PRIMARY KEY REFERENCES orders(id),
 packed_by uuid NOT NULL REFERENCES users(id),
 packed_at timestamptz NOT NULL DEFAULT now(),
 items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 50)
);
