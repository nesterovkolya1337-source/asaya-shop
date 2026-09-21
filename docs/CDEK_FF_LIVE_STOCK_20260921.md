# CDEK Fulfillment live stock — implementation, no deploy

## Verified source and authentication

Official contract: https://apidoc.cdek.ru/api/fulfillment

`GET https://cdek.orderadmin.ru/api/products/offer?page=1&per_page=100`
uses HTTP Basic Auth with the Fulfillment cabinet login/password, not the ordinary
api.cdek.ru Account / Secure Password pair. Read-only production-account probe and
the new adapter both returned HTTP 200. No provider writes or production stock writes.
Credentials were used in process memory, not saved in repository/config artifacts.

Verified adapter observation: 2026-09-21 15:49:39 UTC. HTTP Date: 15:49:41 UTC.
Response: application/hal+json, page=1, page_size=100, page_count=1, total_items=25.
Shop 220216, warehouse 23401. 12 FF service records have article=null and items=null;
13 physical product records have exact articles. Canonical production SKU list was
read with SELECT only: all 13 articles match, no approximate/barcode/name mapping.

Sanitized shape (actual product fields):
```json
{"_embedded":{"product_offer":[{"id":35166041,"article":"1S-HK-01",
"sku":"4644591877311","items":[{"count":102,"state":"normal","warehouse":23401}],
"inventoryUpdated":"2026-09-18 14:04:23+00","_embedded":{"shop":{"id":220216}}}]},
"page":1,"page_size":100,"page_count":1,"total_items":25}
```

## Actual available quantities at observation

Only `items.state=normal`, warehouse=23401 is counted; new/booked/shipped and other
warehouses are excluded. FF `article` -> ASAYA canonical `sku`. FF `sku` contains
the barcode and is NOT used as the canonical mapping.

| Canonical SKU | Quantity |
|---|---:|
|1S-BA-01|40|
|1S-BA-02-01|24|
|1S-BA-02-02|24|
|1S-BA-02-03|24|
|1S-BA-02-05|0|
|1S-BA-03|40|
|1S-HK-01|102|
|1S-HK-02|192|
|1S-HK-03|102|
|1S-HK-04|96|
|1S-HK-05|102|
|2D-HK-02-01|32|
|3D-HK-01-01|0|

The two zero rows have items=null, meaning no stock entries in the complete live
response. The other 12 canonical ASAYA products are absent from this source;
they remain `missing`/unavailable, not claimed as measured zero or unpublished.

## Existing stock layer

`createStockSource` selects `cdek_ff_api` explicitly. There is no fallback to YML.
The old YML adapter stays available for existing configurations but is not the
source for the new API configuration. The stale September 18 YML was not applied.

The adapter returns the existing StockSnapshot to StockSync. Existing transactions,
worker lock, retries, warehouse binding, stock_sources, stock_source_items,
inventory_balances and asaya_stock_limit remain the shared cache/read model for
Admin and storefront. No order/shipment creation, price import, YCP change,
publication update or test-stock update is introduced.

All pages must succeed and totals/page counts must agree; repeated IDs/articles,
invalid counts/states, physical inventory without an article, malformed/oversized
responses fail closed. Shop is explicitly scoped. No HTTP redirect is followed.
At most 100 pages / 10,000 records, 2 MiB per page, 30 seconds for the whole read.
Only fixed official GET endpoint is used. Basic credentials are private and omitted
from settings returned by the adapter, diagnostics and source fingerprints.

## Freshness and local stock protection

`inventoryUpdated` is the product's last stock mutation, not the age of this live
observation: an unchanged stock can validly have a September 18 mutation timestamp.
The live snapshot timestamp is the beginning of the successful complete request.
HTTP Date must be within 60 seconds of the local clock and Age must be absent/zero;
requests send no-cache/no-store. A stale response cannot refresh the cache.

Defaults: poll=300 seconds, maxAge=900 seconds. Existing cache expires at the earlier
of observation+maxAge or fetch+3*poll. Failed reads retain last successful quantities
for diagnostics but mark the source unhealthy, so they cannot enable purchases.
401/403 produce sanitized STOCK_SOURCE_UNAUTHORIZED; 429 respects Retry-After.

Per-item last-mutation timestamp also preserves existing local dispatch deductions:
a new HTTP observation of unchanged provider inventory must not replenish locally
consumed stock. Reservations are preserved by the existing synchronization layer.
Multiple pages are not represented as a provider-guaranteed atomic DB snapshot;
page consistency checks and conservative timestamps bound this limitation.

## Future rollout — NOT performed

Migration `036_stock_api_source.sql` adds stock_sources.source_kind, defaults existing
rows to cdek_ff_yml, and changes no quantities/publication flags. API/Admin product
responses distinguish cdek_ff_api. Admin client accepts both source kinds.

Existing CDEK_STOCK_SETTINGS_FILE secret mount is reused. Private file must contain:
```json
{"kind":"cdek_ff_api","warehouseId":"18d1c0ba-86e3-46c9-8a08-ad555326bc62",
"accountId":"asaya","externalWarehouseId":"23401","shopId":220216,
"environment":"production","login":"<FF cabinet login>","password":"<FF cabinet password>",
"pollSeconds":300,"maxAgeSeconds":900}
```
Actual credentials must be supplied only in the protected secret file at rollout.
`preflight-stock-production` now supports this API without writing to the database.
Source hash mismatch still requires explicit review; switching an existing recorded
YML source is not silently authorized. The previous production diagnostic had no
stock_sources row; recheck that in preflight before eventual enablement.

No production migration, worker enablement or deploy in this task. Thus live API
access is verified, but production Admin/storefront updated quantities are NOT claimed.

## Validation

- Backend TypeScript build: passed.
- API adapter + existing stock integration tests: 29/29, isolated local PostgreSQL.
- Admin/stock client tests: 7/7; API source kind accepted, unknown kinds rejected.
- Frontend typecheck and Next webpack production build: passed (62 static pages).
- Real read-only adapter probe: HTTP 200, 13 articles, full one-page response.
- Production SKU SELECT: 13/13 exact matches. No production stock/config writes.
