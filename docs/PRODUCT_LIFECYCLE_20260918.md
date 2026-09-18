# Product lifecycle — 18 September 2026

Authority: `specs-20260918/product-lifecycle-final.txt`; launch assortment: `specs-20260918/launch-skus.json` (16 exact SKUs from the owner's Запуск.xlsx). These supersede prior draft-only editing and catalog transfer blockers.

## Implementation
- Draft requires exactly name, price, ingredients, description and one photograph for publication. Shared client/server rules disable Publish and explain missing fields. SKU/URL are generated if omitted; logistics, usage, size and stock are not publication requirements. One entered price fills the matching ordinary/sale price; no price is looked up externally.
- Valid saved edits to Published update the canonical published snapshot atomically, retaining Published. Invalid edits fail with field-specific messages and leave every previous field/revision unchanged. Unpublish is explicit; republish retains content, SKU, prices and stock.
- `active` is the existing publication flag. Catalog visibility no longer uses sale/price approval or component availability. Stock remains independent. Existing payment and integration gates are preserved.
- Additive migration 029 records archived state separately. It identifies only prior explicit archive audit records; it does not unpublish products. Archived cards cannot be edited or republished. Unused drafts may be deleted; historical orders/media remain intact.
- Operator reconciliation uses reviewed exact SKU mappings and hashes of current product/editor/price records. Changes by another administrator abort the whole transaction. The operation is idempotent and cannot undo a subsequent explicit Unpublish. It writes no stock, orders, shipping or integration settings. Original values and source evidence are retained in audit history.

## Existing production cards
Read-only recheck: all 17 legacy public PDPs returned 200 with matching names, content, photographs and displayed prices. Canonical DB had 25 records, zero active/published records and no prices. These were not all legitimate new drafts: canonical migration had failed to preserve the publication state of the existing storefront.

The owner's launch file selects 16 existing SKU records, including gift variants `2D-HK-02-01` and `3D-HK-01-01`. Restoration uses the corresponding existing public card data, never invented market prices or legacy display stock. `hair-trio-mask-set` is outside the supplied launch assortment. Old legacy names such as Avocado / strawberry yoghurt / blueberry remain unchanged; the launch file determines their canonical SKU. No duplicate products are created.

## Verification
- Backend lifecycle/admin/media/stock/migrations: 47/47 passed on disposable local PostgreSQL; subsequent reconciliation check passed after exact-mapping safeguards were added.
- Existing client suite: 89/89; production web build passed.
- Browser Admin at 1440 and 390 px: disabled missing-price Publish, minimal valid publication, blocked removal of ingredients, live valid save, Unpublish and separate archive state. No page errors. Fixtures only, no real SMS/payments/orders.
- Server container-wide checks and release outcome are recorded in the deployment evidence; this implementation report alone does not assert production publication.

## Release procedure
Back up DB/config, build/test the candidate, apply only additive 029, publish API/admin, then validate/apply the reviewed restoration plan. Publish the public frontend only after the canonical catalog contains exactly the supplied launch assortment; verify homepage/PDP/cart in the browser. Keep credentials, provider gates, actual stock and administrator-owned price management unchanged.
