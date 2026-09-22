CREATE TABLE promo_codes (
 id uuid PRIMARY KEY, code text NOT NULL UNIQUE CHECK(code=upper(btrim(code))),
 discount_percent integer NOT NULL CHECK(discount_percent BETWEEN 1 AND 100),
 starts_at timestamptz, ends_at timestamptz,
 is_active boolean NOT NULL DEFAULT true, archived_at timestamptz,
 max_total_uses integer CHECK(max_total_uses>0),
 max_uses_per_customer integer CHECK(max_uses_per_customer>0),
 allow_repeat_use boolean NOT NULL DEFAULT false,
 label text NOT NULL DEFAULT '', revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(starts_at IS NULL OR ends_at IS NULL OR starts_at<ends_at),
 CHECK(allow_repeat_use OR (max_uses_per_customer IS NOT NULL AND max_uses_per_customer=1))
);
-- History has no cascading deletion. No checkout integration is enabled by this migration.
CREATE TABLE promo_order_snapshots (
 order_id uuid PRIMARY KEY REFERENCES orders(id), promo_id uuid NOT NULL REFERENCES promo_codes(id),
 promo_code text NOT NULL, discount_percent integer NOT NULL CHECK(discount_percent BETWEEN 1 AND 100),
 before_minor bigint NOT NULL CHECK(before_minor>=0), discount_minor bigint NOT NULL CHECK(discount_minor>=0),
 after_minor bigint NOT NULL CHECK(after_minor>=0 AND before_minor-discount_minor=after_minor),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE promo_paid_uses (
 order_id uuid PRIMARY KEY REFERENCES promo_order_snapshots(order_id),
 promo_id uuid NOT NULL REFERENCES promo_codes(id), customer_id uuid REFERENCES customer_profiles(id),
 discount_minor bigint NOT NULL CHECK(discount_minor>=0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promo_paid_customer ON promo_paid_uses(promo_id,customer_id);
