# Promocodes — checkout correlation blocker (2026-09-22)

Read the full `2026-09-22_ASAYA_TZ_Promocodes_Admin_Cart_Import.docx`. Section 10 explicitly requires stopping if promo context cannot be safely restored in callbacks; no phone/fingerprint workaround.

## Verified current implementation
- backend/src/yandex-feed.ts, YandexFeed.checkoutLink: request accepts only items{sku,quantity}; URL data contains items. Persists local yandex_checkout_attempts keyed by an HTTP idempotency key. This key is NOT forwarded into YCP data or bound to a Yandex session.
- backend/src/ycp-catalog.ts, basketSchema/YcpCatalog.basket: strict input currently items/locality/is_health_check/offers_id_from_merchant_center; pricing is recomputed with priceRows. No local checkout intent lookup.
- backend/src/ycp-checkout.ts, createSchema/YcpCheckout.create: session_id, warehouse_id, items, customer contact, delivery; no ASAYA intent identifier. Computes priceRows independently and rejects different final prices with INVENTORY_CHANGED. Creates ycp_sessions only at this point.
- Consequently applying a promo only in cart/redirect would be overwritten/rejected; promo attribution and paid usage would have no trustworthy order linkage.

## Official documentation checked
Downloaded HTTP 200 pages directly on 2026-09-22 (web reader could not retrieve the OpenAPI pages):
- https://yandex.ru/support/merchants-ru-ycp/ru/openapi/checkoutbasketcheck-post
- https://yandex.ru/support/merchants-ru-ycp/ru/openapi/checkout-post
Local evidence outside Git: outputs/promo-basket-doc.html/.txt and outputs/promo-checkout-doc.html/.txt.
POST /checkout describes session_id as checkout session ID. The retrieved basket schema does not document a shared session/intent identifier. Delivery ycp_delivery_option_id identifies an option from delivery/options, not a general promo/checkout metadata mechanism; changing the delivery architecture to force it is out of scope.
https://yandex.ru/support/merchants/ru/buy-button-site describes the redirect data, but does not establish this order correlation.

The owner's prior confirmation is accepted: customer_id can be passed in redirect and returned by basket/check and delivery/options; it is NOT passed to POST /checkout. This decision is not being reopened. The remaining question is the safe binding between that context and session_id in the order-creating request, also for guest promo use.

## Exact question
How does ASAYA bind redirect customer_id / its saved checkout intent to session_id in POST /checkout, where customer_id is absent? Which official identifier is returned across both steps, including for a guest? Please provide a contract/example of the linked requests.

## Status
Promo model, migrations, Admin management/import, apply/remove and paid usage have NOT been implemented or presented as complete. No nonfunctional promo field added. No promo-enabled checkout or deploy. Existing cart presentation can be reviewed independently.
