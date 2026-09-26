# Routine corrections — 2026-09-26

Scope: ASAYA_Routine_Corrections_TZ (2).docx. No production deployment.

## Changes
- Footer navigation links use 15px, matching header navigation. Public Requisites link omitted; /requisites remains available. Column headings and wordmark untouched.
- Shared ProductCard: rating row above title/price; current price right, old price secondary; title weight 400→500 (Involve variable font 400–700); transparent 44px wishlist hit area; framed packshots no longer receive redundant side inset. Catalogue remains 3 desktop / 2 mobile columns.
- Shared CarouselArrow now renders the reference white round control with dark chevron and common hover/disabled presentation. Reviews, recommendations, home product rail and community carousel use it.
- Compact reviews: up to 3 desktop / 2 tablet / 1 mobile cards, author/date, stars, достоинства/недостатки, compact official reply, original server review contents and pagination. Rail height measures visible cards rather than reserving height for the longest offscreen review.
- Purchase typography increased by 2px, shared cart/stepper unchanged. Mobile PDP purchase bar is permanently visible; inline and floating actions use the same ShopProvider state. Safe-area retained; bottom clearance moved to the end of footer, removing duplicated whitespace before it.
- Recommendations mobile shows part of the next card; no fixed section height or negative-margin gap workaround. Mobile anchor clearance added without changing header design.
- Admin Settings → Appearance: fixed first Product Info block; remaining Reviews/Rich Content/Recommendations reordered with up/down controls and Save. Persisted globally with revision conflict detection, admin write authorization and audit event; invalid/missing configuration falls back to original order. Existing empty Rich Content/recommendation sections continue to be skipped.

## API / migration
- Prepared migration `044_pdp_appearance.sql`: additive `storefront_banner.pdp_order` and `appearance_revision` columns.
- GET/PUT `/api/admin/v1/appearance`; GET `/api/store/v1/appearance` (public response contains only order).
- Migration applied only to disposable local test/preview databases. No production config, data, secrets, migrations or services changed.

## Validation
- Backend TypeScript build passes.
- `storefront-controls.test`: 3/3 pass, including authorization, malformed/duplicate order, persistence, stale revision, unchanged banner/sales, public read and fallback.
- Catalog + PDP tests: 8/8 pass.
- Next production build (webpack), TypeScript and all 63 routes pass. Turbopack cannot resolve the existing node_modules junction; webpack used without changing project configuration. Windows cached CSS required a clean local build cache.
- Representative local browser checks at 1440 and 390px: cards, footer, reviews/arrows, permanent mobile bar, add/increment/decrement/remove on PDP/catalog/cart, Admin save/reload/reordered PDP desktop/mobile. Test Admin order returned to default.
- Cart is existing immediate in-memory/session-storage state; add does not send a server write. Existing cart-pricing and checkout validation/error handling unchanged; no invented new cart backend or reload path.

- Final mobile recommendation/footer gap: PDP 44px; Cart 62px. Pointer add/remove leaves scrollY unchanged (5961.6px); locator auto-scroll is not an application navigation.

## Evidence
See `outputs/routine-corrections-20260926/index.html` in workspace.

## Follow-up
- Production release requires API/Admin/Storefront plus prepared migration 044; not authorized/performed in this task.
- No unrelated audit or design-system changes.
