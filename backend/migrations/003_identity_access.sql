CREATE TABLE users (
 id uuid PRIMARY KEY, role text NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','manager','admin')),
 created_at timestamptz NOT NULL DEFAULT now(), disabled boolean NOT NULL DEFAULT false
);
CREATE TABLE user_identities (
 channel text NOT NULL CHECK(channel IN ('email','sms')), destination text NOT NULL,
 user_id uuid NOT NULL REFERENCES users(id), verified_at timestamptz NOT NULL,
 PRIMARY KEY(channel,destination)
);
ALTER TABLE delivery_quotes ADD CONSTRAINT delivery_quote_user FOREIGN KEY(user_id) REFERENCES users(id);
CREATE TABLE otp_challenges (
 id uuid PRIMARY KEY, channel text NOT NULL CHECK(channel IN ('email','sms')), destination text NOT NULL,
 code_mac text NOT NULL, expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0,
 CHECK(attempts BETWEEN 0 AND 5), consumed_at timestamptz,
 delivery_status text NOT NULL CHECK(delivery_status IN ('pending','sent','failed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_destination_idx ON otp_challenges(channel,destination,created_at);
CREATE TABLE auth_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 csrf_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);
CREATE TABLE rate_limits (
 bucket_key text PRIMARY KEY, window_start timestamptz NOT NULL, count integer NOT NULL CHECK(count>0)
);
