# CDEK FF stock: production diagnosis, no deployment

## Confirmed causes

API revision 73384e046a7efbd27c77d58b579078abeafd6c71 contains StockSync, but its container has no CDEK_STOCK_SETTINGS_FILE and no mounted stock settings file. server.ts consequently constructs no stock service and starts no stock worker. The configured warehouse binding is pending; stock_sources has no row for it. No successful production synchronization has occurred. This is missing runtime wiring, not rejected CDEK API credentials.

Separately, a diagnostic GET from the production API container to the previously approved private feed returned HTTP 200, text/xml, 3055 bytes, but its yml_catalog date was 2026-09-18T19:05:00Z (22:05 Moscow). On September 21 it was over 65 hours old, exceeding the saved maxAgeSeconds=1800. Enabling the worker alone would therefore produce STOCK_SOURCE_STALE. Freshness validation must not be removed or the date replaced with fetch time.

## Actual source and identity

Source: GET https://static.integrations.ffcdek.ru/export_products/yml/[private-token].xml.
Implementation: CdekStockFeed.read / parseStockFeed -> StockSync.refresh/apply -> stock_sources + stock_source_items + inventory_balances. This source uses the private export URL, not a CDEK delivery OAuth client or shipment endpoint. HTTP 200 validates access to that URL only, not separate unused API credentials.

Saved configuration: environment=production; accountId=asaya; externalWarehouseId=23401; warehouseId=18d1c0ba-86e3-46c9-8a08-ad555326bc62. The matching active canonical warehouse has code cdek-ff-23401. Its provider/account/external ID binding matches exactly. YML does not independently identify the warehouse; its warehouse selection belongs to the provider export configuration and must remain the approved single-warehouse selection.

13/13 offer IDs and article parameters match canonical SKU exactly. Examples in this STALE response:

| CDEK offer ID / article | Canonical SKU | count |
| --- | --- | --- |
| 1S-BA-02-02 | 1S-BA-02-02 | 24 |
| 1S-BA-02-03 | 1S-BA-02-03 | 24 |
| 1S-HK-01 | 1S-HK-01 | 0 |

There are no counts 40 or 32 in this response. These are not claimed as today's physical stock. Twelve of the 25 canonical products are absent from the feed; no mappings or quantities were invented.

## Admin fallback

AdminStocks with the actual runtime stock=undefined returns configured:false, source:null, items:[]; refresh returns STOCK_NOT_CONFIGURED. The public Admin stock URL redirects with 308 and reaches authentication (401 UNAUTHENTICATED without a staff cookie), so the route is present. With the saved configuration supplied to a read-only StockState probe, DB status is never_synced and all quantities are unknown.

The exact displayed "Не удалось получить текущее состояние..." is the generic catch after the Admin refresh's follow-up GET fails, not proof of stale provider data being stored. A real database outage was confirmed and recovered earlier the same day; that can fail this GET too. This diagnosis did not impersonate a staff session and does not assert the historical authenticated HTTP response without evidence. The objective current state is no configured worker/no stock snapshot, plus stale provider export.

## Minimal prepared correction

- deploy/catalog/compose.stock.yaml: optional API-only environment + read-only file mount; no image tags, database volumes, workers for shipments or other services changed. Missing host file fails rather than creating a directory.
- backend/scripts/preflight-stock-production.ts: read-only preflight using the existing parser, scope binding, source hash, freshness and exact SKU checks. Prints HTTP status and sanitized examples; does not expose the private URL or write stock.

Not applied. To finish after separate deployment approval: first obtain a fresh generation at the approved CDEK FF export (or a replacement approved export URL), prepare the protected stock settings file, pass the preflight using the production environment, then merge the optional override into the exact running compose and recreate only API. Do not use repository default image tags to replace production. Use the normal worker; never copy diagnostic counts manually.

## Remaining acceptance

Production live quantities and Admin/storefront live synchronization are NOT achieved by this read-only task and cannot be claimed before fresh provider data and runtime activation. Existing REAL stock consumer and publication/test-stock isolation remain unchanged. No YCP, shipment, price, publication or manual stock changes; no migration; no deploy.

Validation: backend TypeScript build passed; stock-source suite 23/23; stock client parser/refresh tests 2/2. Stock fixture now fixes quantity discounts at zero only in its disposable DB, so price assertions do not depend on unrelated marketing defaults. No runtime marketing change. Temporary diagnostic files containing the private source URL were removed after the read-only probe.

