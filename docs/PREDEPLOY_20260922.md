# Exact release scope — 2026-09-22

## Observed production baseline

Read from running Docker containers and migration ledger, not inferred from dates:

- API: `73384e046a7efbd27c77d58b579078abeafd6c71` (SMS Aero).
- Admin: `b622ee57f68ad68e76ab914ac6d18af86090ba3e`.
- Storefront: `dc4e25da408b53de224808d54386ef11b457643c` (Dashboard already deployed).
- SQL 001–030, 032, 033 applied. All 32 Git LF checksums match. 031 is intentionally absent (excluded PDP).

## Full history after the SMS commit

| Task | Exact commits | Components | Migration/config | Release status |
|---|---|---|---|---|
| Phone login / dashboard / width | 3442a21236ec047da21e642fef388221439ef24a, 7615aa44418bdb905a8e404ea1fede7dd7bcad3a, dc4e25da408b53de224808d54386ef11b457643c | Storefront | None | Complete; already public |
| Marketing and canonical quantity pricing | 6d346d43f6fae630710d8446cb6e52d95ad46590, 1484d2c69e1a6d2e8c16ae9e89ef6fd47a4e978a | API/Admin/storefront | 034 | Complete |
| Interim kopeck quantity pricing | a93df9ced149d0aff8fe58b5db7e5b244ab63e79 | API | None | Superseded by 1484d2c; no kopeck quantity discounts |
| Loyalty ledger, immutable snapshots, cashback, balance/history | a6c9e7be84b35d8c643d31e4512074056d65320f | API/Admin/storefront | 035 | Complete independent subset only |
| Personal redemption / provider financial refunds | a6c9e7be84b35d8c643d31e4512074056d65320f | API | No runtime enablement | Partial, excluded; refund prototype removed in release reconciliation |
| Account outage diagnosis/retry tests | 144efa04b68ab8d1077004223ba09f218e4509cf | Tests/docs | None | Complete; no SMS behavior change |
| Stock runtime/preflight + official FF API adapter | 353e5decf16de4ffba86f6e7180f442f35451a3d, 50e2b72c6ff71779ca9307ec8f207c58e4cd6e70 | API/Admin | 036 | Adapter complete; production activation blocked on protected FF secret |
| Scheduled 300s stock sync | bcc775a0d6f0c6e03e0fb6e8617749d3ad2d0ff7, 6ef77358e001733bf6b987cad7607361119747af | API worker | CDEK_STOCK_SETTINGS_FILE | Code complete; activation excluded until live authenticated preflight |
| Reviews +100 / referral +200 / replenishment | 9140263b3f0484f5eb4fe75531d038bed1216d63 | API/Admin/storefront | 037 | Complete; uses shared ledger, no outbound reminders |
| Product archive / draft Trash / media soft delete | 9140263b3f0484f5eb4fe75531d038bed1216d63 | API/Admin | 037; internal cleanup every 300s | Complete |
| Release reconciliation | Commit containing this document | API/Admin/storefront | No additional migration | Missing Admin proxy routes, /profile alias, fixture compatibility; remove unconnected refund prototype |

## Exclusions and isolation

- No personal redemption intent, debit, callback linkage or checkout discount endpoint is deployed. `redemptionAvailable` is hard false. Checkout still uses canonical non-personal pricing. Reserved schema fields and a pure limit calculator are not redemption enablement.
- The unconnected financial refund method and its prototype tests are removed from the release source; preserved in Git at a6c9e7b for later work. Automatic financial refunds remain incomplete. This separates the deployable ledger/rewards subset from that prototype.
- FF worker stays OFF unless a protected production FF login/password file is provided and authenticated live preflight passes. No chat credentials, ordinary CDEK OAuth credentials, stale YML, or invented stock are substituted. Adapter/migration can safely be installed without its opt-in file.
- New Figma PDP renderer, styles and migration 031 remain excluded. Reviews replace the prior browser-local review block only.
- Existing Yandex/CDEK order creation, dispatch ownership, SMS provider settings, canonical prices and publication flags are not changed. ASAYA fulfillment dispatcher remains forbidden by production config.

## Compatibility findings

- New Admin uses `/manage/api/...`; Caddy forwards `/manage/*` to Next. Missing Trash/media-delete/review-moderation rewrites would produce 404. Added exact routes, not a catch-all. Customer engagement routes also work through Next previews. `/profile` redirects to existing `/account/`.
- 034–037 are additive and ordered; 035 ledger exists before 037 rewards. 037 backfills monotonic `ever_published` from active/editor/audit evidence, then protects it with SQL triggers. Earlier published products cannot enter physical purge; archived products retain history and can restore as Unpublished.
- Review and referral rewards insert into `loyalty_ledger` using unique `review:customer:product` and `referral:invitee` keys. No second balance. Cashback keeps its own `purchase:order` namespace.
- Stock adapter uses one-way Published coverage. Unknown or unpublished articles become diagnostics; valid articles continue. Missing ASAYA articles are unavailable, not mapping errors. REAL stock readers share existing stock layer; test stock remains frontend-only. No publication mutation.
- Marketing saves drafts separately from live publication. Final discounted unit price floors to whole rubles once; cart, YCP basket and checkout use the same canonical calculation.

## Validation and rollout constraints

- Targeted backend groups: marketing, loyalty, engagement/Trash, stock API/source/worker, customer account/SMS, YCP checkout, Admin, media; plus Yandex feed and basket contracts.
- Targeted client tests and Next typecheck/production build.
- Desktop 1440 and mobile 390 fixture checks: Dashboard/login/OTP states, tabs, profile, orders; Marketing draft/publish/defaults/permissions and cart pricing.
- Fixtures do not send SMS/payments or create CDEK shipments. Production smoke must label real-session/SMS checks separately from fixtures.
- Build exact Git archive; verify checksums and current service baseline before mutation. Verified fresh DB/config backup before migrations. Preserve prior frontend static assets. Roll back application images on failed critical health checks; additive migrations remain recorded.
- Before starting cleanup against production, inspect eligible expired objects. Do not use a candidate API against production if its background cleanup could delete existing objects during preflight.
