# Promocodes: Admin and cart preview

Status: PARTIAL. No production deploy. Payment/order integration is NOT complete.

## Implemented
- Admin → Marketing → Promocodes: create/generate/edit, active/archive lists, search, page selection, confirmed bulk disable/archive, restore by enabling with valid dates.
- Normalized case-insensitive unique codes, integer percentage 1–100, optional dates and usage limits, one use per customer by default. Restricted codes require a verified customer session; unrestricted codes support guests.
- CSV UTF-8 template, bounded parser, validation preview with row errors, explicitly confirmed import of valid rows; transaction revalidates duplicates before inserting.
- Server-side cart preview uses canonical product prices after sale/quantity discounts, then applies promo discount and downward whole-ruble unit rounding. No browser price is accepted. Preview does not consume uses.
- Cart supports checking/removing a code and explains the preview-only state. Checkout is disabled while a submitted promo is present; removing it restores the existing ordinary checkout flow.
- No YCP, CDEK, stock, product price or publication changes.

## Not complete / release blocker
The confirmed customer_id propagation reaches basket/check and delivery/options, but not POST /checkout. No supported correlation from the saved ASAYA discount context to YCP session_id has been established. See PROMOCODES_CONTEXT_BLOCKER_20260922.md.

No promo snapshot is written by real order placement, no paid-use counter is connected to payment callbacks, and no promo price is sent to Yandex. No phone/SKU aliases or browser final_price are used to invent this linkage. Usage summary currently reads the prepared ledger; applying a code never increments it. Do not treat this as a complete production promotion campaign.

## Migration
038_promo_codes.sql: promo definitions and reserved order snapshot/paid usage tables with foreign keys and no cascade deletion. Applied only to disposable local test databases. No production migration/config/secret changes.

## Verification
- Backend TypeScript build passed.
- promos + marketing tests: 8/8 passed on temporary PostgreSQL. Covers normalization, dates/limits, canonical pricing and rounding, duplicate/archive/restore/import, no usage consumption, rejecting browser totals and anonymous Admin access. Existing no-promo cart/redirect/basket/order price consistency remains tested.
- Frontend typecheck and Next webpack production build passed.
- Browser fixtures: Admin create/archive confirmation and cart promo success/error/remove/checkout guard at 1440 and 390 px; ordinary checkout request/redirect after removing promo. No real orders/payments/SMS sent.
- No end-to-end paid promo test: callback linkage is unresolved.
