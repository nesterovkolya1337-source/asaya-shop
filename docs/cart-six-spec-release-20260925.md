# Six-spec release, 2026-09-25
Scope approved: Cart Final, PDP Final, Product Editor v3, Settings UI, Promocodes, Cart Prototype, including subsequent user corrections.

Final corrections: delivery threshold/progress use canonical merchandise subtotal before quantity/promo/redemption discounts; product/YCP prices unchanged. Hide zero kopecks only in presentation. Remove duplicate discount notice. Inline collapsed/expanded promo control. Single dynamic delivery status above progress; amounts only below. Cart-only Help resides in footer to avoid overlay. Summary proportions and 3.5 desktop / 1.5 mobile recommendation rail retained.

Production promo application and bonus redemption remain gated. Admin promo CRUD/audit and pricing engine are included. No new correlation mechanism. Migration: 041_promocodes.sql, additive tables only.

Baseline verified live: API 19e6db92ded207a9ac2be5570f352f8f708117d5; Admin dcfdf0ac80b67686e2df8fadcf1900542be7c03b; storefront 61572f7d8c19573f097bb150adf828b4f69ba196. Sales ON must be preserved.

Validation: latest backend targeted marketing/promocodes 9 passed, frontend cart presentation 3 passed; production Next webpack build/typecheck and backend build passed. Earlier task-specific editor/PDP/Settings acceptance is recorded in cart-prototype-acceptance-20260924.md. Latest local photo report: outputs/cart-final-delivery-20260924/index.html. Last dynamic-delivery-heading change removes duplication only.

Rollout: retain prior images/config and verified database backup, apply 041, update API/Admin/storefront only. No product prices/publication/test stock/secret changes. Rollback restores application images and compose files, preserving additive schema and business records.
