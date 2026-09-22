# Reviews, referrals, replenishment and product archive

Prepared for GitHub review only. No deploy or production migration performed.

## Customer and manager flows

- Account Overview offers review forms for confirmed purchases. Submission is pending.
  Admin → Marketing → Reviews supports show, hide-valid, reject (spam/duplicate/abuse),
  and store replies. Public PDP reads only published server reviews; browser-local
  reviews and their unsupported rating summary are no longer rendered there.
- First approved valid review earns 100 points, irrespective of rating. Hiding a valid
  review does not reverse an award. Rejections earn nothing. One review per customer
  and product; ledger source key review:<customer>:<product> makes retries idempotent.
- Account provides a personal /account/?ref=<code> link. The invited customer signs
  in with existing SMS login before checkout. Attribution is server-side, first-write,
  before any existing order; self/customer and normalized-phone matches are rejected.
  Inviter earns 200 points from the existing confirmed-paid loyalty hook, once per
  invitee via referral:<invitee>. Registration, pending/cancelled orders and the
  invitee receive no referral award. No changes to YCP/CDEK protocol.
- Marketing draft/live settings hold per-product intervals 0/30/45/60/90 days.
  Account computes reminders from the latest confirmed paid non-cancelled purchase.
  Repeat purchase resets the timer. No SMS/email/push, discount, reward, auto-order
  or automatic cart action. Existing Save/Publish semantics are preserved.

## Lifecycle and Trash

Migration 037_engagement_trash.sql adds review/referral tables, product/media
deletion metadata, and monotonic products.ever_published. It is backfilled from
active products, editor publication evidence and publication audit entries.
Database triggers record future publication and prohibit clearing history or
physically deleting ever-published products.

- Never-published Draft → Trash: confirmation, 30-day retention, restore to Draft.
  Explicit confirmed purge can delete it sooner. Transactional references prevent
  deletion even if inconsistent legacy data labels such a product Draft.
- Published must first become Unpublished. Removal then means Archive.
  Archive has no retention deadline or permanent-delete UI; API and DB both reject
  its physical deletion. Restore returns Unpublished, never Published or Draft.
- Admin → Trash and archive is a single existing-lifecycle view. Archive retains
  order, stock, review, analytics, loyalty and audit history. No tombstones.
- Uploaded database media supports soft delete, restore and confirmed purge.
  Blob/master/derivatives survive soft deletion and are removed at permanent purge.
  References in retained active/archived cards and page drafts/publications prevent
  deletion. Static bundled /images files are not managed uploads and are excluded.
  Product deletion does not eagerly delete potentially shared media.

Cleanup runs with the existing serial worker helper every 300 seconds and on
API startup. It batches expired never-published Drafts and deleted uploads only.
Archives are excluded. Repeated runs are safe; protected historical/shared objects
remain retained. Orders/payments/ledger/stock history/logs/events/sessions are never
purged or rewritten by this job.

## Validation

43 backend targeted tests: engagement/Trash, admin lifecycle, Marketing, Loyalty,
and media. Five Admin-client tests. Backend TypeScript build, frontend typecheck
and Next webpack production build. Tests use temporary local PostgreSQL and mock
SMS; no production requests, payments or outbound notifications.

Future deployment needs migration 037 and API + Admin + storefront. Not deployed.
