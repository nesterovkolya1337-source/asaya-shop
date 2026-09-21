# Loyalty Core v2 — partial implementation, not release-ready

No production deployment. Migration: `035_loyalty_core.sql`.

## Implemented

- Marketing defaults/draft/live: cashback 3%, maximum redemption 20%. Existing staff permissions, warnings, restore and Save != Publish apply. Older marketing clients preserve loyalty settings when omitted.
- Append-only customer ledger with unique event keys and immutable order snapshots. Order snapshots freeze goods amount and loyalty percentages at creation; delivery is excluded. No historical order backfill.
- Confirmed online YCP placement/payment credits once inside the existing transaction. Pending, unpaid or cancelled orders do not earn. Customer identity remains governed by the existing verified-phone account rules; receipt of contact data does not grant login.
- Whole points: 1 point = 1 RUB; cashback floors to whole points. 1000 RUB paid for goods earns 30; 800 RUB earns 24. Calculator caps redemption at floor(goods * 20%) and available balance. Quantity-discount whole-ruble pricing is unchanged.
- Customer Bonuses view and authenticated balance/history API; public order numbers, no internal customer/order UUIDs in history. Cart displays authenticated balance and theoretical maximum, without enabling redemption.
- Internal confirmed-refund reconciliation: requires explicit refunded goods amount, excludes delivery, proportionally reverses cashback and restores historical spent points; full refund restores rounding remainder. Repeat refund IDs are idempotent; changed allocation conflicts. If earned points were spent, reversal is capped at balance, shortage is recorded as `review`, without negative balance or future automatic collection.

## Incomplete: checkout redemption

The server can calculate the authorized discount. That is distinct from preserving it across YCP callbacks. Current `YandexFeed.checkoutLink` sends canonical SKU, quantity, price and final_price. `YcpCatalog.basket` subsequently recomputes final_price from SKU/quantity without an ASAYA customer or quote reference. `YcpCheckout.create` also recomputes and rejects a different final_price with INVENTORY_CHANGED. Merely lowering redirect final_price therefore does not implement a working checkout.

Official published basket/check input has items{id,quantity}, locality, is_health_check, offers_id_from_merchant_center; it has no per-customer price or ASAYA quote reference. POST /checkout includes Yandex session_id and customer contact, but cannot identify the originating authenticated ASAYA quote safely. Incoming price is not authority: redirect data can be edited and the same SKU/quantity occurs for different customers. We have not matched by phone, price fingerprint or globally discounted SKU, and have not invented dynamic SKU aliases.

References checked:
- https://yandex.ru/support/merchants/ru/buy-button-site
- https://yandex.ru/support/merchants-ru-ycp/ru/openapi/checkoutbasketcheck-post
- https://yandex.ru/support/merchants-ru-ycp/ru/openapi/checkout-post

Required to finish: a documented way to preserve an authorized personal server quote through this flow, or confirmation that Yandex preserves redirect personal prices independently of basket/check price reconciliation together with an authenticated order-to-redemption correlation mechanism. No requirement that Yandex calculate bonuses.

Consequently redemption selection, reservation/debit, redirect discount and end-to-end redemption tests are NOT implemented. `redemptionAvailable` remains false; order snapshots currently record zero redeemed points. Pure calculator/historical refund tests are not end-to-end checkout evidence.

## Incomplete: automatic financial refunds

`Loyalty.refund` only accepts a succeeded refund already recorded in the financial database plus its explicit goods allocation. It has no new public endpoint. The existing application has no verified automatic ingestion of confirmed refund amounts with goods/delivery allocation to wire it to. CDEK returned/delivered status is not a financial refund. Automatic provider-triggered refund reconciliation is not claimed complete.

## Validation

- Backend TypeScript build and Next webpack production build.
- Relevant loyalty, marketing and YCP checkout tests, including concurrent/repeated payment events, immutable records, settings snapshots, allocation conflicts, capped reversal and proportional historical redemption restoration.
- Local fixture-browser checks at 1440 and 390 px: balance/history/public order number; no overflow or JS errors. Existing marketing Admin draft/publish/default/manager and cart smoke passed.
- No live SMS, payment, CDEK request or production migration. No stock, canonical product price, product publication or PDP changes.

This commit is an independently tested foundation, NOT completion of every requirement in Loyalty Core v2. Do not deploy it as completed redemption support.
