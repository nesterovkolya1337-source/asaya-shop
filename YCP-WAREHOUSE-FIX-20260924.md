# YCP warehouse eligibility correction — 2026-09-24

Current Yandex/CDEK flow delegates delivery geography to the provider. `can_fulfill` and `served_localities` remain stored for backwards compatibility, but no longer gate YML, redirect, basket/check or checkout creation. No wildcard or warehouse-profile mutation is required.

YCP warehouse selection: active AND ycp_export_enabled. Sale availability additionally requires current publication, Sales ON and positive fresh/healthy REAL quantity after the existing stock ceiling and reserves. Missing/zero/stale stock stays unavailable without removing a published offer. Test stock is ignored.

CDEK mapping uses canonical products.sku and ever_published. Hidden/archived historical SKUs retain stock identity; never-published or unknown provider articles warn without stopping valid items. Missing ASAYA articles are not coverage errors. No lifecycle, price, shipment or credential migration.

Remaining legacy reads: warehouses.ts loads served_localities into the compatibility profile and lists both fields for staff; warehouseEdit/save still validate/store legacy edits and audit them. ycp-catalog.ts accepts the deprecated configuration field (empty/omitted allowed). No runtime eligibility checks consume either field. Migration 017 and existing audit data remain unchanged.

Targeted verification covers production-mode database profile with false/empty legacy fields, reserved quantities, YML, redirect, basket and pickup checkout without locality; stale/unhealthy/missing stock, operational warehouse flags, test-stock isolation, Sales OFF and idempotent existing checkout; historical mapping and never-published drafts. Other existing YCP/order/stock suites remain targeted regression coverage.
