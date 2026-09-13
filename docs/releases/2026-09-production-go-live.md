# September 2026 production infrastructure and go-live record

Date: 2026-09-13

Final decision: **PHASE 8.2 / PRODUCTION RELEASE: BLOCKED**

The database and local release gates are ready, but no new web/admin artifact was deployed. The Vercel environment contract is incomplete and production smoke therefore cannot pass. This record contains identifiers and variable names only; it contains no credentials or PII.

## Database and rollback state

| Item | Evidence | Result |
| --- | --- | --- |
| Production target | Operator-confirmed production mapping; safe fingerprint `2444-D8A3` | CONFIRMED |
| Production migration | Read-only `release:db:check`: target and repository latest are `0040_shallow_mephistopheles`; ledger 41 | PASS |
| Preview migration | Operator reports `0000–0040` and a DB distinct from production | REPORTED PASS; encrypted target not independently readable |
| Production snapshot | `snap-lucky-pine-b11uhzpm`, `pre-phase8-2-production-2026-09-13` | OPERATOR-PROVIDED; control-plane recheck blocked by missing Neon authentication |

The production migration was **not** rerun. Production never received `db:push`, seed, demo seed, ETL, fixtures, cleanup or test writes.

The repository's target guards were regression-tested: 17/17 tests passed. Remote push/seed/write-test operations remain unconditionally denied, and production migration still requires an explicit remote-write intent, exact host/database and the displayed fingerprint.

## Vercel projects and deployment freeze

| Project | Configuration | Deployment result |
| --- | --- | --- |
| `ogun-web` | Existing Next.js project, root `apps/web` | Existing older production artifact remains READY; no candidate deployment |
| `ogun-admin` | Project `prj_OSrlv2QQEu1hPWYRe5Cuvi0fL1F7`, GitHub linked, root `apps/admin`, framework corrected to Next.js | No deployment exists |

Both project configs now set `git.deploymentEnabled.master=false`. This reversible release freeze prevents a push from creating an invalid production artifact while required variables are missing. Remove the freeze only in the reviewed deployment commit after the environment validators pass.

Vercel applies environment changes only to new deployments, so the currently READY web artifact was not modified by the environment work. Sensitive values are write-only and cannot be recovered from the CLI/dashboard after creation.

## Environment state

### Admin Production

Configured: `APP_ENV`, `DATABASE_URL`, a newly generated `ADMIN_BETTER_AUTH_SECRET`, `ADMIN_BETTER_AUTH_URL`, `OGUN_WEB_URL`, `DATABASE_POOL_MAX`, `LOG_LEVEL`.

The admin secret is distinct from the web secret. The environment is still **FAIL** because `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are absent. Sentry remains optional by the application contract but is an operational recommendation.

### Admin Preview

Configured: `APP_ENV=staging`, a separate newly generated `ADMIN_BETTER_AUTH_SECRET`, `DATABASE_POOL_MAX`, `LOG_LEVEL`.

Preview derives its exact auth origin from Vercel's deployment URL and forbids Resend credentials, making external e-mail fail closed. It is still **FAIL** because the encrypted Preview `DATABASE_URL` could not be recovered from the web project and `OGUN_WEB_URL` has no safe deployed Preview URL yet.

### Web Production

Configured records: `APP_ENV`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, Google OAuth pair, `OGUN_WEB_URL`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, `OPERATIONAL_JOBS_ENABLED=false`.

Missing required records: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. The production runtime contract is therefore **FAIL**.

### Web Preview

Configured records: the operator-created isolated `DATABASE_URL`, `APP_ENV=staging`, a newly generated Preview-only `BETTER_AUTH_SECRET`, `OPERATIONAL_JOBS_ENABLED=false`, `EXTERNAL_DELIVERY_ENABLED=false`.

Production Google, e-mail, S3 and auth-origin records are absent from Preview. It is side-effect safe but cannot start because the web contract still requires S3, Resend and auth origins.

### Environment correction incident

While splitting shared Preview/Production records, `vercel env rm <key> preview` removed the whole shared project record instead of only its Preview target. This removed the Production records for Google OAuth, auth origins, Resend and S3. Google OAuth and auth origins were safely restored from an existing ignored local source. The original Resend and production S3 values were neither readable from Vercel nor available in an approved local source, so they were not guessed or replaced with local credentials.

No deployed artifact was changed and no new deployment was attempted. Before the next deployment, rotate/re-enter the affected Resend and S3 credentials rather than assuming the former records still exist.

## Smoke and logs

Read-only smoke on the existing production aliases:

| URL | Result |
| --- | --- |
| `https://ogun-web.vercel.app/api/health/live` | 404 |
| `https://ogun-web.vercel.app/api/health/ready` | 404 |
| `https://ogun-web.vercel.app/giris` | 200 |
| `https://ogun-web.vercel.app/sifremi-unuttum` | 200 |
| `https://ogun-admin.vercel.app/api/health/live` | 404; no admin deployment |

The old web responses expose HSTS but not the candidate's CSP, MIME, frame, referrer, no-store and noindex policy. A privacy-safe aggregate Vercel runtime-log query for the previous 24 hours returned no records; this is insufficient to prove runtime health. No cron, provider, e-mail, SMS, payment or reconciliation side effect was invoked.

## Verification

The initial full local `pnpm release:check` passed on a loopback-only PostgreSQL 16 target:

- 1,026 passed, 2 intentional skips, 0 failed;
- DB 147, web 460 + 1 skip, admin 33, ETL 198, nutrition 142, e-mail 6, subscription 4, PDF 10, desktop Node 15;
- canonical Playwright 11 passed / 1 packaged-native skip;
- production security HTTP E2E 4/4;
- full and production pnpm audit: 0 Critical, 0 High, 6 reviewed Moderate;
- web build 62 pages and admin build passed.

Post-gate stabilization changes additionally passed:

- admin typecheck/lint and operations DB integration 5/5;
- web typecheck/lint, monitoring 23/23 and Webpack production build (62 pages);
- database write-safety regression 17/17.

The final full-gate result is recorded in `docs/releases/2026-09-post-go-live-stabilization.md` and the root walkthrough.

## Acceptance decision

```text
PRODUCTION DB 0040           PASS
PRODUCTION/PREVIEW DB SPLIT  OPERATOR CONFIRMED
SNAPSHOT                     OPERATOR CONFIRMED / API RECHECK BLOCKED
LOCAL RELEASE GATE           PASS
WEB PRODUCTION DEPLOY        NOT RUN
ADMIN PRODUCTION DEPLOY      NOT RUN
PREVIEW DEPLOY/SMOKE         NOT RUN
PRODUCTION HEALTH/SECURITY   FAIL (OLD ARTIFACT)
PRODUCTION ENV               FAIL

PHASE 8.2: BLOCKED
```

Phase 8.2 can become GO only after the missing web/admin Production and Preview variables pass their validators, the deployment freeze is removed in a reviewed commit, both projects are deployed from the same final SHA, and the complete Preview/Production smoke matrix passes.
