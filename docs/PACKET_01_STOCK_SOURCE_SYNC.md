# Packet 01 — CDEK Fulfillment stock source and synchronization

Authority: `01_Backend_CDEK_Stock_Source_and_Sync.docx` and the new packet's
`00_Index_and_Closed_Decisions.docx`, September 17, 2026. Only stock is in scope.
Base commit: `74efe9969bcb013086a4161ccbc752834db5cad2`, branch `codex/v10`.
No storefront/admin UI, YCP contract, shipment creation or production change.

## Verified source and contract

Use the existing single-warehouse CDEK Fulfillment YML integration. This is a
documented provider stock export, not an invented Delivery Orders API endpoint.
Public official source documentation, read in full on September 17:

- https://help.ffcdek.ru/knowledge/instruction/261827 — YML/CML stock exports.
- https://help.ffcdek.ru/knowledge/instruction/261902 — stock synchronization via YML.

The help portal renders client-side. Its own public JavaScript uses GET
`/api/knowledge/instruction/{id}`; those public article responses were read when
the HTML reader returned only an application shell. No provider settings changed.

The official stock article specifies article/SKU matching and a **30-minute
generation interval**. Selecting several warehouses aggregates stock in YML;
therefore keep this export bound to its existing single warehouse, MSK2290,
external ID 23401, shop 220216. Earlier observed 15-minute generations are not a
guaranteed interval. The separate test warehouse 7460 remains forbidden for
production stock. No separate published GET quota was found in these articles.

The private URL is supplied through `CDEK_STOCK_SETTINGS_FILE` and is not copied
into Git, application logs or returned state. The allowed HTTPS host/path is
`static.integrations.ffcdek.ru/export_products/yml/<private-token>.xml`.

Observed exact fields:

| Provider field | Interpretation |
| --- | --- |
| `yml_catalog@date` | Source generation time, with explicit timezone |
| `offer@id` and `param[code=article]` | Must agree exactly; match canonical SKU |
| `count` | Reported nonnegative integer quantity |

The export does not provide separate available/reserved fields. Do not relabel
local ASAYA reservations as CDEK reservations, or claim `count` is a documented
breakdown of physical versus free stock. Prices, names and images are ignored.
Duplicate/invalid articles or malformed/partial XML reject the entire snapshot.

## Shared stock state

Existing tables `stock_sources` and `stock_source_items` remain the only provider
snapshot. `StockState.read()` is a shared backend reader for the following task;
it adds neither a UI endpoint nor a second cache.

- Confirmed quantity 0: `quantity: 0`, `quantityState: known`.
- SKU absent from a successful complete export: `quantity: null`, `quantityState: missing`.
- No successful source read: `quantity: null`, `quantityState: not_synced`.
- Synchronization status: `never_synced`, `fresh`, `stale`, or `error`.
- The source and every SKU carry last successful fetch/generation/expiry timestamps,
  last attempt, next eligible attempt, failure count and an allowlisted error code.
- URL, credentials, response bodies and names/contact details are not exposed.
- Source/account/environment mismatches are rejected, even for an empty catalog.
- All returned SKU values and metadata are read in one database statement.

For compatibility, the existing storage column can contain 0 when `listed=false`;
the reader treats that as missing, never as evidence of a physical zero. Existing
selling projections remain fail-closed. Their YCP wire representation belongs to
Packet 03; the new Admin → Analytics → Stocks screen belongs to Packet 02.

## Synchronization behavior

- Defaults: GET every **300 seconds**, source age limit **2400 seconds**. The age
  policy allows the documented 30-minute generation plus polling/grace. Both are
  configurable; previously explicit configuration values are not overwritten.
- Transport freshness expires after three polling intervals; provider age is
  measured from the original generation, never from a repeated download.
- A PostgreSQL session lock prevents concurrent workers/processes from fetching
  the same warehouse. Persisted `next_attempt_at` prevents immediate repeated
  fetches after a process restart or a future manual refresh request.
- Errors back off exponentially up to one hour, never below the configured poll
  interval. HTTP 429 `Retry-After` is respected (numeric/date, bounded to 30 days).
- A failed read records only safe diagnostics. The last successful snapshot,
  timestamps, order/reservation records and physical ledger values are preserved.
- First-read failure is recorded without manufacturing a successful empty snapshot.
- Same-generation recovery clears an error without replenishing consumed stock.
- Existing source-hash, regression, scope, reservation and atomic-write guards remain.

The cache is not an instantaneous reservation in other sales channels. Do not
promise immediate visibility of changes made at CDEK before its next export.

## Live source evidence, isolated local application

At **2026-09-17 16:53:20 UTC / 19:53:20 Moscow**, the real source generation was
**16:50 UTC**. All **13** returned SKUs matched values read back through
`StockState` after applying that real snapshot to a disposable local database.
All reported quantities were zero. Examples:

| SKU | CDEK export | ASAYA local verification |
| --- | ---: | ---: |
| 1S-HK-01 | 0 | 0 |
| 1S-BA-01 | 0 | 0 |
| 3D-HK-01-01 | 0 | 0 |

A local-only missing control SKU returned null/missing. The temporary database was
stopped afterwards. No production database or provider data was modified. Zero is
valid evidence of stock synchronization, not readiness for the real purchase in 07.
Workspace evidence: `outputs/task01-real-stock-check.json` (outside the repository).

## Migration and activation

New migration **028_stock_sync_diagnostics.sql** adds attempt/backoff diagnostics
and permits source metadata to be absent before the first successful read. A
constraint prevents a healthy source without a complete successful snapshot.
It does not change any quantity, order, SKU, price or previous migration checksum.
Upgrade preservation is tested against a transaction-local copy of the old table.

The migration was applied only to disposable local test databases. On production,
backup and apply it with the approved release before starting the new worker.
Keep the worker off until its protected source settings are explicitly wired.
The saved private settings currently specify 60/1800 seconds; this task does not
edit that file or activate it. At release, review and set the recommended
300/2400 seconds rather than silently carrying the older timing policy forward.
Disabling the worker preserves the last snapshot, which expires normally. Do not
roll back by dropping the stock tables or altering reservations.

## Verification and stop

Backend TypeScript build passed; **19/19 tests passed** (16 stock tests and 3
existing production-mode YCP regression tests). Stock tests cover parser/transport, unknown versus zero,
first failure, snapshot/reservation preservation, same-generation recovery,
concurrent workers, scope isolation, Retry-After/restart, migration preservation,
documented cadence, last-unit contention and existing YCP compatibility.
Existing production-mode YCP regression scenarios are tested with local fixtures,
not real payments or provider orders.

LOCAL: implementation and isolated checks only. GITHUB: deliver in `codex/v10`;
the final task report identifies the verified commit. PRODUCTION: unchanged;
no migration, worker activation, webhook registration or checkout enablement.
STOP after Packet 01. Packet 02 and later tasks require the next instruction.
