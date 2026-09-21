UPDATE marketing_settings SET
 defaults=defaults || '{"loyalty":{"cashbackPercent":3,"maxRedemptionPercent":20}}'::jsonb,
 draft=draft || '{"loyalty":{"cashbackPercent":3,"maxRedemptionPercent":20}}'::jsonb,
 live=live || '{"loyalty":{"cashbackPercent":3,"maxRedemptionPercent":20}}'::jsonb;

CREATE TABLE loyalty_order_snapshots (
 order_id uuid PRIMARY KEY REFERENCES orders(id),
 eligible_minor bigint NOT NULL CHECK(eligible_minor>=0),
 redeemed_points bigint NOT NULL DEFAULT 0 CHECK(redeemed_points>=0),
 cash_product_minor bigint NOT NULL CHECK(cash_product_minor>=0),
 cashback_percent integer NOT NULL CHECK(cashback_percent BETWEEN 0 AND 100),
 max_redemption_percent integer NOT NULL CHECK(max_redemption_percent BETWEEN 0 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(eligible_minor=cash_product_minor+redeemed_points*100)
);
CREATE TABLE loyalty_ledger (
 id uuid PRIMARY KEY,
 customer_id uuid NOT NULL REFERENCES customer_profiles(id),
 type text NOT NULL,
 points bigint NOT NULL,
 source text NOT NULL,
 source_key text NOT NULL UNIQUE,
 order_id uuid REFERENCES orders(id),
 reversal_of uuid REFERENCES loyalty_ledger(id),
 description text NOT NULL,
 status text NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','review')),
 detail jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX loyalty_ledger_customer ON loyalty_ledger(customer_id,created_at,id);
CREATE FUNCTION loyalty_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Loyalty records are immutable; append a correction'; END $$;
CREATE TRIGGER loyalty_ledger_immutable BEFORE UPDATE OR DELETE ON loyalty_ledger FOR EACH ROW EXECUTE FUNCTION loyalty_immutable();
CREATE TRIGGER loyalty_snapshot_immutable BEFORE UPDATE OR DELETE ON loyalty_order_snapshots FOR EACH ROW EXECUTE FUNCTION loyalty_immutable();
