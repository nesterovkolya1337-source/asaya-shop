-- Warehouse identity is stable across onboarding and future CDEK stock imports.
CREATE TABLE warehouse_profiles (
 warehouse_id uuid PRIMARY KEY REFERENCES warehouses(id),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 address_line text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
 description text NOT NULL DEFAULT '',
 ycp_export_enabled boolean NOT NULL DEFAULT false,
 can_fulfill boolean NOT NULL DEFAULT false,
 served_localities text[] NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT can_fulfill OR (length(trim(address_line))>0 AND length(trim(phone))>0 AND cardinality(served_localities)>0))
);
CREATE TABLE warehouse_external_ids (
 provider text NOT NULL CHECK(provider='cdek_ff'),
 account_id text NOT NULL CHECK(length(trim(account_id))>0),
 external_id text NOT NULL CHECK(length(trim(external_id))>0),
 warehouse_id uuid NOT NULL REFERENCES warehouses(id),
 parent_code text,
 sync_status text NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','active','error','disabled')),
 last_stock_sync_at timestamptz,
 PRIMARY KEY(provider,account_id,external_id),
 UNIQUE(provider,account_id,warehouse_id)
);
