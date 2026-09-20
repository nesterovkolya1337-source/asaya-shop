# Customer account / SMS OTP v2 — 2026-09-20

Implemented only the customer account specification. No deploy, no new migrations, no real SMS.

## Production blocker (read-only verified)
The running API container has no CUSTOMER_SMS_ENABLED, OTP_PROVIDER, SMSAERO_MODE, SMSAERO_EMAIL, SMSAERO_API_KEY or SMSAERO_SIGN. OTP_SECRET is present. GET /api/store/v1/auth/methods returned HTTP 200 with {"yandex":false,"orders":false}. Thus the backend defaults to disabled SMS and the UI correctly shows unavailable. This is not a first-purchase restriction. Provider validity/delivery was not tested with a paid message.

## Changes
- Login explains automatic registration using the exact requested text. No separate registration/password or mandatory personal data fields.
- Send button requires a normalized valid Russian phone and available backend SMS method.
- Existing send/verify endpoints, SmsAeroSender and customer sessions reused.
- Added 10 SMS/24h per normalized phone using existing transactional rate_limits storage. No migration.
- Existing 5/hour phone limit preserved; cooldown configuration now cannot be below 60 seconds; five failed OTP attempts consume the challenge. Default TTL remains 300 seconds.
- Customer IP defaults relaxed from 20 to 100 request attempts/hour and from 30 to 100 verification attempts/5 minutes to reduce shared-IP/NAT contention. These are server-observed IPs (trustProxy remains false); behind a shared proxy the budget may be shared. No untrusted forwarded-header support added. Phone limits remain independent.
- Limits use fixed windows beginning at the first attempt, not a rolling window or calendar day. Failed provider sends consume the send budget and do not auto-retry.
- Added tests for daily budget across hourly resets, phone aliases, changed IPs and concurrent attempts; account creation before purchase, duplicate prevention, logout, and future-order profile association.

## Reused behavior
POST /api/store/v1/auth/otp/request normalizes the phone, applies limits, stores HMAC of a six-digit cryptographic code, and calls SMS Aero. UI receives challenge ID, expiry and retry delay, not the code.
POST /api/store/v1/auth/otp/verify accepts a valid delivered challenge once, creates/reuses the customer identity and profile, claims eligible historical guest orders, and issues a customer session.
The profile requires only the verified phone. Optional name/email are not login identifiers. A subsequent YCP order with the same normalized phone uses the same customer profile; eligible guest-order ownership is claimed by existing canonical rules. No YCP/CDEK/order architecture change.
Production session: seven-day HttpOnly Secure SameSite=Strict __Host-asaya_session cookie. Reload recovers the session/CSRF token; logout revokes it and clears the cookie. No SMS for page navigation.
Admin/staff authentication unchanged.

## Validation
- Backend TypeScript build passed.
- 18 relevant backend tests passed: customer-account, customer-sms, sms-policy, smsaero. Disposable local PostgreSQL and memory/mock SMS sender.
- 5 auth-client tests passed.
- Frontend production build + TypeScript passed using next build --webpack. Default Turbopack failed because the local node_modules junction points outside its root; no project configuration change made to work around it.
- Targeted ESLint and git diff --check passed.
- Browser checks at 1440 and 390 px passed: explanation, invalid/valid number, normalized request, cooldown, wrong/correct code, reload without another SMS, logout and disabled-provider guard. No page errors or horizontal overflow in the checked account state. Browser API responses were fixtures; actual backend behavior is covered by the PostgreSQL tests. This does not claim real provider delivery.
- Evidence outside Git: outputs/customer-otp-browser.json, outputs/customer-otp-1440.png, outputs/customer-otp-390.png.

## Production configuration and future deploy scope
API environment must provide:
- CUSTOMER_SMS_ENABLED=true
- OTP_PROVIDER=smsaero
- SMSAERO_MODE=live
- SMSAERO_EMAIL: real SMS Aero account email
- SMSAERO_API_KEY: actual API key, not account password
- SMSAERO_SIGN: sender available to this account
- Existing OTP_SECRET (already present) stays in place.

Use protected server environment; never browser bundle or Git. Historical credentials in chat are not proof of current provider readiness. No fabricated sign or extra branded-sender purchase requirement. Leave unavailable UI in place until configured.
Optional explicit limits: OTP_RESEND_SECONDS=60, OTP_SEND_PER_PHONE_PER_HOUR=5, OTP_SEND_PER_PHONE_PER_DAY=10, OTP_SEND_PER_IP_PER_HOUR=100, OTP_VERIFY_PER_IP_PER_FIVE_MINUTES=100, OTP_MAX_ATTEMPTS=5, OTP_TTL_SECONDS=300.
Future deploy: API and storefront account page; Admin does not require this change. No migrations. Verify live delivery only in a separately authorized production check. Production and all unrelated areas remain unchanged.
STOP.
