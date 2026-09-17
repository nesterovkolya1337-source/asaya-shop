# Task 8 — migration reconciliation and manual privacy operations

Authority: ASAYA v10.1, ADMIN-07, DATA-01–02, SEC-01. No production deployment or existing-database migration is authorized by this task.

Status: **PARTIAL overall**. The bounded manual operation and disabled cleanup are implemented and locally verified. The actual production/persistent-local migration ledger is unverified, so migration reconciliation is not claimed complete. The interface offers selective contact cleanup, not full account erasure.

## Migration review (before any application to an existing database)

| Migration | Purpose and dependency | Risk and rollback |
| --- | --- | --- |
| 020_customer_account | Depends on users/orders and YCP sessions (003/004/013). Adds profiles, normalized phone, claims, phone function/index. Backfills associations for placed YCP orders, but creates no login session. | Writes historical contact associations and takes table/index locks. Invalid phones remain unmatched. Snapshot prices/items are not rewritten. Restore a verified pre-migration backup if reversal is necessary; do not blindly drop profiles/claims after new writes. |
| 021_otp_delivery_receipts | Depends on OTP challenges (003). Adds nullable provider/message/status fields. | Additive metadata only; no full provider body or OTP. Keep columns during code rollback; removing them can break newer code. |
| 022_order_logistics | Depends on orders. Creates logistics cache/history and legacy fulfillment job tables. | Includes obsolete ASAYA dispatch schema alongside required tracking. Do not rewrite an applied migration/checksum. Dispatch is blocked by v10.1 startup guard. Keep tables on code rollback to preserve tracking/idempotency/history; no destructive down migration. |
| 023_unpaid_order_retention | Depends on orders. Adds legal_hold, pii_purged_at and a partial index. | No cleanup is executed by this SQL. Old cleanup code is now disabled independently of configuration. Keep flags on rollback; restoring an earlier application must not re-enable automatic cleanup. |

**Status:** SQL 020–023 is already committed and unchanged by Task 8. Disposable local test databases have applied them successfully during previous tasks. Their application to a persistent local database or current production is **not verified**. Task 0 could not read the production migration ledger because SSH authentication failed; historical deployment messages are not current ledger evidence.

**Application gate:** before any persistent/production application, read `schema_migrations` names/checksums and compare exact committed SQL, record the target database and current commit, take and verify a database/config backup, review the pending migration list and obtain separate permission. The migration runner is transactional and rejects changed checksums. Do not edit already-applied SQL or infer current state from the migration filenames. No existing database was migrated in this task. Fresh disposable test databases contain synthetic data only.

## Manual operation and boundaries

The admin order screen offers a read-only preview followed by a separate confirmed POST. Only enabled administrators with a staff session, same-origin request and CSRF token can apply it. The operator must type the order number and confirm the selected contacts are permissible to clear. A revision of the selected records is checked inside a locked transaction; stale previews and legal holds block mutation. Successful and business-blocked operations write actor, time, target, fixed reason code, scope and result into the audit log, without copying contacts into that log.

Two deliberately limited scopes:

- **Order contacts:** only a definitively YCP-cancelled order with failed/cancelled payment and no payment, shipment, dispatch, fulfillment or logistics record. Removes customer/delivery contact snapshots from that order and its checkout, clears normalized contact phone, marks the operation time. Keeps order lines, monetary facts, consent, ownership, profile link and status/audit history.
- **Optional profile fields:** clears the linked profile's name/email only, with linked order numbers shown and legal hold checked across them. Verified login phone/identities and historical order contacts remain. The UI explicitly explains this is not whole-account erasure.

The scope is not a statutory full-erasure workflow: identities, retained order/payment records, external providers and backups are not deleted. Requests requiring those actions need separate retention review; the interface must never claim complete removal of all personal data. No retention period or legal entitlement is invented by the application.

Automatic cleanup cannot be enabled: config rejects UNPAID_RETENTION_ENABLED=true, server does not start the worker, and both legacy worker/purge entry points fail closed. Ordinary technical log rotation and non-destructive reservation reconciliation are unaffected.

## Validation and delivery

**20 distinct backend tests passed**, zero failures: eight manual privacy/auth/concurrency tests, ten fulfillment/tracking regressions (legacy dispatch uses test fixtures only), and two migration replay/editor-preservation tests. Repeated runs are not counted twice. The migration replay test now compares the entire actual migration-name set instead of the obsolete fixed count 23. Backend TypeScript, frontend TypeScript, targeted ESLint and diff whitespace checks passed.

The real admin interface was tested at 1440 and 390 pixels using intercepted synthetic API responses, with all external network requests blocked. Typed confirmation, consent checkbox, exactly one POST with CSRF, success handling and legal-hold blocking passed with no JavaScript errors. Screenshots were visually inspected. Evidence outside Git: `outputs/task8-browser-check.json`, `outputs/task8-privacy-1440.png`, `outputs/task8-privacy-390.png`. The browser check does not claim production acceptance.

Changed files: `backend/src/admin-privacy.ts`, `app.ts`, `config.ts`, `server.ts`, `order-retention.ts`, `retention-worker.ts`, `.env.example`; `backend/tests/admin-privacy.test.ts`, `fulfillment-tracking.test.ts`, `migrations.test.ts`; `src/components/admin-privacy.tsx`, `admin-orders.tsx`; this report. No new or rewritten migrations.

LOCAL: implemented/tested for the documented selective scopes. ADMIN-07: protected manual operation implemented, whole-account erasure not claimed. DATA-02: automatic cleanup disabled. DATA-01: migration replay and snapshot/contact preservation verified locally. GITHUB: commit and push to `codex/v10`, no merge. PRODUCTION: no deployment, cleanup, migrations, SMS, payments or shipments. The production ledger check and explicit backup/application approval remain before release. Stop and ask permission for Task 9.
