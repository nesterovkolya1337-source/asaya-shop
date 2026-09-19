# Admin access and trusted sessions

Scope: 2026_09_18_ASAYA_FINAL_Admin_Access_Employees_Trusted_Sessions_TZ.docx only.
Branch: codex/admin-access, based on c0d59dd09b20f3005ec119e9d808182823577cd3.
Deferred PDP and image-pipeline branches are not included.

## Implemented
- Existing Admin upper navigation: Employees (Owner/Administrator only).
- Protected Owner email asayacosmetics@yandex.ru; ordinary API cannot delete, disable, reset or demote Owner.
- Server-enforced operational Manager permissions; employee/security/system-integration routes denied.
- Current role resolved from database on each request.
- Persistent HttpOnly/Secure/SameSite=Strict production session cookie, rolling 90-day server expiration; existing logout revokes session and clears cookie.
- Pending employee with unique email and seven-day one-use temporary password; TXT uses actual current Admin URL without query/hash and contains no TOTP/recovery material.
- Mandatory personal password replacement, local QR/manual TOTP setup and six-digit confirmation.
- Ten one-use recovery codes displayed once, only hashes stored. TOTP secret encrypted using existing staff secret.
- Confirmation for role/access changes; combined password-and-2FA reset restarts activation. Disable/reset/delete revoke all trusted and activation sessions; soft delete retains audit identity.

## Migration / deployment
Additive migration: backend/migrations/033_staff_access.sql. Applied only in temporary local test databases.
Requires API and Admin deployment after explicit approval, plus migration 033 and the locked qrcode-generator dependency. No storefront deployment or integration-secret changes required.
Existing staff accounts retain their passwords/TOTP; matching Owner is promoted by migration; other existing staff default to Administrator. New personal activation produces recovery codes. Existing trusted sessions retain their prior expiration until a successful request renews them (expired sessions still require login).
This change does not deploy deferred PDP 031 or image pipeline 032.

## Validation
- backend build / TypeScript: pass.
- backend admin.test.js: 14 pass.
- backend staff-access.test.js: 5 pass (four lifecycle tests plus focused HTTP activation test).
- frontend admin-client, auth-client and staff-access tests: 13 pass.
- Admin NEXT_PUBLIC_BASE_PATH=/manage Next build --webpack: pass, including TypeScript.
- git diff --check: pass.
- Real production users/secrets and deployment untouched. Browser-restart behavior is verified by persistent cookie Max-Age and server lifetime tests; no real browser restart was performed.

A SQL UUID/text parameter conflict found by activation tests was corrected and the affected tests passed on rerun.
