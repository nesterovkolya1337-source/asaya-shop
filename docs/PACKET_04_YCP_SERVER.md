# Packet 04 — server contract reconciliation

Official OpenAPI introduction, basket/check, checkout and placed pages fetched on 2026-09-17 (HTTP 200); current introduction identifies version 0.0.14. Sources:
- https://yandex.ru/support/merchants-ru-ycp/ru/openapi/
- https://yandex.ru/support/merchants-ru-ycp/ru/openapi/checkout-post
- https://yandex.ru/support/merchants-ru-ycp/ru/openapi/checkoutplaced-post

Existing authenticated /api/v1 routes cover warehouses, basket/check, checkout, checkout/placed, checkout/cancel, order, order/cancel and order/delivered. Bearer authorization precedes parsing, no browser login is required by YCP. Local stock avoids provider network calls within the documented five-second response budget. Yandex's connected delivery is used; ASAYA creates no CDEK shipment.

Before redirect, the backend validates SKU/quantity against canonical data and commits a scoped, idempotent technical checkout attempt. During YCP POST /checkout it creates one draft, reserves stock, assigns immutable ASAYA-N public_number and returns it as documented order_number. Retried session creation returns the same number; placed replays finalize one order. YCP's placed order_number is a different (YCP integer) identifier and never overwrites ASAYA's public_number. online means already paid per the current placed page; on_delivery remains unpaid on delivery. Full callback/PII payloads are not logged.

Important unsatisfied literal requirement: the official express URL documents items only, no merchant attempt/order identifier round-trip field. Therefore the pre-redirect attempt UUID cannot be proven to be the later ASAYA-N order identity. No invented parameter or heuristic link was added. The closed ownership model is unchanged; the missing transport field requires Yandex's exact contract, not a business architecture choice. Existing server session order-number return is implemented and usable for packet 06.

LOCAL: current implementation reconciled; backend checkout, production-flow and feed tests passed (31 tests in the combined run, with the separately corrected stock matrix passing afterwards). GITHUB: report in working branch. PRODUCTION: not changed. Live setup/check and the pre-redirect identifier acceptance are not claimed complete.
