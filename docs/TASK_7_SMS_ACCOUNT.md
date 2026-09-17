# Task 7 — SMS Aero and customer account

Status: **DONE locally**, not deployed. Authority: ASAYA v10.1, AUTH-01–05 and ACC-01–03. Guest checkout remains independent of customer authentication. Yandex owns CDEK shipment creation; this task adds no fulfillment dispatch.

## Implementation

- Ordinary SMS Aero API uses the configured available account sign. Removed the obsolete mandatory paid/registered ASAYA sender and template approval flag. Production still requires explicit enablement, live mode and valid server-only credentials/sign. No credentials are included in this change. Exact message: `Код для входа в личный кабинет ASAYA: {OTP}`.
- Existing cryptographic six-digit OTP and HMAC storage, 300-second default TTL, 60-second resend cooldown, phone/IP limits and neutral request response remain enforced. Maximum attempts cannot exceed five; the final failed attempt explicitly consumes the challenge. Concurrent verification cannot create two sessions; ambiguous provider sends do not trigger automatic retries or bypass cooldown.
- A server session is issued only after SMS verification. A phone supplied during checkout is not authentication. Historical guest orders are associated through the verified normalized phone; another customer's orders remain inaccessible. Profile editing is limited to optional name/email, not verified phone or authorization attributes. Customer sessions cannot edit the site or access staff APIs.
- Order details retain items, sums, payment facts and status history. Validated CDEK pickup point/date are displayed when available, otherwise documented YCP pickup point/date interval can be shown. Only allowed fields are projected; no raw provider response or invented date/status is exposed. Calendar dates do not shift with local time zones.
- Client parsing recognizes v10.1 normalized delivery statuses. Repeat purchase reads current catalog prices and stock, caps quantities and skips unavailable products. Help/return links retain order context; session restore and logout work.

## Files and migrations

Backend: `.env.example`, `src/auth.ts`, `src/otp-policy.ts`, `src/smsaero.ts`, `src/commerce.ts`, new `src/customer-delivery.ts`; tests `customer-sms`, `sms-policy`, `smsaero`, new `customer-delivery`.

Frontend: `src/lib/auth-client.ts`, `src/components/server-orders.tsx`; tests `orders-client`, `order-tracking-client`. This report is the fifteenth changed file.

No new migration. Existing migrations were applied only to disposable local test databases.

## Documentation and verification — 2026-09-17

Official SMS Aero documentation: https://smsaero.ru/integration/documentation/api/ . The portal's public documentation JSON (`https://api.smsaero.ru/front/docs?section_id=1`) confirms ordinary `/sms/send` with number/text/sign and `/sms/testsend`. Evidence saved outside Git in `outputs/task7-smsaero-doc.json`. No authenticated provider call was made for this task and no particular sign's current account availability is claimed.

- **23 distinct backend tests passed**: 16 SMS/policy/customer authentication/account tests, one delivery projection test, six integration regressions covering shipment privacy, OTP expiry/limits and HTTP authorization.
- **13 distinct client tests passed** across auth, orders, order tracking and repeat-order suites. Reruns are not counted twice.
- Backend TypeScript build, frontend TypeScript check, targeted frontend ESLint and `git diff --check` passed.
- Browser checks passed at **1440 and 390 pixels**: phone normalization, cooldown, wrong and correct OTP, profile update, delivery details/history, help/return context, repeat with fresh price/stock, session restoration and logout. No horizontal overflow or JavaScript errors. Real components ran with intercepted local API fixtures and external network blocked; no real SMS, payments or shipments occurred. Browser fixtures exercised CDEK date display; YCP fallback dates were covered by projection/client tests.
- Browser evidence outside Git: `outputs/task7-browser-check.json`, `outputs/task7-account-1440.png`, `outputs/task7-account-390.png`. Initial local memory failure was resolved after memory was freed; the final browser runs passed.

## Release dependencies and remaining work

Task 6 automatic correlation of Yandex-created shipments remains PARTIAL; see `TASK_6_CDEK_STATUSES.md`. This task displays verified stored delivery facts and does not claim that missing live correlation is solved.

The authorized release/live-test phase must verify configured SMS account credentials/sign, actual message delivery, production cookies/HTTPS and trusted proxy/IP configuration. Current rate limits use the server-observed IP; end-user IP separation behind the deployment proxy was not tested here. No paid sender/template purchase is introduced as a prerequisite.

LOCAL: implemented and verified. GITHUB: intended branch `codex/v10`, no merge. PRODUCTION: not deployed; no production migrations or real SMS/payments/orders/shipments. Stop after Task 7 and request approval for Task 8.
