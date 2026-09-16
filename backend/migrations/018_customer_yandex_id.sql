CREATE TABLE customer_oauth_identities (
 provider text NOT NULL CHECK(provider='yandex'),
 client_id text NOT NULL CHECK(length(client_id) BETWEEN 1 AND 200),
 subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 200),
 user_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 last_login_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,client_id,subject)
);
CREATE INDEX customer_oauth_user_idx ON customer_oauth_identities(user_id);

CREATE TABLE customer_oauth_states (
 state_hash text PRIMARY KEY,
 browser_hash text NOT NULL,
 client_id text NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE INDEX customer_oauth_expiry_idx ON customer_oauth_states(expires_at);
