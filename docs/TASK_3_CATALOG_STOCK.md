# Task 3 — canonical catalog and real warehouse availability

Historical v10.1 report. For the September 17 follow-up stock implementation,
current diagnostics and the officially documented 30-minute export cadence,
see [Packet 01](PACKET_01_STOCK_SOURCE_SYNC.md). Its stock policy supersedes the
timing observations below. Production activation remains a separate operation.

Authority: ASAYA v10.1, CAT-01/CAT-02 and STOCK-01/STOCK-02/STOCK-03.
Scope: code and isolated tests only. No live migrations, product publication,
stock writes, payment, shipment, deployment or merge to main.

## Verified source, not an invented Fulfillment endpoint

The working source is the owner's existing **CDEK Fulfillment YML stock export**:
HTTPS GET `static.integrations.ffcdek.ru/export_products/yml/<private-token>.xml`.
The full URL is a server secret. The account's saved integration configuration
identifies shop 220216 and a single warehouse 23401 / MSK2290. Its ASAYA binding
is account `asaya`, warehouse `18d1c0ba-86e3-46c9-8a08-ad555326bc62`.
This identity was supplied earlier; it is not inferred from the ordinary
CDEK delivery office response. Do not add other warehouses to this export:
the FF settings warn that multi-warehouse exports aggregate quantities.

Actual read-only checks on 17 September 2026, approximately 03:03–03:09 Moscow:

- HTTP 200; FF generation advanced from 23:35 to 23:50 to 00:05 UTC.
- 13 offers; all quantities 0; all 13 articles exactly match the original
  25-product backend import. No SKU approximation is needed.
- 12 imported product SKUs are absent from this feed and therefore unavailable.
- The live ASAYA public catalog API returned HTTP 200 with **0 published items**.
- Both the production Node reader and strict parser successfully read the real
  source. No provider data was modified.

Official FF guidance identifies YML as a supported stock synchronization source:
https://help.ffcdek.ru/knowledge/instruction/261902?category_id=68766&section_id=null
The owner's export setup instruction:
https://help.ffcdek.ru/knowledge/instruction/300580
Fulfillment API reference: https://apidoc.cdek.ru/api/fulfillment
Yandex protocol overview: https://yandex.ru/support/merchants/ru/buy-button

The separately supplied shop 217484 / warehouse 7460 account was previously
verified as a TEST account. It is not used for production stock. No FF order API
is called. Yandex remains responsible for handing the order to CDEK.

## Exact contract and refresh policy

`cdek-stock-feed.ts` reads only:

| XML | Meaning in ASAYA |
| --- | --- |
| `yml_catalog@date` | Provider generation time, with explicit timezone |
| `offer@id` | Must exactly equal `param[code=article]` |
| `param[code=article]` | Stable `products.sku` |
| `count` | Nonnegative whole stock quantity |

Names, prices, descriptions and images in the feed cannot overwrite the catalog.
Missing articles get zero availability; unknown articles are diagnosed, never
auto-created. Duplicate articles, partial/malformed XML, DTDs, missing/invalid
counts and mismatched IDs reject the entire snapshot. HTTP body limit: 2 MiB;
timeout: 10 seconds; redirects and alternative hosts are prohibited.

The optional worker polls every 60 seconds. A snapshot expires at the earlier
of provider generation + 30 minutes and last successful fetch + 3 polling
intervals. Observed generation interval was 15 minutes, not a contractual SLA.
Poll interval is constrained to 30–300 seconds, provider age to 60–3600 seconds.
A failure immediately disables selling from that source; it does not erase
physical balances, orders or reservations. Identical generations refresh
transport freshness but cannot refresh provider age or replenish consumed stock.
Regressed or contradictory generations are rejected.

The protected JSON configuration has these fields (the actual URL is omitted):

```json
{
  "warehouseId": "18d1c0ba-86e3-46c9-8a08-ad555326bc62",
  "accountId": "asaya",
  "externalWarehouseId": "23401",
  "environment": "production",
  "feedUrl": "COPY_EXISTING_PRIVATE_FF_EXPORT_URL",
  "pollSeconds": 60,
  "maxAgeSeconds": 1800
}
```

