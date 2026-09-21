# Customer account bootstrap incident — 2026-09-21

## Exact production versions (container OCI revision labels)
- Storefront: dc4e25da408b53de224808d54386ef11b457643c
- API: 73384e046a7efbd27c77d58b579078abeafd6c71

Actual affected URL is /account/ (confirmed by the owner). /profile/ returns 404; no new route was added.

## Cause and evidence
Root filesystem was 100% full: 60G total, 57G used, zero available. PostgreSQL was restarting (105+ restarts), logging `FATAL: could not write lock file "postmaster.pid": No space left on device`.

Initial ServerAccountView.refresh runs auth/me and auth/methods concurrently. No SMS request is made. auth/methods returned 200 with {yandex:false,orders:true,sms:true}. Without a cookie, auth/me returned 401 UNAUTHENTICATED before accessing the database. With a synthetic expired cookie, auth/me accessed the database and returned 500 INTERNAL_ERROR (requestId dc490c69-7786-4ef3-90c0-0c9e2bb05b62). The browser then displayed the exact reported retry/error screen. A profile request is not needed to reproduce this failure; unauthenticated account/profile correctly returned 401.

This is database unavailability, not an SMS provider problem or a frontend/API schema mismatch. Treating every 500 as an unauthenticated guest would conceal the outage and would not make OTP or valid sessions work.

## Minimal operational recovery, no deploy
Removed only unused Docker build cache older than 24 hours (`docker builder prune --force --filter until=24h`). Reclaimed 5.479 GB; filesystem then had 4.4G available (93% used). Images, volumes, backups and source releases were not deleted. PostgreSQL recovered automatically; database and API became healthy. No container image/revision change, migration or application deploy.

## Verification
- Same expired-cookie auth/me request now returns 401 UNAUTHENTICATED, not 500.
- Live browser /account/ displays telephone field and +7; entering a formatted number enables Request code. No page JS error observed. No real SMS was sent.
- Local regression checks distinguish 500 from 401 and restore valid sessions after retry. Local browser fixtures exercise OTP request/verification and restored-session dashboard without sending SMS.
- Product, stock, marketing, YCP, CDEK and application runtime code unchanged. This commit contains only the regression test and this incident report.

The disk remains 93% used; this recovery is not a storage-capacity or retention-policy project. Valid production customer sessions were not impersonated or extracted; that path is verified with existing local fixtures. No claim of a real SMS delivery test.
