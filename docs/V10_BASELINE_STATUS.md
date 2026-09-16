# Preserved implementation baseline

This snapshot preserves previous local development for Task 1 of specification
v10.1. It is not a release, acceptance of all requirements, or deployment approval.
The owner authorized only restoration of GitHub source history at this stage.

## Work preserved

Backend API, migrations 001–023, tests, editor, customer account, provider
adapters, legal documents, frontend changes, fonts, and deployment configuration
are retained without changing application behavior. Root preview Markdown files
are historical implementation notes and may contradict v10.1.

## Known mismatches requiring later tasks

- Legacy Fulfillment submission code remains, gated off by default. Do not enable
  `FULFILLMENT_ENABLED`; v10.1 forbids ASAYA creating those orders or shipments.
- Legacy retention code remains, gated off by default. Do not enable
  `UNPAID_RETENTION_ENABLED`.
- SMS production guards still require a registered sender/template and must be
  reconciled with v10.1's ordinary SMS API decision in Task 7.
- The static cart still links to the old checkout. The Yandex button is separately
  gated; the canonical catalog and live stock synchronization are incomplete.
- Migrations 020–023 are preserved, not applied. Migration 022 mixes tracking
  tables with superseded Fulfillment jobs. Inspect the actual migration ledger
  before making changes; never rewrite an already applied migration.
- Manual customer anonymization and complete internal analytics are unfinished.
- GitHub Pages workflow and old auto-deployment scripts remain historical.
  Branch publication must not trigger them. Do not merge this branch into main.

## Evidence and limits

Task 0 confirmed public HTTP availability, no published backend products, disabled
customer order login, old cookies/status routes returning 200, and private APIs
rejecting unauthenticated reads. It did not establish the current production commit
or database migration ledger because SSH authentication failed.

Prior test results were separate runs: backend 188/189; focused order privacy 2/2;
provider checks 22/22; frontend logic 66/66. These are not a complete v10.1 pass.
No real payment, shipment, SMS, or production migration is authorized by this snapshot.
