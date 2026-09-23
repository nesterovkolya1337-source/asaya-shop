# Storefront typography — 23 September 2026

Scope: typography only, no deploy. User clarification supersedes the original two-font allowance: **Gramatika is the only storefront HTML/UI font**.

## Inventory and canonical family

Previously the storefront inherited Involve, while selected hero/PDP headings used Gramatika. The public missing-image placeholder also explicitly used Arial. Repeated interface sizes included 15/16/17 px for copy, 18/19 px for actions, and 23/24/25 px for small headings.

Both body/display family tokens now resolve to the existing locally hosted Gramatika face. No font was added. Regular, bold and slanted assets already exist. `next/font`'s generated Gramatika fallback is a loading fallback, not a second design font.

The shared customer header marks the storefront with `data-storefront`, independently of whether the announcement bar is enabled. The standalone SMS consent page has the same marker. `body:has([data-storefront])` applies the customer family without changing Admin inheritance. Existing Involve loading and Admin styles are retained for Admin only. The editor's own preview labels and staff packing sheet are not customer-facing and remain unchanged.

## Roles

Tokens are declared in `src/app/globals.css`; component CSS modules consume them. Family is Gramatika for every role below. Existing intentional responsive/composition variants are preserved rather than forcing every heading into the same dimensions.

| Role | Size / responsive variants | Weight | Line height | Tracking |
| --- | --- | --- | --- | --- |
| Hero / display | Existing 48–72 fluid hero; mobile 38–48; large static titles keep their existing scale | 400 / 500 | 1.04 hero; 1 static display | 0 hero; −.025em static |
| H1 | 48 UI / 32 mobile; existing page-specific clamps retained | 500 | Existing 1.15 UI; display variant above | 0 or heading token |
| H2 | 28 default; 24 compact; 26/30 section variants | 500 | 1.25; composition variants retained | 0 or heading token |
| H3 | 20; 22 emphasized | 500 | 1.25 / 1.4 | 0 |
| Body Large | 18 | 400 | 1.4 / 1.5 | 0 |
| Body | 16 | 400 | 1.5; 1.45 compact, 1.6 relaxed | 0 |
| Small / labels | 14 | 400 / 500 | 1.4 / 1.5 | 0 |
| Caption / meta | 12 / 13 | 400 | 1.2 / 1.4 / 1.5 by density | 0; .08em uppercase meta |
| Button / navigation | 16 action; 18 large action; existing 15 navigation | 400 / 500 | Inherited UI or existing 22px action line | 0 |
| Badge / micro | 10 / 11 / 12 | Existing 400 / 500 | Existing tight single-line height | Existing label tracking |
| Balance / metric | 40 / 34 mobile | 500 | 1.2 | 0 |

This table documents role defaults and deliberate variants, not new global element resets. Weight requests 500/600 retain CSS font matching against the existing Gramatika faces; no new font files or synthetic variable-font axis was introduced.

## Changes and boundaries

- 28 near-duplicate fixed-size declarations normalized: 15/17 → 16, 19 → 18, 23/25 → 24 where safe.
- Header navigation and compact product-card sizes preserved; shared tokens replace repeated literals without changing their values.
- Static/about/instruction heading tracking −.04…−.065em softened to −.025em for Gramatika; compressed .88 display leading becomes 1 to keep multiline text legible.
- Family/size/weight/leading/tracking tokens used in Home, Catalog, PDP/rich content/reviews, cart, auth/account/profile/orders, favorites, static/legal/instruction pages and header/footer.
- Grids, container widths, spacing, block sizes, colors, borders, shadows, images and content are unchanged. Only two JSX changes add the font-scope attribute; no behavior changed.
- No Admin module, backend, migration, business logic, price, stock or integration changes.

## Verification

- Storefront `npm run typecheck` and clean `npm run build -- --webpack`.
- CSS AST comparison against parent: all non-typography declarations and layout selectors unchanged, except the new font-only storefront scope selector. All typography custom-property references resolve.
- Browser checks at 1440 and 390: Home, Catalog, ordinary PDP, populated cart, login, Account Overview, Profile, static delivery page, header/footer. Account uses local fixture data; cart uses a local stock/pricing fixture over public catalog content. No SMS, checkout, production session or production write is used.
- Screenshots and computed-style evidence are delivered as local task artifacts. Current Gramatika computed family is checked across visible HTML text; representative pages are checked for overflow and text overlap.

Production remains unchanged. Review the commit and local screenshots before separately authorizing a deploy.
