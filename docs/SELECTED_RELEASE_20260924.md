# Selected production release — 2026-09-24
Baseline API/storefront 867b260af42877525740b4269a9583d6492a8848; Admin 8c9bb3a5f21cbac40161d101aa5def978c255ca4.

Included: SMS consent without checkbox (API/storefront); canonical dynamic YML and readonly diagnostics (API/Admin); Admin Prices (API/Admin); Merchandising ordering/recommendations, editor scroll and stock filters (API/Admin/storefront); order status audit report only.
Migration: 039_merchandising.sql, additive ordering table seeded from existing published order. No secrets/workers/config changes.
Excluded: Gramatika normalization; PDP final visual/performance corrections; Rich Content editor visibility UX; apply-on-save product lifecycle; compact bonus preview; Pages workflow. Existing product Save != Publish unchanged. No YCP/CDEK order handlers or stock sources altered.
Source changes selected from ac8090b271d160d0d43532a962e615cabdb21953 and a3705529b013417a4e9f7055849891bc2132f8a4; YCP fixture correction from 169d25c7a0b14317ca805742e8e0cd4202426fa8 included as test only.
Validation: backend build; 49 targeted backend tests; 20 frontend tests; Next build/typecheck. Shared files split to preserve production lifecycle and exclude bonus preview.
Rollout: pinned images, verified backup, additive migration, API then Admin/storefront; preserve previous static chunks; rollback images on failed health/smoke. Verify products/prices/publication and integration settings unchanged. Audit gaps (CDEK tracking configuration and provider E2E) remain reported, not implicitly enabled.