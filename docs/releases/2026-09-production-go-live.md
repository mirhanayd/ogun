# September 2026 production infrastructure and go-live record

Date: 2026-09-13

Candidate application SHA: `0e1d27f68c9ec4133824b4243e907779c7ee719c`

Final decision: **PRODUCTION RELEASE: BLOCKED**

This is the fail-closed Phase 8.2 infrastructure provisioning record. The required operator confirmation was not supplied, and no authenticated Neon CLI, API or linked browser control-plane session was available. Consequently, no remote migration, seed, ETL, fixture, database branch creation, environment mutation, deployment, cron invocation, email, SMS or payment operation was performed. No credential or PII is recorded here.

## Production database

| Field | Result |
| --- | --- |
| Neon project | `proud-forest-22005498` |
| Production branch candidate | `br-twilight-brook-b1vhy4yi` |
| Safe fingerprint | `2444-D8A3` |
| Classification | **UNKNOWN** |
| Last trusted migration evidence | `0037_cool_madripoor` (Phase 8.1 read-only evidence) |
| Repository migration | `0040_shallow_mephistopheles` |

Stable project/branch identifiers and the safe fingerprint identify a target, but do not prove its operational role. The local repository configuration labels the connection as local, not production. Neon CLI was unavailable, no authenticated Neon API/console or linked browser session was present, and the operator did not provide the exact required mapping:

```text
Project proud-forest-22005498
Branch br-twilight-brook-b1vhy4yi
Fingerprint 2444-D8A3
= OGUN PRODUCTION DATABASE
```

Production classification therefore remains UNKNOWN. No branch label was changed and no remote write preflight was attempted.

## Preview database

| Field | Result |
| --- | --- |
| Branch | NOT CREATED |
| Isolated from production | NO / UNKNOWN |
| Data policy | Synthetic fixtures required; production health/client data must not be copied merely for convenience |

Creating a preview branch was blocked by the unresolved production mapping and missing authenticated Neon control plane. The current Vercel `DATABASE_URL` record is jointly scoped to Preview and Production and its encrypted value cannot be inspected safely, so separation cannot be proven.

## Vercel projects

| Project | Result |
| --- | --- |
| `ogun-web` | EXISTS; project ID `prj_1P3rBmbSU94wI0E3DVbIxeRWGk4i`; Next.js; root `apps/web`; current production alias `https://ogun-web.vercel.app` |
| `ogun-admin` | NOT CREATED / NOT CONFIGURED |

Vercel CLI 56.2.0 was authenticated to `mirhanayd-5803`. The existing web deployment `dpl_66iNKkJt9iinWVQK8DnZTZjexKW6` is READY but predates the candidate and does not satisfy the Phase 8 production contract. No partial admin project was created because database classification, preview separation, admin domain and environment prerequisites are unresolved. A production admin domain must be explicitly selected from the real domain strategy; it was not guessed.

## Environment validation

| Scope | Status | Missing or unresolved canonical keys |
| --- | --- | --- |
| Web Production | **FAIL** | Missing: `APP_ENV`, `ADMIN_BETTER_AUTH_SECRET`, `ADMIN_BETTER_AUTH_URL`, `OGUN_WEB_URL`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, `OPERATIONAL_JOBS_ENABLED`, `PAYMENTS_MODE`, `IYZICO_BASE_URL`, `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`. Configured but value/target validation unavailable: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, Google OAuth keys. Operational monitoring keys `SENTRY_DSN` / `SENTRY_ENVIRONMENT` are absent. |
| Web Preview | **FAIL** | The same unresolved encrypted `DATABASE_URL` record is scoped to both Preview and Production. Production external-provider records are also shared. Preview-only `OPERATIONAL_JOBS_ENABLED=false` and side-effect-safe provider intent are not configured. |
| Admin Production | **FAIL** | Project absent; at minimum `DATABASE_URL`, `ADMIN_BETTER_AUTH_SECRET`, `ADMIN_BETTER_AUTH_URL`, `OGUN_WEB_URL`, mail and monitoring configuration are not configured on an admin project. |
| Admin Preview | **FAIL** | Project and isolated Preview mapping absent. |

