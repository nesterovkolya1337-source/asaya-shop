# PDP / Product Editor v3 — implementation verification

Scope: approved PDP v3 document, with the owner's later instruction to retain all Figma lower-block content, including FAQ. No deployment is part of this change.

## Approved Figma roots

File `9FHGMEfYWtTfWq9Ny2jxMg`, Page 2:

| Product SKU | Root node |
| --- | --- |
| 1S-BA-02-02 | 300:1010 |
| 1S-BA-02-01 | 315:1453 |
| 1S-BA-02-04 | 315:1859 |
| 1S-BA-02-03 | 315:2680 |
| 1S-BA-02-05 | 315:3149 |
| 1S-FL-02 | 334:1380 |
| 1S-FL-01 | 335:1878 |
| 1S-HK-02 | 315:1065 |
| 1S-HK-03 | 354:1485 |
| 1S-HK-01 | 360:1710 |
| 1S-HK-05 | 368:1627 |
| 1S-HK-04 | 383:2020 |

Images and photo-only composites come from descendants of those roots. No full section with text is flattened. Headings, paragraphs, steps and FAQ questions remain React content editable through the product editor. Questions without answers in the source remain present; no answers were invented. Source wording, including apparent placeholder wording, is retained at the owner's explicit request.

## Changes

- Optional validated PDP content in draft and published snapshots; ordered sections, items, images, responsive crop metadata and canonical SKU recommendations.
- Product editor tabs, explicit Save/Publish controls and publication status, existing-image cropping, confirmation before deletion, and removal of the sensory-rating editor.
- Save only changes the draft. Publishing explicitly updates the public snapshot and canonical product data after validation.
- The first PDP photo/description block and footer are unchanged. Body creams retain their previous PDP rendering.
- Migration `031_product_pdp_content.sql` enriches only the twelve approved products when PDP data is absent. Existing PDP edits take precedence. Prices, inventory, publication flags, other launch products and nine draft sets are preserved. Re-running the enrichment is idempotent.

## Verification

- Backend build and frontend typecheck passed.
- Next production builds passed for both storefront and Admin (`NEXT_PUBLIC_BASE_PATH=/manage`).
- 25 relevant backend tests passed: admin, catalog lifecycle, media, storefront controls and PDP content.
- After final source-image updates, all 3 PDP tests passed again, including migration preservation and Save/Publish separation.
- 91 client tests passed.
- Local browser verification uses isolated API fixtures, not production: twelve PDPs plus a body-cream control at 1920 px and 390 px; all FAQ questions, image decoding, no horizontal overflow, no page errors; Admin tab state, Save/Publish separation, crop dialog, failure state and delete cancellation.
- All 28 browser checks passed. Full-page screenshots were captured after scrolling every section to ensure offscreen images were painted.

## Visual limits retained intentionally

- Responsive mobile stacking, line wrapping, spacing and individual image crops are not claimed to be pixel-identical to the desktop Figma compositions.
- Review content/counts remain actual application data; sample review records from the design are not fabricated.
- The unchanged hero/footer retain their existing appearance.
- Original image assets are retained; image size optimization is outside this change.

Deployment, when separately authorized, requires API, Admin and storefront updates plus migration 031. No migration or deployment was performed against production during this task.
