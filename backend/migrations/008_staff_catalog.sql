CREATE TABLE staff_credentials (
 user_id uuid PRIMARY KEY REFERENCES users(id), email text NOT NULL UNIQUE,
 password_salt text NOT NULL, password_hash text NOT NULL, totp_encrypted text NOT NULL,
 last_totp_step bigint NOT NULL DEFAULT -1
);
CREATE TABLE staff_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES staff_credentials(user_id),
 created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE TABLE product_editor (
 product_id uuid PRIMARY KEY REFERENCES products(id), revision integer NOT NULL CHECK(revision>0),
 draft jsonb NOT NULL, published jsonb, published_at timestamptz,
 updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);

