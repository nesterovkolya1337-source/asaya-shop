# Cart / PDP / Product Editor / Settings / Promocodes — 2026-09-24

Scope: ASAYA_Cart_Final, ASAYA_PDP_Final, ASAYA_Promocodes, ASAYA_Product_Editor_v3, settings; latest user clarifications override earlier draft/publish and promo activation language. No deployment.

## Implemented
- Compact responsive cart, delivery progress above columns, clear confirmation, independently scrollable desktop product list, a single mobile checkout action that becomes sticky after leaving the viewport, horizontal recommendations, backend cashback preview.
- Product Editor: visible Save updates published content atomically while preserving lifecycle and canonical Prices values. Hidden and never-published drafts remain hidden. One explicit list visibility switch, disabled while the form is dirty. First publication uses existing validation and ever_published history. Separate Rich Content editor, per-block visibility and order, retained hidden content/assets; desktop photos left and fields right. No competing Publish/Unpublish action buttons.
- PDP retains existing content/design, omits independently hidden Rich Content blocks, keeps Reviews → Rich Content → recommendations. Four recommendation cards on desktop; mobile horizontal rail retained.
- Settings: Store / Integrations / System tabs reuse existing canonical settings. Sales moved from Marketing, YML remains in Integrations. No stock, warehouse, shipment or YCP architecture changes.
- Promocodes: Admin create/list/edit/deactivate, normalized unique codes, percent/fixed discounts, dates/minimum/order usage limit, revisions, authenticated writes and audit. Canonical pricing applies quantity discount first, promo second. No writes to base prices or additional loyalty balance.

## Production gate (intentional blocker)
Customer-facing promo application is OFF by default and absent from the public cart. POST cart/pricing rejects promoCode with PROMO_APPLICATION_DISABLED (409). The normal no-promo cart remains usable. Local browser acceptance uses explicit buildApp promoLocalPreview=true on a loopback origin only; production server does not pass that option. YCP checkout-link independently rejects promo-bearing requests. Bonus redemption remains gated.
No phone/email, price, composition, timing or SKU correlation is used. customer_id is not present in the confirmed POST /checkout contract. The read-only production check found no saved checkout/YCP sessions to inspect; it cannot establish a new shared identifier. Order attribution, usage writes and promo-to-YCP final prices are deliberately not activated. Optional per-customer/category restrictions are not introduced.

## Money
Canonical product prices remain integer kopecks. Quantity-discounted unit price is floored once to whole rubles under the existing rule. Promo allocation uses integer kopecks and deterministic largest remainder by canonical SKU. Cart total and cashback preview use the resulting server total. This promo preview is not exported as YCP unit prices while correlation is unresolved.

## Migration
041_promocodes.sql adds promocodes and promocode_usages (reserved for future confirmed attribution). Applied only to disposable local test databases. Not applied to production.

## Verification
30 targeted backend tests passed: admin/readiness/lifecycle/Rich Content/promocodes/marketing, including promo OFF on a public origin even if local preview is requested, normal no-promo quote, canonical price preservation and unchanged quantity-price flow through redirect/basket/order. 16 frontend helper tests passed. Backend TypeScript build and Next webpack production build/typecheck passed. No full regression rerun.
Older marketing/readiness fixtures now explicitly open local sales because migration 040 defaults them closed; production sales behavior is unchanged.

Browser acceptance on an isolated local API/database:
1. Published + Save changed the public product name immediately, stayed Published, then original name restored.
2. Hidden ever-published + Save remained Hidden.
3. Never-published Draft + Save remained Draft.
4. Draft visibility ON became Published; API confirmed everPublished=true.
5. Hiding Lifehack omitted only that heading, How To remained visible; restoring the same block restored its content/order.
6. Dirty form disabled visibility toggles. Admin mobile 390px had no horizontal overflow.
7. Local promo SAVE10 created via Admin and applied in cart: 500 RUB → 450 RUB. Removal restored ordinary pricing. Five mobile rows, ten desktop rows with 660px scroll area, one sticky CTA and 500-point loyalty fixture checked.

Screenshots and the local photo report are delivery artifacts outside the repository. They use synthetic local products and balances, not production business data.
