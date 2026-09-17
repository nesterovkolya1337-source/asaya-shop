# Task 6 — CDEK status webhook and GET fallback

Status: **PARTIAL**. The status pipeline for an already verified shipment binding is implemented and tested locally. Automatic binding of a Yandex-created shipment remains unverified; no live endpoint/subscription activation was performed. Do not call Task 6 production-ready.

Authority: ASAYA v10.1, Task 6; CDEK-01–05. Yandex owns shipment creation. ASAYA does not call CDEK/FF order creation. The Task 5 startup guard against the old fulfillment dispatcher remains enforced.

## Official contracts checked on 2026-09-17

- https://apidoc.cdek.ru/#tag/webhook — `POST /v2/webhooks` with `{type: "ORDER_STATUS", url}` creates a subscription; `GET /v2/webhooks` lists active subscriptions. `GET /v2/webhooks/{uuid}` only reads one. The documented limit is two subscriptions **in total**, not two per event type. Fixed the setup check accordingly; other integrations' subscriptions are never deleted/replaced.
- https://apidoc.cdek.ru/#tag/order — `GET /v2/orders/{uuid}` or `GET /v2/orders?cdek_number=...` returns the authoritative status history. Other-channel orders are readable only when created after the first authorization with the integration keys, per the provider documentation.
- The portal's current published OpenAPI was retrieved with HTTP 200 from its own frontend's URL: `https://gateway.cdek.ru/api-cdek-docs/web/docs/merged?sectionId=api_v2_integration`. Evidence outside Git: `outputs/task6-cdek-openapi.json` and the portal HTML/frontend asset. Its common section describes ORDER_STATUS fields, optional `deleted`, and status codes. Examples in tests are synthetic contract fixtures, not real shipment captures.
- https://yandex.ru/support/merchants-ru-ycp/ru/openapi/checkoutplaced-post — placed carries YCP order/session identifiers and payment facts, not a documented CDEK UUID/waybill. The CDEK `attributes.number`/GET `entity.number` is the client's order number; the inspected docs do not establish which Yandex/ASAYA identifier Yandex writes there.

## Implemented behavior

- Existing stable route `POST /api/integrations/cdek/<independent-secret>` authenticates the secret before parsing. No documented CDEK signature was invented. A webhook only queues a durable refresh hint for an existing account/environment/tracking/UUID binding; customer-visible facts come from authenticated GET. Unknown or mismatched shipments are not imported or matched by PII/cart/time.
- Inbox insert and refresh request commit together before HTTP success. Provider GET is outside the callback. Identical delivery is deduplicated; deletion/correction of the same status/time is a distinct event and can refresh a final order.
- GET stores provider UUID, tracking, raw and internal normalized status, occurrence/sync timestamps and minimal non-contact history. Explicitly deleted events are excluded from customer/YCP history. Account/environment binding is rechecked under the transaction lock after GET, including concurrent rebinding.
- New optional `delivery_point` and `planned_delivery_date` from the documented GET response are stored and projected as `pickupPoint` and `plannedDeliveryDate`. ETA is a calendar date, not converted across time zones. Missing optional fields stay null; no address or ETA is fabricated. No recipient/contact/raw response is retained by the adapter.
- Customer normalized names now follow v10.1: `processing`, `handed_to_delivery`, `in_transit`, `ready_for_pickup`, `delivered`, `delivery_problem`, `returning`, `returned`, `cancelled`, plus payment states. Internal legacy codes remain compatible with existing stored events.
- `NOT_DELIVERED` / `POSTOMAT_SEIZED` indicate return activity, not evidence that the merchant physically received the return. They no longer set the legacy order to `returned`. `RETURNED_TO_SENDER_CITY_WAREHOUSE` remains transit, per the documented meaning. No automatic stock credit/refund occurs. `returned` is available as a normalized state, but no unproven raw code is mapped to completed return; related return-shipment confirmation remains unimplemented.
- Existing worker checks the local queue every 30 seconds, not every remote order. Ordinary active non-final reconciliation is daily; authenticated account viewing may queue a stale owned order after 60 minutes. Final orders are excluded from ordinary refresh; correction hints can still refresh them. Returns in progress remain eligible.
- 429/5xx/timeouts produce sanitized failure, retain the last good customer status and use exponential retry delay. After eight failures, further attempts are at most daily until recovery. New hints/account views do not bypass the backoff. One scheduled attempt makes one order GET, without an inner retry loop.

## Operator paths (prepared, not run against production)

After deploying the reviewed code/migrations and configuring server-only credentials:

1. Existing `node dist/scripts/cdek-webhook.js --status` lists/verifies the saved subscription without registering anything. It does not expose the secret callback URL.
2. Only after the HTTPS endpoint is verified, `--ensure` registers ORDER_STATUS once. It requires `CDEK_WEBHOOK_ENDPOINT_VERIFIED=true`, durable absolute `CDEK_WEBHOOK_STATE_FILE`, and takes a scoped DB advisory lock. Intent is saved before POST. An ambiguous create does not repeat POST; GET recovers it or reports review required.
3. `node dist/scripts/cdek-tracking.js --refresh <internal-order-uuid>` refreshes one **already bound** order via GET. This updates the local status cache/history (and existing once-only physical stock consumption), not remote CDEK data. Requires explicitly enabled tracking and scoped server credentials. It cannot create or guess a binding.

No live subscription was registered now: the new endpoint/code are not deployed, and premature registration can fail or be removed by CDEK after repeated delivery failures.

## Migration and validation

New additive migration `026_cdek_delivery_details.sql`: nullable pickup point and planned date on `order_logistics`; no historical backfill. Applied only to disposable local test databases.

Backend TypeScript build passed. Four test files passed **45/45**, zero skips: `cdek-contracts`, `cdek-webhook-setup`, `fulfillment-tracking`, `ycp-orders`. Coverage includes callback authentication, durable dedupe/correction, GET-only transport, subscription recovery/limits, failed transport privacy, account rebinding races, ownership, cached status, bounded retries/daily scheduling, ETA, deleted-event history, return semantics, once-only inventory and unchanged payment/refund facts. Legacy FF tests use fake gateways only; production dispatch remains disabled.

## Remaining precise blockers / ownership

- **Automatic Yandex→CDEK correlation:** obtain one documented/captured pair of YCP order identifiers and Yandex-created CDEK GET `entity.uuid`, `cdek_number`, `number`, with confirmation of which identifier `number` represents and under which delivery contract it is visible. CDEK permits reuse of client numbers after terminal orders, so bare number matching without identity/reuse handling is insufficient. Owner/support supplies evidence; implementation then validates and persists the scoped immutable binding. No new shipment creation is needed or authorized.
- **Returned-to-merchant confirmation:** the direct-shipment terminal code alone does not establish final physical return. A documented related return-shipment payload is needed before asserting `returned` automatically.
- **Live registration and event acceptance:** deferred to the authorized release/live-test phase, with current delivery credentials, endpoint and binding verified. Live subscription status/event receipt is not claimed.

LOCAL: implemented/tested for known bindings. GITHUB: changes for `codex/v10`, no merge. PRODUCTION: not deployed; no production migrations, real orders, SMS, payments or shipments.
