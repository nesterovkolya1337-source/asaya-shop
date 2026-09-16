CREATE TABLE order_completion (
 order_id uuid PRIMARY KEY REFERENCES order_dispatch(order_id),
 completed_by uuid NOT NULL REFERENCES users(id),
 completed_at timestamptz NOT NULL DEFAULT now(),
 reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 1000)
);