This table exposes names and status only, never values. The canonical production schema test passed locally, but the real production mapping cannot pass until encrypted values are securely validated and all required keys are configured. SMS remains manual/no external provider. Monitoring is an operational go-live requirement even though Sentry is optional in the code-level validator.

## Backup/PITR

Checkpoint/PITR verification: **NOT RUN**.

No authenticated Neon control plane was available and the target was not production-confirmed. Therefore no restore point or safety branch was created and no checkpoint ID or timestamp is claimed. After confirmation, verify Neon restore/history capability and create a dated pre-0040 checkpoint before any migration.

## Migration

```text
Before: 0037_cool_madripoor (last trusted read-only evidence)
After:  0037_cool_madripoor (no remote write; not re-read in Phase 8.2)
Pending: 0038, 0039, 0040
```

- `0038_backfill-provider-event-namespace.sql`: predicate-based historical `UPDATE`; no destructive DDL or table rewrite. It takes ordinary DML/row locks, writes WAL and may wait on concurrent updates. It closes the historical provider-event namespace correctness gap and is compatible with the old deployed application.
- `0039_outgoing_colleen_wing.sql`: additive creation of empty `admin_rate_limits` and `rate_limits` tables plus unique indexes. No existing-table rewrite; low catalog-lock risk. Old code ignores it; the candidate requires it.
- `0040_shallow_mephistopheles.sql`: additive creation of empty `abuse_rate_limits`. No existing-table rewrite; low catalog-lock risk. Old code ignores it; the candidate requires it.

### Deployment compatibility matrix

| Application / database | Classification | Reason |
| --- | --- | --- |
| Old app + DB 0038 | Compatible | Data correction only; old code ignores the corrected namespace value safely. |
| Old app + DB 0039 | Compatible | Additive tables are ignored by old code. |
| Old app + DB 0040 | Compatible | Additive table is ignored by old code. |
| New app + DB 0037 | Not compatible | Distributed auth and abuse limiter tables are absent. |
| New app + DB 0038 | Not compatible | Tables from 0039 and 0040 are absent. |
| New app + DB 0039 | Not compatible | Custom abuse limiter table from 0040 is absent. |
| New app + DB 0040 | Compatible | Candidate schema requirements are present. |

Required order after all blockers are cleared: operator-confirm target -> separate Preview -> validate web/admin environments -> create and record checkpoint -> guarded preflight -> canonical migrations `0038 -> 0039 -> 0040` -> read-only post-check -> web/admin deploy at the current `origin/master` SHA -> production smoke. Raw `drizzle-kit migrate`, raw SQL and `db:push` are prohibited.

The final guarded `db:migrate:check` was **NOT RUN** because operator confirmation, environment validation and checkpoint gates did not pass. Running it with remote-write opt-in before those gates would violate the fail-closed contract.

## Deployment

| Target | SHA | URL | Result |
| --- | --- | --- | --- |
| Web candidate | `0e1d27f68c9ec4133824b4243e907779c7ee719c` | `https://ogun-web.vercel.app` is the existing older deployment | NOT DEPLOYED |
| Admin candidate | `0e1d27f68c9ec4133824b4243e907779c7ee719c` | NOT ASSIGNED | NOT DEPLOYED |

No deployment or Vercel configuration mutation was performed.

## Health

Read-only checks against the existing web deployment on 2026-09-13:

| Endpoint | HTTP status |
| --- | --- |
| `/api/health/live` | **404** |
| `/api/health/ready` | **404** |
| `/giris` | 200 |
| `/sifremi-unuttum` | 200 |

The health acceptance requirement is 200/200. Admin health and authenticated admin/MFA/dashboard smoke were not run because there is no admin deployment.

## Security production smoke

The local production-mode security E2E suite passed 4/4 against the disposable PostgreSQL target: web/admin headers, secure cookies, hostile-origin rejection, internal-job fail-closed behavior, minimal health responses and representative CSP behavior all passed.

The existing production web response does not match that candidate behavior. HSTS is present, but inspected responses lack CSP, `nosniff`, frame protection, referrer policy and `X-Robots-Tag`; inspected auth pages also return public cache policy instead of the required private/no-store policy. Production security smoke is therefore **FAIL**. No production auth account was created or mutated.

