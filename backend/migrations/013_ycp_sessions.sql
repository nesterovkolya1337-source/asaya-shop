CREATE TABLE ycp_sessions (
 account_id text NOT NULL, environment text NOT NULL CHECK(environment IN ('test','production')),
 session_id text NOT NULL, order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
 request_hash text NOT NULL, placement_hash text, placement_outcome text CHECK(placement_outcome IN ('placed','late_review')),
 external_order_id text, external_order_number bigint, payment_method text CHECK(payment_method IN ('online','on_delivery')),
 acquiring_id text,
 PRIMARY KEY(account_id,environment,session_id),
 UNIQUE(account_id,environment,external_order_id), UNIQUE(account_id,environment,external_order_number)
);
