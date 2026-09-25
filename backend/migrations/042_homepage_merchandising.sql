ALTER TABLE merchandising DROP CONSTRAINT merchandising_scope_check;
ALTER TABLE merchandising ADD CONSTRAINT merchandising_scope_check
 CHECK(scope IN ('catalog','hair','body','face','sets','recommendations','home_bestsellers','home_new'));

-- One-time transfer of the previous explicit placements, never inferred from badges.
-- Future membership is managed exclusively through Admin merchandising.
INSERT INTO merchandising(scope,value)
SELECT scope,COALESCE((SELECT jsonb_agg(sku ORDER BY rank,sku) FROM (
 SELECT p.sku,(e.published->'content'->'placement'->>field)::integer AS rank
 FROM products p JOIN product_editor e ON e.product_id=p.id
 WHERE p.active AND p.archived_at IS NULL AND e.published IS NOT NULL
 AND (e.published->'content'->'placement'->>field) IS NOT NULL
) entries),'[]'::jsonb)
FROM (VALUES ('home_bestsellers','bestsellerOrder'),('home_new','newOrder')) scopes(scope,field);
