# PDP Rich Content v2 — 23 September 2026

GitHub-only change based on `1a4d690100576789cec976df51f2460b529a0f89`. No deployment or production data changes.

## Content and provenance

Source: Figma file `9FHGMEfYWtTfWq9Ny2jxMg`, canvas `418:2209`, its actual product screens. `backend/data/pdp-rich-content-v2.json` contains the SKU-bound content, not React fixtures. `pdp-rich-content-v2-sources.json` records verbatim text-node values, source node IDs, image hashes and downloaded-file SHA-256 checksums.

72 original Figma raster assets are included without re-encoding (PNG/JPEG, approximately 241 MiB in total). In addition, ten photo-only fragrance compositions are exported directly from their Figma frames to preserve the complex clipping exactly; those frames contain no text. They can be replaced/cropped in Admin as image assets. Text, headings, steps and FAQ remain editable HTML/React. Other Figma photo placement/crop/rotation is retained in media metadata. Existing Admin crop overrides remain available.

| Canonical SKU | Product | Figma screen | Imported sections |
|---|---|---|---|
| 1S-BA-02-02 | Гуава | 440:2890 | result, howTo, lifehack, fragrance, ingredients, FAQ |
| 1S-BA-02-05 | Юдзу | 457:3502 | result, howTo, lifehack, fragrance, ingredients, FAQ |
| 1S-BA-02-04 | Киви | 457:4268 | result, howTo, lifehack, fragrance, ingredients, FAQ |
| 1S-BA-02-01 | Клубничный йогурт | 457:4920 | result, howTo, lifehack, fragrance, ingredients, FAQ |
| 1S-BA-02-03 | Голубика | 457:5317 | result, howTo, lifehack, fragrance, ingredients, FAQ |
| 1S-FL-02 | Крем-лифтинг для лица | 418:3505 | result, lifehack, feature, ingredients |
| 1S-FL-01 | Восстанавливающий крем для лица | 418:3744 | result, lifehack, feature, ingredients |
| 1S-HK-02 | Мультиспрей | 418:3983 | result, howTo, lifehack, fragrance, ingredients |
| 1S-HK-03 | Бальзам | 418:4215 | result, howTo, lifehack, fragrance, ingredients |
| 1S-HK-01 | Шампунь | 418:4470 | result, howTo, lifehack, fragrance, ingredients |
| 1S-HK-05 | Маска | 418:4726 | result, howTo, lifehack, fragrance, ingredients |
| 1S-HK-04 | Крем-спрей | 418:4981 | result, howTo, lifehack, fragrance, ingredients |

Each entry also retains four manual recommendation SKUs from the design; runtime eligibility filtering excludes the current/unpublished product and fills missing slots from the existing public catalogue. No new recommendation engine. Cart already has its four-card recommendation layout and was not changed.

All imported copy matches Figma `characters` exactly, including line breaks, trailing spaces and original wording/typos such as «Базовые данные». Gel FAQ answers come from component set `431:1954`, variants `431:1955`, `431:2150`, `431:2233`, `431:2291`, `431:2352`; five complete question/answer pairs per gel. No invented answers.

## Incomplete source fragments deliberately not imported

- Face creams `418:3505` / `418:3744`: howTo describes shower gel and showering, not face cream. Those steps are excluded; the actual face-cream lifehack and other prepared sections are retained.
- Face/hair screens listed above: FAQ questions exist, but no answers were found in their prepared product FAQ content. FAQ is not published with empty or fabricated answers.
- Body creams `1S-BA-03` / `1S-BA-01`: unchanged. Screens `479:5895` / `482:6426` contain mixed unfinished copy, including gel FAQ. No automatic Rich Content import for them.
- All other SKUs, sets and products outside the table remain untouched, with Rich Content optional.

These are source-content gaps, not missing renderer capabilities. They require corrected Figma content or an explicit content decision. They are not represented as completed content.

## Rendering and Admin

The existing desktop top panels remain equal-height (Figma 890:920 ratio). The entire right information panel scrolls internally; opening its accordions does not grow the photo. At mobile widths the information panel flows naturally. Canonical title/description/ingredients/price/stock are not overwritten by Figma copy.

Rich Content supports photo compositions without flattening text; ingredient panels overlay real HTML copy on the original photograph on desktop and use readable stacked copy on mobile. FAQ uses the original indicator, native details/summary and reduced-motion-aware transitions. All four PDP recommendation cards are visible on desktop; mobile retains the existing rail.

Admin → Products → product → Rich Content: enable/disable, eyebrow/title/body, steps, original media/crops, FAQ add/edit/remove/reorder and manual recommendations. Replacing media preserves its composition slot. Layout coordinates are not exposed as a manager page builder.

## Storage / application

No SQL migration. Existing `product_editor.draft.content.pdp` / `published.content.pdp` storage remains. Schema adds optional `eyebrow` and `visualAspectRatio` and allows the verified child-screen IDs. Existing products without Rich Content remain valid.

Run from `backend/`, after building:

```powershell
# DATABASE_URL and ADMIN_ACTOR_ID must be supplied through the existing protected environment.
node dist/scripts/import-pdp-rich-content.js
# After reviewing the dry-run result, import ONLY drafts:
node dist/scripts/import-pdp-rich-content.js --apply
```

The importer uses canonical SKU, an admin actor and the existing catalog lock. It changes only `draft.content.pdp`, revision and audit metadata. It does not create products, change publication state, publish, alter prices, stock or canonical content. Missing/archived products are reported. Existing nonempty manager content is preserved rather than overwritten. Identical imports are idempotent. Imported drafts require explicit Publish in Admin after review.

The import was exercised against a temporary local database with all twelve real content entries. Production import was not run. The browser checks serve these same imported-content entries with isolated local catalogue/Admin responses; they do not claim a production integration test.

## Validation

- Targeted backend: PDP schema, lifecycle Save/Publish, all twelve imports, verbatim copy/assets, idempotency, preservation of manager changes/canonical fields/published snapshot/stock, admin authorization.
- Frontend presentation tests: optional Rich Content, incomplete FAQ suppression, published-only recommendations and exclusions.
- Backend build, frontend typecheck and Next production build.
- Browser 1440/390: guava with actual Figma content and originals; coconut cream without Rich Content; all top accordions; fixed photo/whole-panel scrolling; FAQ; four *visible* desktop recommendations; no horizontal document overflow; Admin imported content editing and draft-only Save; no page errors.

Screenshots are local under `test-artifacts/rich-content-v2/`: `guava-shower-gel-1440.png`, `guava-shower-gel-390.png`, `coconut-body-cream-1440.png`, `coconut-body-cream-390.png`, `admin-1440.png`, `admin-390.png` (not committed as generated artifacts).

Small typography/wrapping and collage-coordinate differences may remain. Mobile uses a responsive adaptation because these supplied screens are desktop. This is not a claim of pixel-identical rendering of all twelve screens. No unrelated business logic, footer, integrations, lifecycle, prices or stock changes.

No deploy. A future release needs API/Admin/storefront builds for the compatible schema/editor/renderer and static assets, then the explicit draft import and content review/publication.
