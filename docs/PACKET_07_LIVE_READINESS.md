# Packet 07 — live acceptance readiness (NOT executed)

No live order, payment, shipment, webhook registration, migration or deployment was performed in this packet run. The owner's instruction to continue independently authorizes implementation of remaining files, not the separate real-money/production actions required by file 07.

Known prerequisites still unmet:
- Reviewed release of current API/admin/public artifacts; production stock configuration and pending migration 028. Preserve the existing storefront until canonical catalog is ready, as previously instructed.
- At least one published canonical product with administrator-approved price, dimensions and positive actual FF stock. Latest read-only source comparison on 2026-09-17 18:16 UTC: all 13 source SKUs had quantity 0. Never replace these with test stock in production.
- Confirm exact documented transport for a pre-redirect merchant attempt/order identifier if Yandex supports it. Current express instruction contains only items. Existing ASAYA-N is returned at server POST /checkout; no fake round-trip guarantee is made.
- Separate authorization for live release/migrations, webhook registration and minimal paid purchase. Payment/CloudKassir readiness must be checked at that time.

Ready acceptance sequence:
1. Record reviewed commit, source SKU/quantity/time and matching Admin Stocks value.
2. Add one unit, open Yandex from cart and record the ASAYA server order number plus YCP session/order IDs. Verify basket/check prices and purchase ceiling.
3. Complete one approved payment; confirm one finalized ASAYA order and one Yandex-created CDEK shipment. Stop at the first mismatch.
4. Read that exact shipment with authenticated CDEK GET. Confirm entity.number against ASAYA-N before using correlation `--bind`; retain UUID/tracking/account/environment only, no raw customer payload.
5. Confirm webhook/GET updates that order, no duplicate stock consumption or payment, CloudKassir receipt and ownership via verified customer phone.
6. Compare source and ASAYA stock after the next source generation; record analytics without customer PII.

Evidence template: commit; SKU; source/ASAYA stock before+after with timestamps; ASAYA-N; YCP session/order IDs; CDEK UUID/tracking/entity.number; payment status; shipment count=1; status history; receipt confirmation; customer ownership check. Blank fields mean unverified, not passed.
