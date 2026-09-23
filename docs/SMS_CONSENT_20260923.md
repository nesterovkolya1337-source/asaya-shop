# Customer SMS authorization/service consent

Scope: consent gate only; SMS Aero sender, OTP TTL, limits, sessions and commerce integrations unchanged. User explicitly authorized deployment, overriding the attachment's default no-deploy instruction.

## UI and text

`/account/`: one unchecked checkbox below phone and above request-code button.
Valid phone and explicit checkbox are required unless the server reports active current-version consent for that phone. Phone changes reset the checkbox; stale async status responses are ignored. Resend does not silently grant consent again after revocation.

Public document: `/legal/sms-consent/`, version `2026-09-23-v1`.
Legal entity/address and support email are taken from existing `site-legal-defaults.ts` (ООО «Глобал Косметикс», hello@asaya.ru). No advertising consent. Current SMS use is login OTP; future optional messaging must also check active consent. Removing SMS Aero moderation is a provider decision, not something this release can guarantee.

## Evidence

Migration `038_sms_consent.sql`, table `sms_consents`: phone, optional customer_id, consent_type=sms_auth_service, consent=true, text_version, document_url, complete text_snapshot, source=customer_sms_login, action=checkbox_and_request_code, granted_at UTC, verified_at, revoked_at/by/reason. No new IP/UA tracking. Existing hashed IP rate limits remain.

Unchecked requests cannot send SMS. Explicit consent and challenge are recorded in the same transaction after rate-limit checks. Active (phone,version) uniqueness plus existing identity lock prevents duplicates. New consent after revoke creates a new evidence row; revoked history stays intact. OTP verification records phone ownership and attaches customer_id; an unverified checkbox event is not represented as verified ownership.

## Minimal operator interface

Only authenticated owner/administrator can use these endpoints; manager and customer access are denied by existing staff guards.

- `GET /api/admin/v1/sms-consents?phone=%2B7...`: read-only full evidence history, including text version/snapshot, source, grant/verification/revoke timestamps. `revoked_at=null` and current text_version means active.
- `POST /api/admin/v1/sms-consents/revoke`, existing staff session + CSRF + same-origin required; JSON `{ "phone": "+7...", "reason": "Verified withdrawal request via support" }`. Revoke after verifying the support request. No automated mail parsing, no API for rewriting grant history.
- Public `POST /api/store/v1/auth/sms-consent/status`, JSON `{ "destination": "+7..." }`: only active boolean and current version, no customer details; no-store, origin checked, bounded input/rate limit.
- OTP request accepts optional `{consent:{accepted:true,version:"2026-09-23-v1"}}`; without an active server record or explicit current consent: HTTP 403 `SMS_CONSENT_REQUIRED`. Invalid/old explicit consent: 400.

## Validation and rollout

14 targeted backend tests (consent + existing customer SMS/account); 7 auth-client tests pass. Backend build, frontend build/typecheck pass. No real SMS was sent during these tests.
Additive migration first; deploy exact API + storefront images. Existing Admin remains unchanged. Preserve old images/config and verified DB backup. Application rollback can retain the additive consent table without deleting evidence.
