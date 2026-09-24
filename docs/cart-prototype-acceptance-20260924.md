# Cart prototype + remaining five-spec acceptance, 2026-09-24

No deployment. Branch: `codex/cart-pdp-admin-final-20260924`.
Visual baseline: ASAYA_Cart_Prototype.docx + user's black/white/grey clarification. Prior backend/business rules and production gates remain unchanged.

## Changes
- Cart: one summary card; desktop delivery inside summary, mobile delivery before product rows using one DOM instance; white automatic discount status (no dismiss action), compact white promo preview, pink loyalty with dark star, separate financial rows/strong total/black amount CTA.
- Promo UI only renders for the existing server capability; public promo application remains disabled. No redemption action is invented while redemption is unavailable. Guest/zero/positive balance states preserved.
- Cart media no longer passes saved crop to CroppedImage, so derivatives are uncropped and actual object-fit is contain. No backend media changes.
- One checkout button moves to sticky when its original anchor is outside usable viewport, above OR below; top 80px excludes fixed header. Anchor and button height kept stable, margin removed only in cart context. Help remains above sticky.
- Secondary clear action after product rows. Two-line product/recommendation titles. Large three-card desktop recommendation rail, 72% mobile cards, circular arrows, hidden native horizontal scrollbar, favourite/discount badge, direct Add only.
- Customer CSS roles use Gramatika. Admin shell explicitly retains its existing Involve font. All four bundled Gramatika fonts match the user ZIP by SHA-256.
- No pricing, stock, publication, promo attribution, YCP, CDEK, or migration changes.

## Verification
- Frontend targeted tests: 12/12 (cart-presentation, cart-stock, pdp-presentation, responsive-media).
- Backend targeted tests: 10/10 (pdp-content, storefront-controls, promocodes); isolated PostgreSQL only.
- Clean webpack production build and TypeScript passed. An old webpack cache initially retained old CSS despite updated source; cache moved out and clean build rechecked. The only built CSS reference to Involve is Admin shell.
- Rendered DOM font-family on home/catalog/about/account/PDP/cart: Gramatika only. Mobile overflow false on all six. TTFs are byte-identical to Gramatika.zip.
- Cart 1440: one and ten products; ten rows in 660px list with 1605px scrollHeight. Pump/spray tiles contain. Three large recommendation cards; arrow scroll changes scrollLeft. Mobile 390: two rows, summary, balance 0/500/guest; rail, footer/help. Sticky below main CTA=true, visible=false, above=true; one checkout button.
- PDP: existing Top / Reviews / Rich Content / Recommendations / Footer unchanged. Empty reviews displayed. Desktop four cards (323px each at x=29/377/725/1073). Mobile 168px rail. Main buy visible => sticky display:none; after scroll => display:grid. Screenshots 1440/390.
- Rich media: normal viewport compared with original composition-440-3062.png and its WebP. Hard horizontal collage boundaries are present in original PNG too, not introduced by browser/full-page stitching; asset left unchanged.
- Editor: hide first Result, middle Lifehack, last FAQ; edit hidden Lifehack; Save / load from server preserves new content. Global OFF / Save / reload / ON / Save / reload preserves individual Hidden flags. Restore first/middle/last => latest Lifehack text preserved. Local test text restored. Published lifecycle unchanged. Existing implementation not rewritten.
- Settings: Store / Integrations / System screenshots; mobile tabs; Marketing without Sales. Sales OFF->ON->OFF through Store: all 10 public product objects byte-equivalent, including real availability; only globalSalesEnabled changed. Banner text/link Save->reload preserved. Fixture sales re-opened only for cart acceptance; production never touched.

## Evidence
Local photo report: `outputs/final-packet-acceptance-20260924/index.html` (outside repository, absolute project root in delivery report).
Key images: cart-desktop-summary, cart-mobile-summary, cart-desktop-one, cart-desktop-ten, cart-media-contain, cart-desktop-recommendations, cart-mobile-recommendations, cart-mobile-cta-below, cart-mobile-cta-above-help; pdp-desktop-top, pdp-mobile-top, pdp-mobile-original-cta-visible, pdp-mobile-sticky-after-scroll, pdp-desktop-four-recommendations, pdp-mobile-recommendations, pdp-reviews-rich-boundary, pdp-rich-media-viewport; editor-hidden-edit-reloaded, editor-global-off, editor-global-on-hidden-preserved, editor-restored-latest-content; settings-store-banner-reload, settings-integrations, settings-system, settings-mobile-tabs, marketing-without-sales.

## Residual NOT DONE / deliberately gated
- Real redemption Use/Apply/applied state and prototype screenshots showing successful redemption: not enabled and not faked. Safe YCP correlation still required. Promo-to-order attribution also remains gated; localhost visual preview is explicitly not production.
- Separate cart image screenshot of a set: not captured because local published fixture selection has no sets. Pump, spray and wider bottle are covered; all use the same uncropped contain component.
- User visual approval of the new prototype implementation remains pending. No claim of production rollout or full package DONE.
