# Cart / Account UI v2 — partial delivery, 2026-09-22

Source: 2026-09-22_ASAYA_TZ_Cart_Account_UI_Redesign_v2 (1).docx, read in full.

## Complete: account presentation
- Overview contains greeting, a balance widget and only the latest order (or empty state).
- Existing sidebar extended with Reviews, Invite a friend, and Repeat purchase when reminders exist.
- Reviews use structured product cards/forms; referral uses a reward card and selectable URL/code; reminders use compact product rows.
- Referral registration and review submission retain their existing API requests and CSRF/session handling. Engagement still loads on entry, including a referral query parameter, even when its panels are not selected.
- Loyalty history and the single ledger are unchanged; no redemption control was introduced.
- SMS, backend, Admin, pricing, stock, YCP and lifecycle code unchanged.

## Cart follow-up
User supplied accessible replacement nodes 457:2842 / 457:3226 in file 9FHGMEfYWtTfWq9Ny2jxMg. See CART_UI_V2_20260922.md for the completed cart UI and PROMOCODES_CONTEXT_BLOCKER_20260922.md for the separate promo blocker.

### Historical access blocker
Approved visual source: Figma 4w8Dr2nHxdoxu6uOGmAtYR, Page 2, Frame 88, node 97:1997 (confirmed in docs/figma.md).
get_design_context returned "Looks like you don't have edit access to this file" (debug UUID 8d533e51-79c6-4117-9bb8-a6f72f7e7535). Access requested. Cart implementation and its acceptance checks are not complete. No substitute layout was invented.

## Validation
- npm run typecheck: passed.
- npm run build -- --webpack: passed, 62 pages.
- auth-client, orders-client, customer-phone-input: 13 passed.
- profile-ux.browser.cjs: passed at 1440 and 390; login/OTP fixtures, reload, profile editing, section navigation, one-order overview vs full order list, order detail, logout, no horizontal overflow or page errors.
- loyalty.browser.cjs: passed at 1440 and 390; balance/history retained.
- Real Chrome rendering with intercepted local API fixtures; no live SMS, payments or production changes.
- Screenshots: test-artifacts/profile-ux/overview-order-{1440,390}.png, section-{reviews,referral,reminders}-{1440,390}.png.

No deploy. This is an independently complete account portion, not completion of the entire specification.
