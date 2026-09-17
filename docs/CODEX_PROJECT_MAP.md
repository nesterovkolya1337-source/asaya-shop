# ASAYA project map

Task 1 baseline, 16 September 2026. The current requirements are
`ASAYA_TZ_Codex_v10_1_CODEX_OPTIMIZED_FINAL.docx`, supplied by the owner.
Older specifications and preview notes are historical, not implementation authority.

## Repository and runtime

- Repository: https://github.com/nesterovkolya1337-source/asaya-shop
- Working branch: `codex/v10`; do not merge or push changes to `main` without approval.
- Frontend: Next.js 16 / React 19, `src/app`, `src/components`, `src/lib`.
- Backend: Fastify / TypeScript / PostgreSQL, `backend/src/app.ts` and `server.ts`.
- Schema: `backend/migrations`; migration ledger: `schema_migrations`.
- Deployment configuration: `compose.yaml`, `deploy/catalog/compose.yaml`,
  `deploy/Caddyfile`, `deploy/nginx.conf`, Dockerfiles.
- Intended routing: Caddy HTTPS proxy, Nginx static storefront, Next admin on
  port 3200, backend on port 3100, private PostgreSQL service.

## Feature locations

| Area | Files |
| --- | --- |
| YCP | `backend/src/ycp-catalog.ts`, `ycp-checkout.ts`, `ycp-orders.ts` |
| Checkout button | `src/components/yandex-buy-button.tsx`, `src/lib/yandex-checkout.ts` |
| Customer login | `backend/src/auth.ts`, `otp-policy.ts`, `smsaero.ts`, `customer-account.ts` |
| CDEK status | `backend/src/cdek-delivery.ts`, `order-tracking.ts`, `cdek-webhook-setup.ts` |
| Catalog | `backend/src/admin-catalog.ts`, `src/lib/backend-catalog.ts`, `shop-provider.tsx` |
| Site editor and legal | `backend/src/site-content*.ts`, `site-legal-defaults.ts`, `src/components/admin-site-editor.tsx` |
| Legal release | `backend/scripts/publish-legal-v10.ts`; explicit plan/apply, see `docs/TASK_2_LEGAL_RELEASE.md` |
| Analytics | `backend/src/analytics-report.ts`, `product-analytics.ts`, `src/components/admin-analytics.tsx`, `src/lib/product-analytics.ts`; legacy statistics API retained |
| Tests | `tests/*.test.mjs`, `backend/tests/*.test.ts` |

## Commands

From repository root: `npm run build`, `npm run lint`, `npm run test:client`.
From `backend`: `npm run build`, `npm test`, `npm start`.
Backend integration tests use disposable data; never point them at production.
`npm run migrate` changes a database and requires the separate approved migration step.
Deployment, restart, and subscription registration are not part of Task 1.

## Mandatory boundaries

Yandex Checkout sends orders to CDEK. ASAYA must not create a Fulfillment order,
shipment or waybill. Fulfillment is only a possible stock source.
Use SMS Aero as the ordinary OTP transport with the available standard sign.
Keep automated customer/order cleanup disabled; implement manual admin handling
in its assigned task. Secrets remain outside Git.

## Baseline caveats

See `docs/V10_BASELINE_STATUS.md` before reusing existing code or installers.
The production commit and migration ledger are not freshly verified: the audit
SSH connection was rejected due to local key permissions. Existing deployment
notes and release reports must not be mistaken for current server evidence.

## Task 10 update, 17 September 2026

See `docs/TASK_10_ANALYTICS.md` for AN-01–AN-07 implementation, metric definitions,
tests and additive migration 027. This analytics update is not deployed and 027
has only run on disposable test databases. Production publication and the full
Task 11 reconciliation are separate steps. Catalog prices remain administrator-managed.
