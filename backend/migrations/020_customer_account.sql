CREATE TABLE customer_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 phone text NOT NULL UNIQUE CHECK(phone ~ '^\+7[0-9]{10}$'),
 user_id uuid UNIQUE REFERENCES users(id),
 name text NOT NULL DEFAULT '' CHECK(length(name)<=200),
 email text NOT NULL DEFAULT '' CHECK(length(email)<=254),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE orders ADD COLUMN customer_id uuid REFERENCES customer_profiles(id);
ALTER TABLE orders ADD COLUMN customer_phone_normalized text CHECK(customer_phone_normalized ~ '^\+7[0-9]{10}$');

-- Same accepted formats as customer-phone.ts. Malformed contacts never match.
CREATE FUNCTION asaya_customer_phone(raw text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT CASE WHEN length(trim(raw))<=32 AND trim(raw) ~ '^\+?[0-9 ()-]+$' THEN
 CASE WHEN trim(raw) LIKE '+%' THEN CASE WHEN digits ~ '^7[0-9]{10}$' THEN '+'||digits END
 WHEN digits ~ '^[0-9]{10}$' THEN '+7'||digits
 WHEN digits ~ '^[78][0-9]{10}$' THEN '+7'||substr(digits,2) END END
 FROM (SELECT regexp_replace(trim(raw),'[^0-9]','','g') AS digits) d
$$;
CREATE INDEX orders_customer_phone_idx ON orders(asaya_customer_phone(customer_snapshot->>'phone')) WHERE customer_snapshot->>'source'='ycp';
CREATE TABLE customer_order_claims (
 order_id uuid PRIMARY KEY REFERENCES orders(id), user_id uuid NOT NULL REFERENCES users(id),
 claimed_at timestamptz NOT NULL DEFAULT now(), method text NOT NULL CHECK(method='verified_sms')
);

-- Existing finalized YCP orders get a contact profile, never a login session.
INSERT INTO customer_profiles(phone)
 SELECT DISTINCT asaya_customer_phone(o.customer_snapshot->>'phone')
 FROM orders o JOIN ycp_sessions y ON y.order_id=o.id
 WHERE y.placement_outcome='placed' AND asaya_customer_phone(o.customer_snapshot->>'phone') IS NOT NULL
 ON CONFLICT(phone) DO NOTHING;
UPDATE orders o SET customer_id=p.id,customer_phone_normalized=p.phone
 FROM customer_profiles p WHERE asaya_customer_phone(o.customer_snapshot->>'phone')=p.phone
 AND EXISTS(SELECT 1 FROM ycp_sessions y WHERE y.order_id=o.id AND y.placement_outcome='placed');
