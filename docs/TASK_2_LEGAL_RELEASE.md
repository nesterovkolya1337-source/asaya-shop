# Task 2 — legal text and service routing

Authority: specification v10.1, Appendices A–C, edition 13 September 2026.
`backend/tests/fixtures/legal-v10.1.json` contains the independently extracted
116 offer, 79 privacy and 54 consent paragraphs/table cells. The existing legal
defaults match all 249 exactly; only their source attribution was updated.

## Code changes

- Separate, initially unchecked consent in the legacy demo checkout. Offer
  acceptance and optional marketing remain separate. The test-only checkout uses
  fictitious data. The real Yandex transition is Task 4, not implemented here.
- Support copy no longer makes photographs a prerequisite for a complaint.
  Requisites use the approved customer-support mailbox.
- Legal headings wrap on narrow displays; document words remain unchanged.
- HTTP 301 cookie redirect is present in Caddy, Nginx and server-mode Next.
  Historical Yandex merchant URLs `/offer`, `/payment`, `/return` redirect to
  `/legal/offer/`, `/delivery/`, `/returns/`. Static export cannot itself return
  HTTP 301; deploy the accompanying proxy configuration, not just HTML.

## Explicit content publication — future approved deployment only

Changing defaults alone does not replace previously published CMS documents.
The release utility therefore prepares a reviewable snapshot/plan and applies
it only with a separate explicit command. It is not a migration, startup hook,
scheduled job or part of the build.

Prerequisites: approved deployment commit, verified database backup/restore plan,
existing `site_pages` schema (including migration 019), and an active admin UUID.
Production migration status is still a Task 8 prerequisite; this task applies none.
Use the server's protected environment for `DATABASE_URL`; never paste it in commands.

From `backend`, after its build:

```text
node dist/scripts/publish-legal-v10.js --plan /PRIVATE_PATH/legal-v10.1-plan.json
```

Review the snapshot's before/after content, then, only after deployment approval:

```text
node dist/scripts/publish-legal-v10.js --apply /PRIVATE_PATH/legal-v10.1-plan.json ADMIN_UUID
```

Scope: the three legal pages, delivery, returns, support, requisites, and targeted
cookie/contact changes in header/footer. Custom header branding, geometry,
promotion and unrelated navigation are retained. FAQ/general UI belong to Task 9.
The utility checks every current revision before writing, publishes all pages in
one transaction, rejects customer/disabled accounts, and adds audit entries.
It refuses stale plans/replays. Existing private editor drafts are retained;
review or restore them to the new published version before publishing them later.
The private plan also retains previous published content and metadata for rollback.
Never commit that deployment snapshot. If publication must be reverted, restore
the affected pages from the reviewed snapshot/backup under separate permission;
do not replace the whole database just to roll back these pages.

After deployment: check HTTP 301 and Location, all three rendered documents,
support contacts, menu/footer links, and the editor's public preview. No deploy,
production database write or migration was performed during Task 2.

## Verification

- Backend TypeScript compilation and 5/5 focused legal/publication tests passed.
  Database checks ran only in a disposable local PostgreSQL instance.
- Production static build passed (62 routes). Browser checks at 1440 and 390 px
  found every source paragraph/table cell on each legal page. Both required
  checkboxes and optional marketing are initially unchecked and separate.
- Server-mode Next HTTP checks: `/legal/cookies/` returns 301 to
  `/legal/privacy/`; `/offer/`, `/payment/`, `/return/` return their configured 301.
  Next first normalizes the no-slash cookie URL with 308; Caddy/Nginx configurations
  explicitly return direct 301 for both forms. Those two servers are not installed
  locally, so their runtime check remains part of deployment smoke verification.
- No new migrations. Production content remains unchanged until approved release.
