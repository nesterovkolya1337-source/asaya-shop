CREATE TABLE yandex_checkout_attempts (
 id uuid PRIMARY KEY, account_id text NOT NULL, environment text NOT NULL CHECK(environment IN ('test','production')),
 idempotency_key uuid NOT NULL, request_snapshot jsonb NOT NULL, checkout_snapshot jsonb NOT NULL,
 redirect_url text NOT NULL, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 CHECK(expires_at>created_at), UNIQUE(account_id,environment,idempotency_key)
);
CREATE INDEX yandex_checkout_attempts_expiry_idx ON yandex_checkout_attempts(expires_at);
