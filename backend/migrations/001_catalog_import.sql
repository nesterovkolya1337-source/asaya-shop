CREATE TABLE import_runs (
 id uuid PRIMARY KEY, source_sha256 text NOT NULL UNIQUE, source_name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), row_count integer NOT NULL CHECK (row_count >= 0)
);
CREATE TABLE import_rows (
 run_id uuid NOT NULL REFERENCES import_runs(id), row_number integer NOT NULL,
 source_uuid uuid NOT NULL, raw jsonb NOT NULL, disposition text NOT NULL,
 PRIMARY KEY(run_id,row_number)
);
CREATE TABLE products (
 id uuid PRIMARY KEY, sku text NOT NULL UNIQUE CHECK (length(sku) BETWEEN 1 AND 100),
 name text NOT NULL, source_uuid uuid UNIQUE, source_code text, source_external_code text,
 active boolean NOT NULL DEFAULT false, sale_approved boolean NOT NULL DEFAULT false,
 weight_g integer CHECK(weight_g > 0), width_mm integer CHECK(width_mm > 0),
 height_mm integer CHECK(height_mm > 0), depth_mm integer CHECK(depth_mm > 0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE storefront_mappings (
 slug text PRIMARY KEY, candidate_sku text, product_id uuid REFERENCES products(id),
 confidence text NOT NULL CHECK(confidence IN ('high','medium','low','unmatched')),
 approved boolean NOT NULL DEFAULT false, reason text NOT NULL,
 CHECK (NOT approved OR product_id IS NOT NULL)
);
CREATE TABLE product_barcodes (
 product_id uuid NOT NULL REFERENCES products(id), barcode text NOT NULL UNIQUE,
 CHECK(barcode ~ '^[0-9]{13}$'), PRIMARY KEY(product_id,barcode)
);
CREATE TABLE product_external_ids (
 provider text NOT NULL, environment text NOT NULL, account_id text NOT NULL,
 external_id text NOT NULL, product_id uuid NOT NULL REFERENCES products(id),
 PRIMARY KEY(provider,environment,account_id,external_id)
);