Set `CDEK_STOCK_SETTINGS_FILE` only at the separately approved deployment.
`node dist/scripts/check-stock-source.js` uses that file for a read-only diagnostic;
it has no database connection. Worker activation does not enable checkout or
warehouse fulfillment flags. Identity changes require a separate reconciliation,
not silently replacing a source by editing the configuration.

## One catalog and one availability calculation

- Canonical fields: `products` + approved `product_prices` + approved
  `storefront_mappings` + published `product_editor.content`.
- The browser no longer fills missing content from `defaultProducts`. New
  backend slugs work without adding a static card. Empty/error responses do not
  activate a demo fallback. Browser-stored overrides cannot change backend cards.
- Backend catalog is the default. `NEXT_PUBLIC_CATALOG_SOURCE=demo` is an explicit
  local visual-preview option only. Public Docker now builds/runs Next, preserving
  its port 80 contract, so newly published slugs can be served dynamically.
  The old static-only publication scripts must not be reused for this release.
- Published/integrated SKUs remain immutable. A listed FF article also protects
  the SKU. Unused, unpublished draft typos can still be corrected with audit.
- Admin stock details include provider quantity, generation/fetch/expiry times,
  available quantity and health. Provider-managed stock cannot be manually edited.
- Storefront, Yandex feed/link, YCP basket and final checkout use the same SQL
  source limit and local reservation ledger. Production ignores manual stock
  without a valid production source; manual test balances remain isolated.
- Sync is atomic and preserves active reservations. If provider quantity drops
  below reservations, sale availability is zero; ledger constraints and existing
  orders remain intact. Confirmed local dispatches newer than a snapshot are
  deducted until a provider generation after that dispatch.
- Final order creation locks product/price/balance rows. Reading a basket never
  reserves stock. Eight competing ASAYA checkouts for one unit yield one order.

This is a timestamped external cache, not an atomic reservation in all third-party
sales channels. It cannot guarantee instantaneous protection against sales made
outside ASAYA during the provider's export interval. Local concurrency protection
and fail-closed freshness were tested; no cross-channel guarantee is claimed.

## Migration and release dependencies

`024_stock_sources.sql` adds `stock_sources`, `stock_source_items` and the shared
stock-limit function. It does not update existing rows or enable anything.
It was applied **only to disposable local test databases**. Production migration,
backup and activation remain separate approved work, alongside the pending
020–023 reconciliation. Do not deploy the new query code without migration 024.
Do not roll back or drop reservation tables to disable the worker.

Before a real sale: publish/verify canonical product content, approved prices,
dimensions and exact SKU mapping; receive positive real stock; verify the warehouse
and complete Tasks 4 onward. Historical avocado/kiwi and yogurt/marshmallow
mapping guesses were not approved or published by this task. A catalog switch
with the current empty production API would show no products, so it must not be
deployed blindly. Docker image runtime/network/resource checks belong to Task 12;
the Next production build and runtime were verified locally.

## Verification

- Backend TypeScript compilation; production Next build.
- 9 focused stock tests: strict parser/transport, canonical production projection,
  zero/insufficient/available quantities, eight-way last-unit race, reservation
  underflow, cache failure/expiry/replay, exact/missing SKU handling, consumed-unit
  replay, Yandex feed/link consistency and transaction rollback.
- Regression groups: 11 admin tests, 12 Yandex feed tests, 3 production-mode YCP
  flow tests, 11 YCP checkout tests and 6 YCP basket/configuration tests passed.
- 10 frontend catalog/admin/media tests passed.
- Browser at 1440 and 390 px: a new backend-only slug returns 200 and displays
  server name/price; local overrides ignored; error/empty states fail closed;
  no horizontal overflow or page exceptions.
- Real provider read: 13 exact articles / 0 positive quantities; read-only public
  ASAYA catalog check: 0 published items. No paid or shipping operations.

Task 4 (real cart transition) has not been started. Task 3's implementation is
prepared for review; production remains unchanged and not ready for live sales.
