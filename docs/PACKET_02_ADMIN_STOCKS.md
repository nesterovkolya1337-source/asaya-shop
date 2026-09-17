# Packet 02 — Admin analytics stocks

Implemented 2026-09-17. Production unchanged.

The Stocks tab reads `StockState`, the shared provider snapshot introduced in packet 01. Canonical name comes from products; category and thumbnail from published canonical content (unpublished drafts do not replace live canonical metadata). Missing content is labelled unknown, never inferred from the provider.

The screen shows provider quantity, successful fetch and source generation times, freshness, missing SKU and refresh errors. This YML source exposes count only: no invented available/reserved columns. No quantity editor or stock-copy table was added. Unconfigured runtime explicitly shows unknown quantities.

Staff-only GET `/api/admin/v1/analytics/stocks` and POST `/api/admin/v1/analytics/stocks/refresh` use existing session, origin, CSRF and no-store protection. POST accepts an empty object only. Refresh uses the same StockSync as the worker, including PostgreSQL cross-process lock, persisted next-attempt time and backoff. Error preserves the last successful snapshot. Frontend route forwarding is included.

Validation:
- Backend build and 19 stock integration tests passed, including catalog/YCP HTTP gates, unauthenticated rejection, CSRF/origin, rejected quantity payloads, concurrent refresh, changed source quantity 3→7 after allowed sync, and error preservation.
- Two stock client tests and three existing analytics client tests passed; typecheck, targeted lint and Next production build passed.
- Browser fixture checks at 1440 and 390px: zero vs missing, refresh outcome, error preservation, no quantity input and no page overflow. Screenshots inspected. Browser fixtures are not live Yandex/CDEK evidence.
- Fresh real-source comparison through AdminStocks on a disposable database (2026-09-17 18:16:24 UTC, generation 18:05 UTC) matched all 13 SKUs. Controls: `1S-BA-01`, `1S-BA-02-01`, `1S-HK-01`: provider=0, shared layer=0. No positive physical stock change has been observed; change propagation is proven with isolated fixtures only.

Deployment remains separate: migration 028 and stock runtime configuration are prerequisites for this screen's source diagnostics. No migration, live quantity, provider configuration, order or shipment was changed by this task.
