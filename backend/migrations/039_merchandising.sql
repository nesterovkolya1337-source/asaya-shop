CREATE TABLE merchandising (
 scope text PRIMARY KEY CHECK(scope IN ('catalog','hair','body','face','sets','recommendations')),
 revision integer NOT NULL DEFAULT 0,
 value jsonb NOT NULL DEFAULT '[]',
 updated_by uuid REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Preserve existing catalogue order; content stays in canonical product/editor records.
INSERT INTO merchandising(scope,value)
SELECT 'catalog',COALESCE(jsonb_agg(sku ORDER BY rank,sku),'[]') FROM (
 SELECT p.sku,COALESCE((e.published->'content'->'placement'->>'catalogOrder')::integer,0) rank
 FROM products p JOIN product_editor e ON e.product_id=p.id WHERE p.active AND p.archived_at IS NULL
) p;
INSERT INTO merchandising(scope,value) VALUES ('hair','[]'),('body','[]'),('face','[]'),('sets','[]'),('recommendations','{}');
