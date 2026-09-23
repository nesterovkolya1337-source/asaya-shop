# Production release: cart + PDP, 2026-09-23

Release source: ee3403e9ecb3d68b24dc0f5f63d2c17e6d7aa422, with incomplete promo commit 57303775fb6545268e5839fb4feeb12316db13d8 reverted for this release only. Development branch remains intact.

Includes cart UI 6fc3671, PDP schema/editor/renderer 1a4d690, verified content e974cda, final mobile/review/image corrections ee3403e. API/Admin baseline 9542f3acfb2170e0812922a119908783eaeb4e43; storefront baseline 87829ba37e132b39cd9c2b38fe918ca69c7bd24b verified on production.

No migration. No YCP/CDEK/auth/pricing/stock/lifecycle behavior changes. Preserve existing environment and worker settings. API rebuild is needed for optional PDP schema; Admin rebuild for Rich Content editing; storefront for cart and PDP.

Before switching: full verified database/config backup, exact card snapshots including drafts/published content, prior image tags and saved Docker images, compose files, rollback script. Original uploads remain untouched.

Publish only prepared Rich Content for 12 existing Published SKU. Preserve all canonical content/prices, active state, unrelated drafts and body cream content. A concurrent card change blocks content application rather than overwriting it. Rollback restores only release-owned PDP fields plus prior application images, never resets transactional orders/stock from a database dump.
