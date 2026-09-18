# Admin banner, product crop and test stock — 18 September 2026

Scope: `2026_09_18_ASAYA_Admin_Banner_Image_Cropping_Test_Stock_TZ_1.docx` only. No deployment performed.

## Changes

- Manual banner under Admin → Settings: enabled, message, optional button text/URL. Disabled by default, absent from DOM when disabled; never inferred from stock, checkout or errors. Admin mutations use staff authorization, CSRF, origin validation, optimistic revision and audit history.
- Every existing main/gallery image has a separate Crop action, including legacy `/images/` files. Crop changes remain local until Apply and product Save; Cancel discards them. Parameters are persisted in `content.imageCrops`, keyed by source URL, through the existing draft/published save path. ProductCard and PDP use these parameters, with their existing media blocks unchanged. Original URLs/files are retained. Reopen allows subsequent edits; reset restores the original presentation.
- Separate `product_test_stock` records contain enabled/quantity/revision, default OFF. Admin shows effective real stock read-only and test stock separately with an explicit indicator. The storefront projection alone substitutes test quantity. Canonical balances, CDEK sync, YCP basket/check, feed, reserves, orders and stock/sales analytics do not consume test quantities.
- Test mode allows add-to-cart and quantity limits, including when the ordinary storefront checkout button is disabled. Redirect generation permits that exception only for explicitly enabled test products, validates current server prices and scoped offer IDs, and does not create orders/reserves. Redirect data contains only the existing id/quantity/price/final_price contract, never test-stock fields. YCP independently checks real availability. Normal unavailable-product errors remain unchanged.
- Disabling test mode returns the next API read to real stock immediately. Admin refreshes its storefront state, notifies other same-origin tabs, and visible storefront tabs refresh on focus and periodically; checkout always rechecks before redirect.

## Migration and rollout

`030_storefront_controls.sql` is additive: creates `storefront_banner` and `product_test_stock`, inserts the disabled banner singleton. No product, price, content, publication or inventory rows are rewritten. Crop metadata uses existing JSON content, without a separate migration.

Deploy requires migration 030 under the existing migration owner, then matching API, admin and storefront builds. Do not enable product test modes automatically or change provider settings. Yandex transition still requires valid existing YCP checkout/price/VAT/feed configuration, published product metadata, dimensions and a unique scoped offer ID; test stock does not manufacture these or enable CDEK/fulfillment operations. With real stock zero, completing the real purchase must remain blocked by Yandex basket/check.

## Verification

- Backend TypeScript build passed. Full isolated backend run: 274 tests, 273 passed, 0 failed, 1 source-XLSX-dependent import check skipped. Disposable PostgreSQL/runner used an internal network with no production network, volumes, environment or published ports; live container IDs were checked unchanged. The legacy wrapper's final report matcher referenced a renamed old test; the complete TAP log was retrieved and verified separately.
- Client tests: 91 passed, 0 failed. Frontend production build passed.
- Browser at 1440 and 390 px, with fixture APIs: manual banner ON/OFF; crop of an existing photo, Cancel, Save and repeated edit; real=0/test=5 ON, cart, intercepted Yandex redirect, OFF restoring unavailable state; no page errors. No SMS, payment or shipment performed.
- Backend tests independently verify external feed/YCP responses and real balances are unchanged by test stock, and zero orders/reservations/outbox entries are created by generating the redirect.

No prices, descriptions, ingredients, publication rules or production configuration were changed. The predecessor lifecycle commit was pushed separately with an identical verified tree; this task is a separate commit.
