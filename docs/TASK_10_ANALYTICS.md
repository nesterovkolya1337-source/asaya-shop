# Task 10 — ASAYA analytics

Authority: v10.1, AN-01–AN-07. Prices remain under administrator control,
as confirmed by the owner on 17 September 2026. This task changes reporting
and anonymous event collection, not catalog prices or integration activation.

## Coverage and entry points

| Requirement | Implementation / evidence |
| --- | --- |
| AN-01 | Admin → Analytics: entire store / products, 7/30/90 days or custom 1–366 days, product name/SKU search, category, three CSV exports. |
| AN-02 | Paid goods revenue, paid/all orders, AOV without delivery, paid units, cancellations, returned/refused units, confirmed refunds, daily chart and top products by revenue/units/orders. |
| AN-03 | Per-SKU impressions, PDP views, clicks/CTR, cart additions/rate, checkout starts, orders/paid orders, units/revenue, view-to-paid ratio, cancellations/returns, average sold unit price. |
| AN-04 | IntersectionObserver ≥50% continuously for ≥1 second. Visibility loss, hidden tab and unmount reset the timer. One event per SKU/type/session. |
| AN-05 | Frontend events plus transactional database events for order_created, order_paid, order_cancelled and refund_completed. |
| AN-06 | Strict anonymous payload; no contact, address, payment identifiers, cookies, referrer or IP in internal product analytics. Backend log test and browser payload assertions. |
| AN-07 | ASAYA order/refund records are sales truth. Unique events, transaction rollback, concurrent replay, browser refresh, filtered fixtures and CSV reconciliation. Metrika remains supplementary. |

- New public collector: `POST /api/store/v1/analytics/events`.
- New staff-only report: `GET /api/admin/v1/analytics` (no-store).
- Previous `/statistics` API is retained for existing consumers.
- UI: `src/components/admin-analytics.tsx`; report contract/export:
  `src/lib/analytics-client.ts`, `analytics-export.ts`.
- Collection: `src/lib/product-analytics.ts`,
  `src/components/product-analytics.tsx`; wired to product cards, cart changes
  and successful Yandex checkout redirects.
- Server: `backend/src/analytics-report.ts`, `product-analytics.ts`, routes in
  `app.ts`; migration `027_product_analytics.sql`.

## Definitions and limits shown in the report

The sales report is an **order-created cohort**, matching the previous ASAYA
report: select orders by their creation dates in Europe/Moscow, and report their
latest confirmed states. It is not a cash-flow statement by payment date.
Historical reports can legitimately change after a late payment or refund.
Each response is read in one repeatable-read, read-only transaction.

Paid sales are the gross paid line amounts before refunds, excluding delivery;
units are paid line quantities. AOV = paid goods revenue / distinct paid orders.
Average product price = paid line amount / paid units. Money is stored/calculated
in integer kopecks; averages round only at the final kopeck. A product/category
filter selects matching lines; an order containing several selected lines counts
once in the summary, while each SKU has its own order count.

Returned/refused quantities come from completion/returned-delivery line facts,
not from a pre-dispatch cancellation. Monetary refunds require a succeeded record
in `refunds`. They are independent facts. A fully refunded whole order permits
an exact goods-line allocation; a partial refund without line allocation does not.
In that case the goods refund amount is `null` / “Нет данных”, never a fabricated
proportional amount or zero. Confirmed whole-order refunds are also shown
separately and may include delivery. In product-filtered reports that separate
figure still refers to the selected **whole orders**, explicitly labelled.
A refunded state with no amount ledger is reported as an unknown amount.

Existing YCP partial-delivery handling records refused quantities and a review
issue, not a proven financial refund. Task 10 does not invent a refund callback,
line-item allocation, acquiring operation or CloudKassir payment source. Complete
monetary return reporting depends on real confirmed refund facts being available.

Frontend counts are unique SKU/type events per random 30-minute browser-tab
session. CTR = card clicks / qualifying impressions; cart rate = additions / PDP
views; PDP-to-paid = paid orders / PDP views for the selected period. These are
aggregate ratios, not person-level attribution; they can exceed 100% (e.g. direct
purchases, unavailable consent-based views). A zero denominator displays “—”.
Frontend history cannot be reconstructed; first received-event time is displayed.

## Privacy, retries and integrity

Collection starts only with analytics consent. Withdrawal clears the anonymous
queue. Admin/account/checkout/order-status routes, editor frames, preview and demo
pages do not collect events. Visiting an excluded page does not reset the session
and inflate subsequent public-page views. The initial unknown hydration snapshot
does not erase an existing consented session.

The outbox persists UUIDs in sessionStorage and retries the same IDs on the next
action/page. Collector uniqueness also enforces session/type/SKU deduplication.
Cart hydration is not an addition; a rejected Yandex redirect is not a checkout
start. Tracking failures do not block shopping. Cookies and referrer are omitted
from collector requests. The server accepts only typed events and derives product
names/categories from canonical published data; browser order/payment events and
arbitrary fields are rejected. Body limit 8 KB, ≤20 events/request, ≤500/session.
This is first-party behavioral telemetry, not an anti-fraud counting guarantee.

Backend logging contains route, status, duration and generated request ID, not
payload/session/IP. `deploy/Caddyfile` adds collector access-log suppression;
that proxy change must accompany eventual deployment. No customer/contact fields
are selected by the analytics report or exported. CSV protects formula-like
product names, preserves SKU leading zeros and distinguishes unknown from zero.

## Migration and release boundary

027 creates two analytics tables, indexes and transactional event triggers, plus
a nullable category snapshot on order_items. It does not delete or rewrite
existing order values, prices, stock, customers, identities or integration data.
New lines snapshot their current published category; old lines stay unknown.
Existing order states/payment-history facts and succeeded refunds are backfilled
with `historical=true`; incomplete historical timestamps are not presented as
precise historical payment timing. Product analytics retain SKU/name/category
snapshots after catalog changes or permitted product deletion.

Migration tested only in disposable local PostgreSQL. **Not applied in production.**
Future publication needs the separately approved backup/migration/release step:
backup and inspect the ledger, apply 027 before starting the new API, then the UI
and proxy config. Runtime rollback can retain the additive analytics schema/data;
do not drop tables or old orders as rollback. No background deletion was added.

## Validation

- Full backend regression: 250/250 passed, including YCP/payment/stock/account.
- Focused analytics: 7/7 passed; migration preserves legacy order values, paid
  history and unknown categories; concurrent events and transaction rollback;
  privacy in storage, payloads, access control and application logs.
- Client suite: 80/80 passed; consent, storage failures, outbox retry/session
  expiry, visibility timing, filter transport, CSV and report validation.
- Production frontend build / TypeScript and targeted ESLint passed.
- Browser checks passed at 1440 and 390 px: store/product modes, category/search
  and custom dates, sorting, actual CSV download, no page overflow or page errors.
  Real rendered cards produced qualifying impressions, clicks, PDP views, cart
  additions and one checkout start after a mocked valid redirect. Rejected
  redirects produced no start event. Reload and account-page round trips did not
  duplicate views; private pages emitted nothing. Browser requests used synthetic
  data; all external services were intercepted/blocked. Screenshots were reviewed.
- Reconciliation fixture: five orders, three paid, eight paid units, 140,000
  kopecks goods revenue (delivery excluded), one cancellation, three returned/
  refused units, 66,000 kopecks confirmed order refunds; partial goods allocation
  remains unknown. Per-SKU goods totals 50,000 + 90,000 match the store/daily total.

No real payments, SMS or provider orders were sent. Task 10 is not deployed;
Task 11 (full requirement reconciliation) requires the next owner instruction.
