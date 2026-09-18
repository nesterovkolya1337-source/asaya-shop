# ASAYA custom-site Checkout — 2026-09-18

Scope: canonical ASAYA cart -> Yandex express button -> authenticated YCP callbacks. No product feed required for this scenario, as confirmed by the owner with Yandex. No prices, publication state, nine excluded sets, production settings or database records changed.

## Contract and implementation

- Button: https://yandex.ru/support/merchants/ru/buy-button-site#button-code — host plus base64 JSON items (id, quantity, price, final_price). Use the existing canonical SKU, never a fabricated offer ID. Checkout link now queries canonical prices/publication/availability directly; it does not call feed rendering, require feed.name/company, a scoped mapping, image/feed metadata, dimensions, VAT or legacy checkout config.
- Basket: https://yandex.ru/support/merchants-ru-ycp/ru/openapi/checkoutbasketcheck-post and current machine-readable https://yandex.ru/support/merchants-ru-ycp/ru/openapi/index.md (OpenAPI 0.0.14). Existing canonical SKU works with either identifier flag. Previously explicit scoped feed aliases remain readable only with the merchant-center flag; no mappings are created. Unknown IDs still fail.
- VAT is optional: omit if absent/null; preserve explicitly configured zero or other value. No invented rate/default is stored or sent.
- dimensions object is required, but width/height/depth/weight have no required array. Send only known canonical values in mm/g, or an empty object. No guessed dimensions. Delivery-provider acceptance of missing measurements is NOT proven by schema validation.
- Monetary decision: rubles on the wire, minor units internally. The paired official button and basket examples use the same product 50 and values 1999/1799 (button 1999.00/1799.00). These examples support a consistent ruble representation; the OpenAPI itself does not explicitly label the currency unit. This is a documented implementation interpretation, NOT a claim of independently observed live YCP monetary behavior. Legacy priceUnit / checkout.deliveryPriceUnit are accepted for configuration-file compatibility but do not affect conversion. The owner is not asked to configure units.
- Server product price fields are integer in published YCP OpenAPI. Non-whole-ruble product amounts fail explicitly with YCP_PRICE_NOT_REPRESENTABLE rather than round or silently multiply by 100. Button float prices and delivery decimal parsing remain exact. Fractional server product prices require technical confirmation from Yandex; no canonical prices were changed to accommodate this.
- Create-checkout removes the same VAT/unit/config and dimensions-presence guards; server-side canonical price, real inventory, locking and idempotency checks remain.
- Test stock affects only the storefront cart/link eligibility; basket, session creation/reservations and order confirmation use real stock. The ordinary button enable switch remains intentional. A product explicitly in test mode can obtain a link while that switch is disabled.
- ASAYA does not dispatch CDEK/FF orders or create shipments. Ownership guards remain unchanged.

## Verification

- Backend TypeScript build passed.
- Related backend groups: ycp, yandex-feed, ycp-checkout, ycp-production-flow, ycp-orders, ycp-mode, stock-source, warehouses, ycp-ownership: 96 passed / 0 failed / 0 skipped.
- Frontend cart-stock, yandex-checkout, checkout-client: 14 passed.
- Independent AJV validation of the actual local HTTP basket response against the freshly downloaded official 200 schema passed: omitted VAT, empty dimensions, real quantity zero.
- New HTTP scenario: published product, zero real stock, positive test stock, absent feed/mappings/VAT/checkout/unit config; official express URL has canonical SKU/prices; both basket flags return real zero; prices/balances unchanged; no orders, reservations, outbox messages or generated mappings.
- Create/placed/cancel/replay tests preserve canonical amounts and stock; ownership tests prohibit enabling the obsolete CDEK/FF dispatcher.

## Release boundary

No migration. API deployment is required; no Admin or storefront code changed. No production deployment performed.
The generated destination is the real official HTTPS Checkout URL, but a successful live Yandex Checkout session is NOT claimed. Yandex server callbacks still reach the old production API. A public staging endpoint configured in Yandex, or the separately approved API deploy, is needed to test that loop. After deploy verify canonical SKU identity without feed, displayed amounts and zero-stock rejection before attempting payment. If Yandex actually rejects the SKU/empty dimensions, retain a sanitized request/response and resolve that specific contract issue. No feed should be introduced preemptively.
