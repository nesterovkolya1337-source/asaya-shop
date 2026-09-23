# PDP final corrections — 2026-09-23

Scope: 2026_09_23_ASAYA_TZ_PDP_Final_Corrections_Reviews_Mobile_Performance.docx, based on e974cda063bb9c50e2beb3635086f10d3f762691. GitHub only; no deployment or migrations.

## UI
- Order: upper product → Reviews → Rich Content → Recommendations → Footer.
- Reviews: bordered standalone section, compact loading/error/empty states; average/count, rating stars, anonymous author label, API date/body/store reply. Public API has no author name or verified marker, so no personal data or unverifiable badge was invented. Existing API returns up to 100 published reviews; summary describes that returned collection.
- Review action appears only when existing authenticated `account/engagement` returns this slug as purchased and not reviewed. Link opens the existing account review section. Guest/API failure/already-reviewed hide the action. No changes to moderation, eligibility rules, rewards or API.
- Mobile sticky cart action uses IntersectionObserver: hidden initially and while main actions intersect viewport; shown after they pass above viewport; hidden upon return. One-click remains in the upper PDP; desktop actions unchanged. Bottom space protects the last PDP content.
- Mobile steps: 76%-width horizontal snap rail. All Figma text retained. Other sections use smaller padding/gaps and complete photo compositions capped at 320px wide, without cropping subjects. FAQ remains an accordion. Desktop upper panel geometry unchanged.

## Recommendations
Central Admin merchandising is not implemented in this branch. `src/lib/recommendations.ts` is a shared selection adapter used by cart and PDP. `temporaryPdpRecommendationIds` explicitly isolates the temporary Rich Content source (falling back to existing product recommendations), not a second permanent engine. Future centralized selection replaces this adapter input; lists are not merged. No SKU literals in React. Public/active candidates only, no current product or duplicates; existing catalog ordering and availability/card behavior retained. Admin label identifies temporary bindings. No data migration or publication change.

## Images
Original Figma files remain byte-for-byte unchanged. Static Figma paths had no derivatives and Next unoptimized=true served originals. `scripts/build-rich-image-variants.cjs` creates bounded WebP derivatives only for 57 referenced rich images (173 files, 13,699,110 bytes), with 480/960/1440 and maximum 1920px widths (never upscale). This is a scoped reproducible derivative step, not a global media conversion. Manifest drives responsive srcset; all rich photos lazy-load. Managed uploaded media/crop pipeline remains unchanged. Unknown/unlisted originals retain existing fallback.

Browser check: real local production build; isolated catalog/review API fixtures with actual Guava Rich Content, no production access. CDP encoded image transfer, cold cache, DPR=1, 960px viewport height, initial after 2s; total after vertical scroll plus all mobile steps. Includes upper PDP/header/footer/recommendation thumbnails, not HTML/JS/fonts. Lazy proximity loading can preload near-viewport images; timings/DPR change totals.

| Viewport | Initial image bytes | Total after scroll | Rich photo requests |
|---|---:|---:|---:|
| 1440 | 629,530 (~0.60 MiB) | 989,954 (~0.94 MiB) | 8 |
| 390 | 377,174 (~0.36 MiB) | 675,666 (~0.64 MiB) | 8 |

Every fetched rich image belongs to Guava; no rich assets from other SKUs fetched. Recommendation product thumbnails are intentionally shown. Full mobile height 6961px preserves all copy; step rail avoids stacking four cards vertically.

## Checks
- `node --test tests/pdp-presentation.test.mjs tests/cart-presentation.test.mjs tests/responsive-media.test.mjs`: 6 passed.
- Storefront typecheck and production webpack build passed.
- `tests/pdp-final.browser.cjs`: 1440/390 placement, empty/populated reviews and eligibility, stable desktop media height, mobile sticky appearance/return, horizontal steps, no document overflow, lazy variants and current-product image requests; no page errors.
- Visual inspection of full desktop/mobile and populated review screenshots.
- No backend edits/tests required. No migrations/config/secrets changes. YCP/CDEK/stock/pricing/loyalty/lifecycle untouched.

Screenshots: `test-artifacts/pdp-final/guava-1440.png`, `guava-390.png`, `reviews-1440.png`, `reviews-390.png`; measurements `transfer.json`. Local QA artifacts are not committed.

No deploy performed.
