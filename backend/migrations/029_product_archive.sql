-- Additive only: preserve every existing publication, price, content and stock.
ALTER TABLE products ADD COLUMN archived_at timestamptz;
-- Only prior explicit removals are archived, never merely unpublished cards.
UPDATE products p SET archived_at=a.created_at
FROM (SELECT DISTINCT ON (entity_id) entity_id,action,created_at FROM audit_log
 WHERE action IN ('product.archived','product.published','product.unpublished')
 ORDER BY entity_id,created_at DESC,id DESC) a
WHERE p.id::text=a.entity_id::text AND a.action='product.archived' AND NOT p.active;