## Cron

Production cron: **NOT CONFIGURED / NOT VERIFIED** (`CRON_SECRET` and `OPERATIONAL_JOBS_ENABLED` are absent from the web project variable list).

Preview cron isolation: **NOT VERIFIED**. Safe first reconciliation run: **NOT RUN**. No SMS reminder, email retry or other side-effecting job was triggered.

## Operational findings

| Severity | Count | Finding |
| --- | ---: | --- |
| Critical release blockers | 8 | Production DB classification, operator confirmation, Preview isolation, production env, admin project/domain, checkpoint/PITR, pending migrations, production deployment/smoke |
| Dependency Critical/High | 0 | Full and production pnpm audits passed the release policy. |
| Dependency Moderate | 6 | Previously reviewed and accepted dependency findings. |
| Rust vulnerabilities | 0 | `cargo audit` scanned 643 dependencies. |
| Rust warnings | 9 | Previously accepted maintenance/unsound advisories; Linux release remains subject to its recorded GTK-tree constraint. |

No production monitoring, drift reconciliation or operational job history could be validated without the missing configuration and deployment.

## Tests

The mandatory `pnpm release:check` passed end-to-end on a newly created loopback-only PostgreSQL 16 container:

- Production environment validator schema: PASS.
- Typecheck: 10/10 tasks.
- Lint: 3/3 tasks.
- Standard gate: 1,019 passed, 2 intentional skips, 0 failed.
- Database tests: 147/147 with every canonical write-test flag enabled.
- Web: 460 passed / 1 provider-specific skip.
- Admin: 26/26; ETL: 198/198; email: 6/6; nutrition: 142/142; subscriptions: 4/4; PDF: 10/10; desktop Node: 15/15.
- Canonical Playwright: 11 passed / 1 packaged-native skip.
- Full and production pnpm audit: 0 Critical, 0 High, 6 Moderate.
- Web production build: PASS, 62 generated pages.
- Admin production build: PASS, 5 generated static pages.
- Release manifest: Node `v22.19.0`, pnpm `9.15.4`, desktop `0.3.5`, repository migration `0040_shallow_mephistopheles`.
- Security production-mode E2E: 4/4.
- Cargo check: PASS; Cargo test: 75/75; Cargo audit: 0 vulnerabilities and 9 warnings.

Only the disposable target received migrations, seed/catalog data, clinical/RxNorm/Ogun ETL and E2E fixtures. Its exact container and anonymous volume were inspected and removed after validation.

## Git

The assessment started with a clean tree and `HEAD == origin/master == 0e1d27f68c9ec4133824b4243e907779c7ee719c`. This release record and the root walkthrough update will be committed logically and pushed by normal fast-forward. No force push or secret-bearing file is permitted.

## Exact manual actions required

1. An authorized operator must provide the exact production mapping confirmation shown in the Production database section.
2. Authenticate Neon CLI/API or provide an authenticated Neon console session; record the primary/production metadata without exposing credentials.
3. Create an isolated synthetic-data Preview branch and split Vercel Production/Preview `DATABASE_URL` scopes.
4. Select the real admin production domain, create `ogun-admin` from the same repository with root `apps/admin`, and configure separate admin auth credentials.
5. Complete web/admin Production and Preview environment matrices; keep Preview jobs and real provider side effects disabled; obtain validator PASS.
6. Verify PITR and record a pre-migration checkpoint, then run the guarded fingerprint-confirmed preflight and canonical migration wrapper.
7. Verify remote migration `0040` with zero pending, deploy both projects from current `origin/master`, and complete health, headers, auth/MFA, cron authorization, monitoring and drift smoke checks.

## FINAL

```text
CODE READY
SECURITY READY
LOCAL RELEASE GATE PASS
REMOTE DB CLASSIFICATION UNKNOWN
PREVIEW DATABASE NOT CREATED
PRODUCTION ENV FAIL
REMOTE WRITE BLOCKED
PRODUCTION RELEASE: BLOCKED
```
