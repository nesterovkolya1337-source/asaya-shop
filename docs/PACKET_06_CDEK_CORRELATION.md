# Packet 06 — confirmed client-number binding

Current CDEK OpenAPI re-fetched 2026-09-17 from the portal's published specification:
https://gateway.cdek.ru/api-cdek-docs/web/docs/merged?sectionId=api_v2_integration
Portal: https://apidoc.cdek.ru/#tag/order

GET /v2/orders/{uuid} and GET /v2/orders?cdek_number=... return OrderResponseDto.entity.number, documented as the client's order number. The contract allows client-number reuse after terminal shipments; hence bare number discovery or overwriting an old UUID is unsafe. Yandex's actual value in this field is **not yet captured live**.

ASAYA's expected number is orders.public_number (ASAYA-N), returned by YCP POST /checkout as order_number. It is distinct from the YCP integer placed.order_number. The code accepts a first confirmed association only when an authenticated CDEK GET, selected by exact tracking number, reports entity.number exactly equal to the scoped ASAYA number. UUID/tracking and account/environment are persisted; no phone, email, name, amount, cart or time heuristics exist.

Operator tooling (prepared, not executed against production):
```
node dist/scripts/cdek-correlation.js --verify INTERNAL_ORDER_UUID CDEK_TRACKING_NUMBER
node dist/scripts/cdek-correlation.js --bind INTERNAL_ORDER_UUID CDEK_TRACKING_NUMBER ASAYA-N
```
`--verify` is read-only. `--bind` requires the operator-confirmed number from live evidence, performs authenticated GET again, then writes only the local binding plus a minimal audit record and queues the existing status reader. It creates no remote order, waybill, subscription or payment. It requires the configured YCP settings and CDEK tracking credentials/environments to agree. Conflicting prior binding, another order using the shipment, cancelled/unplaced or foreign YCP scope fail closed. Concurrent/replayed identical binding writes one audit event. No new migration is needed.

Automatic binding of unknown webhook shipments remains disabled until packet 07 proves the actual Yandex→CDEK value. Existing known-shipment webhook→GET→status history pipeline is retained.

Validation: backend build; 47 tests passed across CDEK contracts, fulfillment/tracking, webhook setup and YCP orders, including two new correlation cases; the additional adapter field test then passed with all 9 CDEK contract tests. Exact number, missing/wrong number, wrong account/environment, repeated/concurrent bind, conflicting UUID/tracking, unchanged payment and existing status refresh covered. Test payloads are synthetic, not live shipment evidence.

LOCAL/GITHUB: prepared and tested. PRODUCTION: unchanged. Final acceptance requires one authorized real Yandex-created shipment with sanitized identifiers and confirmed entity.number; no such proof is claimed.
