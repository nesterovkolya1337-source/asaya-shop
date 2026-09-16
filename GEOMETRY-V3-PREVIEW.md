# Geometry v3 — local verification, 2026-09-14

Source: the user explicitly supplied [Website (Copy), Page 2](https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=1-2) after the original specification file was inaccessible to the Figma integration. Metadata confirmed canvas `1:2` is named `Page 2`. Design context and screenshots were read for `148:1237`, `148:1239`, `150:1645`, and `150:1646`. The measurements match v3. Reference outputs are saved under `outputs/tz-v3-review/figma` in the parent workspace.

## Changes

- Home desktop hero aspect ratio: 1159 / 594.9448. Same image, `public/images/figma/hero.webp` (1800 × 2251; SHA256 `ebb69a54c8c16f2c06b1566e620852f2f4fc884695d620bfbd50e9ea10810d4f`). Figma image height 243.57% and top −35.35% translate to object-position 24.6235%. Compared side by side with the reference. Existing home copy, button and header remain; the reference's old copy and 1500-ruble shipping threshold are not imported. Mobile keeps its separate crop and height.
- New scoped `product-layout.module.css` supplies reusable width/gap/column rules to the existing ProductCard, home rail, catalogue and recommendations. Desktop cards use 370:500, three columns, 24.75px gap; catalogue editorial tiles share the outer ratio. Mobile cards keep the existing 340px minimum and two-column catalogue/scrolling rails.
- PDP top row uses 540:600 columns and 20px gap. Its current content determines height, with a 530px gallery minimum. The media panel stretches to match information; images use contain. The thumbnail list scrolls within the desktop row instead of setting its intrinsic height. Mobile stacks naturally. No hard 530px clipping of text and no copy/checkout changes.
- The existing global content width/gutters, transparent/sticky header, category blocks and business logic are untouched. At the site's existing 1200px viewport the inner width is 1152px (24px gutters), so the columns are proportionally 536.2px / 595.8px with a 20px gap. They are exactly 540px / 600px at an inner width of 1160px. This preserves the global layout frozen in v3.

## Evidence

Static build and TypeScript passed (`outputs/tz-v3-review/geometry-build.log`). `work/check-v3-geometry.cjs` serves only the local static build and aborts external browser requests. It checks home/catalogue/PDP at 1200, 1440, 1920, 768 and 390px; all 17 current product variants; expanded and long information; image fit; whole-card title clicks and independent favourite/cart controls. All passed. These interactions use the existing isolated static preview, not live stock or payments.

Measurements: `outputs/tz-v3-review/geometry-check.json`; screenshots in `outputs/tz-v3-review/screenshots`; crop comparison in `outputs/tz-v3-review/geometry-comparison.html` and `screenshots/hero-side-by-side.png`. Fixed site navigation/purchase controls are visible in PDP screenshots; column boundaries are also verified from actual browser measurements.

Nothing has been published. This closes the local geometry work, not the entire v3 specification or the full CMS crop editor. Backend code did not change in this geometry phase; the owner's 168/168 backend result remains applicable.
