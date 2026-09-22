# PDP Rich Content / Admin — 2026-09-22

GitHub only; no deploy or production data changes.

## Reference and implementation
Figma Website 9FHGMEfYWtTfWq9Ny2jxMg, page 418:2209. This is a canvas, so design context was fetched for its child product screen 418:2286. The reference uses 890 × 920 top panels (media component 435:2802 / information component 315:2500). Exported FAQ indicator comes from component 277:1066. Figma copy, ratings, prices and product photos were not imported into canonical data.

Desktop uses equal-width panels with independent fixed heights computed from 890:920. Only the right information panel scrolls. At <=900px the page uses natural vertical flow and an independent media aspect ratio. Existing gallery, crop, favorite, cart and one-click functions remain.

Rich Content supports result, feature, howTo, lifehack, fragrance, ingredients and FAQ. It is real React/HTML with project typography/color tokens, editable text/items/media, two-column image/copy panels, four-column steps, responsive stacking and reduced-motion-aware FAQ transitions. FAQ uses the exported indicator and a data-driven number of questions. Decorative/content photography comes from product media; no flattened sections or fabricated product content.

Absent/disabled Rich Content renders no extra blocks: main PDP → existing reviews → recommendations. Old generic sensory section with hardcoded headings has been removed from this path. No automatic migration of old description/features into new sections. Legacy pdp data without enabled:true stays hidden until explicitly enabled and published.

Recommendations use up to four eligible public products, exclude the current product, honor manual canonical SKU selection then fill deterministically. Desktop shows four columns; mobile retains the existing horizontal rail. Cart's existing four-product rule remains unchanged and is covered by a shared assertion.

## Admin and schema
Admin → Products → product → Rich Content. Optional enable toggle retains content when disabled. Fixed section types, editable headings/body/images/crops, FAQ item add/edit/delete/reorder, manual recommendations up to four. No CSS or JSON editor. Existing media reference/soft-delete checks and Save ≠ Publish apply.

Additive optional `pdp.enabled:boolean` and reference node `418:2286` in existing validated JSON content. No SQL migration. Existing content without this field remains valid. Body creams are no longer artificially excluded from optional authoring, but no cream content is populated or enabled automatically.

## Verification
- Backend build passed; PDP schema and lifecycle tests 5/5 passed, including real temporary PostgreSQL save/publish/disable roundtrip and unchanged canonical price/stock.
- Frontend unit checks 2/2 passed: opt-in/empty suppression, recommendations exclusions/deduplication/fallback and cart four-card rule.
- Next webpack build (including TypeScript) passed.
- Browser fixture test at 1440 and 390: product with/without Rich Content; all upper accordions opened; media height unchanged; desktop equal panel heights/internal overflow; mobile natural flow; FAQ open/close; four recommendations; Admin FAQ edit/disable/save remains draft-only; no page errors or horizontal overflow.
- Screenshots in local test-artifacts/rich-content: hair-balm-{1440,390}.png (with Rich Content), hair-shampoo-{1440,390}.png (without), admin-{1440,390}.png. Fixture text/photos demonstrate editing and geometry, not production content.

## Visual limits
The reference supplies desktop composition; mobile stacks responsively. Real content length and selected photos/crops determine wrapping and imagery, so pages are not a pixel-for-pixel copy of Figma's example content. No content from Figma was published to products. No full-site redesign, integration changes or production deploy.
