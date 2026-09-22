# FF API stock worker: ready for separately authorized deployment

This change prepares enablement; no production deploy, configuration write,
migration or worker start was performed.

## Profile and secret preparation

`deploy/catalog/stock-api.production.json` is the non-secret production profile:
shop 220216, warehouse 23401, ASAYA warehouse UUID
18d1c0ba-86e3-46c9-8a08-ad555326bc62, `kind=cdek_ff_api`, `pollSeconds=300`,
`maxAgeSeconds=900`. Basic auth uses the FF cabinet credentials, never ordinary
api.cdek.ru client credentials. Source does not fall back to YML.

`backend/scripts/prepare-stock-config.ts` generates the final secret JSON offline.
On the production Linux host, with CDEK_FF_LOGIN and CDEK_FF_PASSWORD supplied by a
protected environment/secret manager, run the built script with profile path and
output path. It creates a NEW file with mode 0600 and refuses to overwrite files.
It never connects to CDEK/DB, logs credentials or starts a worker.

Example command for the future approved release (not executed):
```sh
node backend/dist/scripts/prepare-stock-config.js deploy/catalog/stock-api.production.json /opt/asaya-catalog/secrets/cdek-stock-settings.json
```
Do not type credentials into command arguments or store them in version control.
The script expects a protected Linux directory. If preparing elsewhere, enforce
platform-native private ACLs before handling a real secret file.

## Activation sequence (requires separate deploy authorization)

1. Prepare release API and Admin from the approved commit, without changing YCP,
   CDEK shipment configuration, product prices, test mode or publication state.
2. Apply missing migration 036_stock_api_source.sql through the normal migration
   runner; check older pending migrations separately, do not blindly deploy them.
3. Install the secret file and merge deploy/catalog/compose.stock.yaml with the
   EXACT current production compose/release. Do not use old example image tags from
   the repository base compose or recreate DB/web unnecessarily.
4. Run `node dist/scripts/preflight-stock-production.js` in a one-off candidate API
   container using the production DB/env and read-only secret mount. This command
   checks live source, warehouse binding, freshness and one-way Published coverage;
   it does NOT call StockSync and does NOT write production quantities.
   Profile must be live API / production / warehouse 23401 / poll 300.
5. Only after successful preflight and authorization, recreate API with the stock
   overlay. Update Admin for explicit mapping diagnostics. Storefront and YCP
   already consume the shared stock cache and require no new stock integration.
6. Verify source syncStatus=fresh, kind=cdek_ff_api, mapped articles and quantities,
   stock expiry, and published catalog unchanged. Never enable old YML as fallback.

Source-hash mismatch is intentionally a preflight blocker requiring explicit review,
not silently reset. A deployment must not clear an existing stock history to bypass it.

## Scheduling

The API server reads CDEK_STOCK_SETTINGS_FILE at startup and constructs StockSync
with the existing cdek_ff_api adapter. After HTTP listen, runStockWorker starts an
immediate attempt, awaits completion, waits 300,000 ms and repeats. No overlapping
runs. Database advisory lock prevents concurrent worker/Admin refreshes for the
same warehouse; persistent next_attempt_at preserves backoff across restarts.
API production startup rejects an API source with pollSeconds other than 300.
SIGTERM/SIGINT abort the wait and await the worker before closing DB connections.
The existing compose restart=unless-stopped restarts the API/worker after failure.

## Coverage and failures

For each physical article returned by FF, exact canonical SKU must resolve to an
active, non-deleted product with a Published snapshot containing the same SKU,
a price row and an approved storefront mapping. Draft/unpublished/deleted or
unknown articles are skipped with a mapping warning; valid Published SKUs continue syncing.
This also applies to physical articles with zero stock.

The existing stock_sources.unknown_skus diagnostics expose mappingWarnings in Admin.
The source stays healthy. Skipped canonical products are marked unlisted with zero
REAL availability; unknown articles never create products. No product is published
or relabelled. Once the card is Published, the next fresh snapshot imports its stock
and clears its warning. Preflight reports the same warnings without blocking enablement.

Published ASAYA SKU absent in CDEK is NOT a mapping error. It stays Published,
stock_source_items.listed=false, Admin shows missing/unknown and REAL purchase
availability is zero. Existing reservations are preserved. No test stock is read
or changed by the worker.

CDEK errors/401/429/partial/malformed/stale responses fail closed, mark source
unhealthy and preserve previous values. Retry uses existing exponential backoff
(300 seconds initially, up to 3600 seconds), with Retry-After respected for 429.
Worker continues after failure; no manual Admin refresh is required for recovery.
Cache expires at min(observation+900s, fetched+3*300s), independently of worker health.
Even if the worker stops entirely, expired REAL stock cannot authorize purchase.

## Shared readers

- Admin analytics: AdminStocks -> StockState -> stock_sources/stock_source_items.
- Admin product: AdminCatalog -> inventory_balances + stock source metadata.
- Public storefront: CommerceService.catalog -> inventory_balances and
  asaya_stock_limit; existing explicitly enabled test mode stays separate.
- YCP basket/check: YcpCatalog.basket -> asaya_stock_limit and local reservations;
  it does not call CDEK, read test stock, or trust browser quantities as stock.
- YCP checkout uses the same REAL stock gate; no YCP/order/shipment architecture
  or contract changes in this task.

## Validation

38 relevant backend tests passed across stock adapter, transactional integration,
worker scheduling/shutdown and offline secret preparation. Three stock-client tests
passed, including explicit mapping diagnostics and compatibility with older responses.
Backend build, frontend typecheck and Next webpack production build passed.
All database tests used temporary local PostgreSQL; config preparation used dummy
credentials in a temporary directory. No production API/DB calls were necessary
in this preparation task. No new migration beyond the prior 036 is introduced.
