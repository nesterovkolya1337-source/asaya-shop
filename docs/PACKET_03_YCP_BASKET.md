# Packet 03 — basket/check reconciliation

Historical report. The revised 2026-09-18 verification is in [PACKET_03_YCP_BASKET_REVISED.md](PACKET_03_YCP_BASKET_REVISED.md).

Official method page fetched successfully on 2026-09-17:
https://yandex.ru/support/merchants-ru-ycp/ru/openapi/checkoutbasketcheck-post

`POST /api/v1/checkout/basket/check` accepts items[id,quantity], locality, health-check and offer-ID flags. Response uses canonical SKU, regular_price/final_price, dimensions and warehouses[id,available_quantity]. The documented available_quantity is a **purchase ceiling**, not a raw warehouse inventory assertion. No extra availability or stock-snapshot fields were invented.

Existing YcpCatalog already uses the common stock_source_items/stock_sources layer through asaya_stock_limit, together with local reservations and confirmed consumption. No synchronous provider request or separate YCP cache is made. AdminStocks displays provider quantity; YCP subtracts local obligations. Thus equality is expected before reservations, not after them.

Explicit fail-closed policy retained: missing/unknown, expired or failed source authorizes zero units (or no warehouse when no balance exists). This does not assert a measured provider zero. Admin preserves `quantity=null` for missing and the last measured quantity with stale/error metadata. A genuine provider zero remains known zero. Production cannot use manual fallback stock.

Validation: shared stock matrix 10/request1, 1/request2, 0/request1, stale10 and missing; authoritative prices; injected price and fractional quantity rejection. Existing checkout last-unit/reservation tests prevent a later sale above this ceiling. No application change was needed: reconciliation adds the explicit contract/policy and regression coverage.

LOCAL: backend build and stock integration suite. GITHUB: working branch only. PRODUCTION: no deployment, migrations or provider mutations; live Yandex acceptance deferred to packet 07.
