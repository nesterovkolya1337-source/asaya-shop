# Task 4 — Cart → Yandex Checkout

Authority: ASAYA v10.1, Task 4, YCP-01 / YCP-02 / YCP-03. Local implementation and verification only; no production publication.

## Buyer behavior

- Backend storefront cart uses the guest Yandex checkout action. No ASAYA sign-in, address form or local payment page is required.
- Product page and sticky “Купить сейчас” use the same protected redirect request. The normal cart link goes to `/cart/`.
- Old `/checkout/` bookmarks show the same cart; the former server checkout form is no longer reachable from this route, including when the old test-checkout flag is enabled.
- Disabled Yandex configuration never falls back to a test order. Errors preserve the cart; the cart offers an explicit price/availability refresh. Optional analytics failure cannot prevent navigation.
- The explicit `NEXT_PUBLIC_CATALOG_SOURCE=demo` preview remains a separate simulated UI, not a production purchase path.

## Official contract and existing backend verified

Official custom-site instruction checked 2026-09-17:
https://yandex.ru/support/merchants/ru/buy-button-site

Destination is `https://checkout.kit.yandex.ru/express`, with configured merchant hostname and Base64 UTF-8 JSON `items[{id,quantity,price,final_price}]`. Prices in this redirect are rubles. No customer PII, credentials or invented correlation parameters are included. Optional Metrika client parameters are not required for checkout.

`POST /api/store/v1/yandex/checkout-link` accepts only SKU and integer quantity, requires same origin and UUID Idempotency-Key, and does not require a customer session. Backend resolves approved catalog, published content, exact scoped offer IDs, prices, dimensions and current warehouse availability. No DOM price is trusted. Unavailable/unknown products, excessive quantity, duplicate SKU or additional fields are rejected.

Before returning the URL, `YandexFeed.checkoutLink` commits a `yandex_checkout_attempts` row: UUID, account/environment, unique idempotency key, request/cart snapshots, redirect, creation and expiry timestamps. Concurrent retries reuse one row; changed/expired retries conflict. Persistence failure returns no redirect. This is a technical attempt, not a paid customer order and not an inventory reservation.

The official express redirect contract does not document a round-trip merchant attempt ID. Consequently a local attempt is **not** falsely linked to a later order by matching cart contents, phone or timestamps. Its UUID/idempotency key identifies the redirect operation. The YCP-created session is independently correlated to the internal draft using `(account_id, environment, session_id)` in `ycp_sessions`; final placement is the separate Task 5. A guaranteed attempt→final-order link remains unavailable through the documented express parameters and must not be claimed in reporting.

Existing authenticated `/api/v1` methods were exercised: GET `/warehouses`, POST `/checkout/basket/check`, POST `/checkout` (201, transactional draft/reservation), `/checkout/placed`, `/checkout/cancel`, GET `/order`, `/order/cancel`, `/order/delivered`. `/api/ycp/v1` remains a compatibility alias. Route/schema comparison used the official OpenAPI previously saved as `work/ycp-openapi-20260908.json` (server prefix `/api/v1`); individual legacy YCP documentation URLs could not be refreshed by the web reader during this task. No unsupported delivery endpoints were invented. Delivery remains the Yandex-connected CDEK service. ASAYA does not create shipments or fulfillment orders.

## Verification

- Backend compilation passed.
- 26 backend tests passed: `yandex-feed`, `ycp-checkout`, `ycp-production-flow`; isolated temporary local databases only. Covers tampering, configuration/auth, persistence failure, retry conflicts, last-unit races, cancellation and existing lifecycle regression.
- 5 frontend tests passed: `tests/yandex-checkout.test.mjs`; optional analytics throw/reject/missing callback, official destination validation, whole-cart payload, error/cart retention and idempotent retries.
- TypeScript and production Next.js build passed with backend catalog and Yandex button enabled locally.
- `tests/browser/yandex-checkout.cjs`: headless Chrome, widths 1440 and 390. Guest cart sends both SKUs/quantities; 409/503 preserve cart; double click creates one request; old checkout route contains no form; zero stock/catalog failure block checkout; sticky product action works at both widths; no page errors or horizontal overflow.
- Browser calls are intercepted: synthetic catalog and checkout-link responses, official external redirect fulfilled locally, all other external traffic blocked. This verifies the site transition, not the live Yandex payment screen or a real purchase.

Browser reproduction: build with `NEXT_PUBLIC_CATALOG_SOURCE=backend`, `NEXT_PUBLIC_YANDEX_BUTTON=true`; start local Next on 127.0.0.1:3340; run `node tests/browser/yandex-checkout.cjs`. Provide `PLAYWRIGHT_MODULE` if Playwright is not on the module path, and optionally `ASAYA_BROWSER_OUTPUT` for report/screenshots. Chrome must be installed. Script rejects a non-loopback preview URL.

## Release boundary

No new migrations, no production configuration changes, no real SMS/payment/order/shipment. Task 3's stock migration and server-rendered storefront deployment remain dependencies for the later deployment plan. Both frontend button flag and backend approved YCP settings must be enabled deliberately in that plan, after the remaining tasks. A real provider E2E remains Task 14, not represented as completed here.
