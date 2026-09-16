CREATE TABLE idempotency_records (
 scope text NOT NULL, key text NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(scope,key)
);
CREATE TABLE integration_inbox (
 provider text NOT NULL, account_id text NOT NULL, environment text NOT NULL, event_id text NOT NULL,
 payload_hash text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,account_id,environment,event_id)
);
CREATE TABLE integration_outbox (
 id uuid PRIMARY KEY, kind text NOT NULL, aggregate_id uuid NOT NULL, payload jsonb NOT NULL,
 dedupe_key text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','done','failed')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, lease_token uuid, last_error text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_ready_idx ON integration_outbox(status,available_at);
CREATE TABLE audit_log (
 id uuid PRIMARY KEY, actor_id uuid REFERENCES users(id), action text NOT NULL,
 entity_id text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
