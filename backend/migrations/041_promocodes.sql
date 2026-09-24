CREATE TABLE promocodes (
 id uuid PRIMARY KEY, code text NOT NULL UNIQUE, revision integer NOT NULL DEFAULT 1,
 settings jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
-- Reserved for confirmed order attribution; the gated checkout does not write usages.
CREATE TABLE promocode_usages (
 order_id uuid PRIMARY KEY REFERENCES orders(id), promo_id uuid NOT NULL REFERENCES promocodes(id),
 customer_id uuid REFERENCES customer_profiles(id), snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promocode_usages_promo ON promocode_usages(promo_id);
