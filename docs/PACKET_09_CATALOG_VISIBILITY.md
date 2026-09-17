# Task 09: catalog visibility is independent of stock

## Authority and scope

The replacement index and task 09 supplied on 2026-09-18 are preserved verbatim as extracted text under `specs-20260918/`. The replacement index supersedes the previous index. Only task 09 is implemented here; task 08 and the revised task 03 remain out of scope.

## Audit: where stock previously hid products

No stock-based storefront exclusion was found in the current branch. `CommerceService.catalog()` calculates `available` in a SELECT subquery, but its WHERE uses existing publication/active/approval rules, not quantity. `readBackendCatalog()` retains available=0 records. `placedProducts()`, catalog category/search, homepage selections, favorites and PDP recommendations filter by active/publication/placement, not stock. PDP routing does not return 404 for stock=0. These queries were intentionally not rewritten.

The production catalog inspected immediately before this task contained 25 products and zero published/active products or approved prices. Its emptiness is not evidence of stock filtering. This task does not publish products or approve prices.

## Changes

- ProductCard: zero-stock status takes priority over the global sales-closed button label.
- ProductView: the same priority applies to its primary purchase button and sticky/mobile purchase controls. Zero-stock purchase controls remain disabled; content remains visible.
- ProductView: direct lookup requires active=true independently of stock, preventing a hidden demo product from appearing at its direct URL.
- No new stock source, quantity override, publication mutation, migration, checkout payload change or cart UX change.

## Verification

- Backend TypeScript build and stock suite: 21/21 tests passed. Added production catalog coverage for missing stock, 0 -> 5 -> 0, stale/unhealthy stock, unchanged publication revision/content, and hidden products with positive stock. The tightened hidden/positive case was rerun successfully.
- Catalog/placement frontend tests: 7/7 passed. Added all-zero-stock homepage/catalog selections, hidden-positive exclusion and preservation of product content through 0 -> 5 -> 0.
- Next production build and targeted ESLint passed.
- Browser regression `tests/browser/catalog-visibility.cjs`: desktop 1440px and mobile 390px. Homepage, new selection, Hair/Body/Face, search, direct PDP, description, recommendations and zero-stock disabled buttons verified. Positive-stock purchase button verified with local test purchase flag enabled; switching back to zero keeps the same product visible. Hidden product with stock=5 stays absent. No browser page errors. External requests are intercepted/blocked; no real order.
- Screenshots and JSON evidence: workspace outputs/task09-pdp-1440.png, task09-pdp-390.png and task09-browser.json.

## LOCAL / GITHUB / PRODUCTION

LOCAL: task 09 implementation and tests complete.
GITHUB: commit and push to codex/v10 accompany this report; see the task response for the verified commit link.
PRODUCTION: task 09 is not deployed. The earlier separately authorized release 20260918-packet-webhooks-v1 published API/admin before this task; the public storefront was retained. No further production changes were made for task 09.

STOP. Do not proceed to task 08, revised task 03, checkout changes or another release automatically.
