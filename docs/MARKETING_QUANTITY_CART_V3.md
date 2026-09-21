# Marketing settings / quantity cart v3

Scope: Admin marketing, quantity pricing, cart progress. GitHub only; no deploy.

## Storage and permissions

Migration `034_marketing.sql` creates one configuration row with separate `defaults`,
`draft`, `live`, plus an optimistic-lock revision. Initial values: 5% at two eligible
units, 10% at three or more, free standard CDEK pickup threshold 100000 minor RUB.
Migration does not alter product prices, publication, stock or orders.

Admin → Маркетинг: Managers save/publish current settings. Only active Owners and
Administrators can replace the default preset, with explicit confirmation. Default
changes leave both draft and live untouched. Save leaves live untouched; Publish
copies the saved draft. Reset fills the editor from defaults; Save persists it.
Nondefault warnings show before save/publish, including current/default/live values.
API checks roles, same origin, CSRF, revision and records mutations in audit_log.

## Authoritative pricing

`backend/src/cart-pricing.ts` counts quantities, not lines. Published canonical
`content.category=sets`, `setKind=combo/gift`, or product_components exclude a product
from both threshold and discount. Names and unpublished draft classifications do
not influence eligibility. Discount is applied on product_prices.final_minor.

Correction: discounted unit prices are rounded once to the nearest **kopeck**.
79900 minor RUB less 10% = 71910 minor RUB; three units total 215730 minor RUB.
Cart and redirect use that same unit value. Redirect serializes unitMinor/100 as a
JSON number (719.1 and 719.10 represent the same amount). No product price is rewritten.

Contract verification on 2026-09-21:
- https://yandex.ru/support/merchants/ru/buy-button-site — redirect price/final_price are floating-point numbers.
- https://yandex.ru/support/merchants-ru-ycp/ru/openapi/checkoutbasketcheck-post — final_price/regular_price still documented as integer.
- https://yandex.ru/support/merchants-ru-ycp/ru/openapi/checkout-post — item final_price/regular_price still documented as integer.

The redirect builder already supported fractional rubles and has no `.int()` price
validator. The `.int()` in ycp-checkout.ts belongs to the **incoming create-session
contract**, not redirect data; it is unchanged, as are basket/check representation
guards. Therefore fractional-price redirect is supported, but a complete fractional
YCP session is still blocked by these distinct contracts. No silent whole-ruble
fallback or different price is used. Confirmation from Yandex is needed before
widening these server contracts. This is not a verified end-to-end payment flow.

The same server calculation is used by public POST `/api/store/v1/cart/pricing`,
custom-site checkout-link, authenticated YCP basket/check and checkout creation
(including immutable order item amounts). Config changes are rechecked before
redirect; changed quotes require buyer review. Frontend formats server amounts and
progress, never calculates the discount. Quote responses are no-store; stale client
requests are aborted/ignored. Empty/unavailable cart lines do not earn discounts.

## Delivery boundary

The live configurable threshold controls the cart progress, based on the discounted
subtotal. Existing Yandex-owned CDEK delivery pricing remains authoritative.
This task does **not** write the Yandex merchant delivery settings or override the
delivery amount supplied by Yandex. If the threshold is changed, the same value must
be set in Yandex's delivery settings; Admin explicitly explains this boundary.
There is no newly invented tariff API or duplicate shipment creation.

## Validation

Backend build and targeted marketing, yandex-feed, ycp and ycp-checkout tests on
disposable local PostgreSQL. Covers sale stacking, 1/2/3 units and reverse changes,
same SKU, canonical sets, rounding, draft/live/default isolation, permissions,
revision conflicts, canonical checkout/order totals, unchanged product prices and
no shipments. Existing real-stock/test-stock separation tests retained.

Frontend typecheck and production webpack build. `tests/marketing.browser.cjs` runs
local HTTP fixtures at 1440 and 390 px: nondefault warning, save/publish isolation,
default confirmation/isolation, manager UI, cart progress transitions, no overflow
or browser errors. These fixtures do not send SMS, payments, provider calls or orders.

Customer Account, Product Editor/PDP, stock/test-stock implementation, product
publication state, YCP/CDEK architecture and production are unchanged.
