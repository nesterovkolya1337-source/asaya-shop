# Task 9 — storefront/service review and administrator tools

Authority: specification v10.1. Design reference: owner's authorized copy
`4w8Dr2nHxdoxu6uOGmAtYR`, Page 2, with matching hero/PDP nodes. The owner confirmed
this is the same design. Specification text/architecture takes precedence.

## Changes

- Product list includes thumbnail, SKU, category/status and category filtering.
- Size is a positive bounded number plus `ml`, `g` or `pcs`; old display text
  remains compatible until edited. Publication uses the canonical saved content.
- Removal requires explicit confirmation, matching SKU and editor revision.
  Published/imported/referenced products are archived, retaining historical order
  snapshots, stock and integration references. Only unused unpublished drafts can
  be physically removed. Concurrent stale edits fail closed; actions are audited.
- Orders show Yandex/CDEK identifiers, last raw delivery status, update time and
  retry/error diagnostics without provider credentials or full payloads.
- Manual refresh performs GET of an already bound CDEK shipment, with staff,
  Origin/CSRF, account/environment and cooldown checks. It cannot create a shipment.
- WMS assembly/packing/dispatch controls were removed from the administrator UI.
  Yandex remains responsible for creating the delivery. Known binding is required
  before CDEK diagnostics can refresh an order.
- Next API rewrites include removal, privacy and CDEK refresh routes. Container
  packaging now includes fixtures and the guarded local test-shop HTML needed by
  the complete isolated test suite; the normal API does not serve that test shop.

## Coverage reviewed

| Requirements | Evidence and scope |
| --- | --- |
| SITE-01–03 | Existing privacy redirect, menu exclusions and authenticated order route retained. |
| SITE-04–08 | Existing v10.1 delivery/1000 RUB, 11 FAQ answers, return and support defaults retained. Legal text regression is part of the full backend suite. |
| UI-01–02 | Frozen header retained; Figma hero 148:1237 matches original image, ratio 1159/594.9448 and desktop crop 50% 24.6235%. |
| UI-03 | Figma PDP 150:1645/1646 reviewed; desktop media/info lower edges equal, mobile vertical, contained undistorted image. |
| UI-04–06 | Shared cards and separate inner actions retained; rail arrows/swipe and category crops retained. Browser favorite action does not navigate. No separate redesign of the approved category layout. |
| UI-07–09 | Removed old home/PDP blocks remain absent, one category section, updated brand block, compact sensory block, raised purchase bar and lighter footer retained. |
| ADMIN-01–03 | Implemented in this change; validation, history preservation and browser save/publish/confirmation checks. |
| ADMIN-04 | Existing cropper verified at desktop/mobile: independent metadata, scoped reset, original preserved, saving required before publication. |
| ADMIN-05–06 | Implemented diagnostics and GET refresh; unauthorized/cross-account requests rejected, no FF order or shipment creation. |
| ADMIN-07 | Task 8 bounded privacy operation retained. It is selective contact cleanup, not complete account erasure. |

## Validation

- TypeScript and targeted ESLint passed.
- 38 distinct focused backend tests passed locally; 24 distinct client tests passed.
- Browser fixtures at 1440 and 390 px: homepage/PDP geometry, FAQ, favorites,
  canonical size save/publication, cancellation of destructive confirmation,
  diagnostics refresh and no WMS actions; no page errors or horizontal overflow.
- Separate cropper browser checks passed at both widths. Screenshots reviewed.
- Four release-helper guard tests passed (migration checksums, pre/post migration
  ledgers, integration flags and private-vs-public health routing).
- Full container tests run with a disposable PostgreSQL instance on an internal
  Docker network, no production volumes/credentials and no external provider calls.
  Initial packaging omitted test-shop HTML; the corrected image reruns all tests.

## Publication scope chosen by the owner

The September 17 production inspection found migration ledger 001–019, 25 imported
products, 0 published products, 0 approved prices and 0 orders. All existing SQL
checksums match canonical source. Switching the public frontend to the backend
catalog now would display an empty catalog. The owner explicitly chose to publish
**API and administrator interface first, preserve the current public storefront,
then prepare canonical products and switch the storefront separately**.

The release applies additive migrations 020–026 only after a verified private
database/configuration backup and successful isolated tests. Existing product,
price, order, user, warehouse and CMS record counts are compared before/after.
Public web/Caddy/database containers and credential/configuration hashes remain
unchanged. Candidate checks precede service switching; previous API/admin images
remain available for rollback without dropping data or additive schema.

This release does not enable SMS, stock synchronization, CDEK tracking, checkout
or legacy FF dispatch. Live SMS and Yandex→CDEK correlation remain separate release
work. The public storefront's new visuals and legal defaults are not claimed
published by the API/admin-only release. Task 10 is not started.

Final deployment evidence is recorded separately in the workspace release report;
do not infer production success from this source-code report alone.
