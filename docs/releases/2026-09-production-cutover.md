# September 2026 production cutover record

Date: 2026-09-12

Candidate application SHA: `5cf4aa9c9ea7600e5916912c5fb1fc725428a345`

Final decision: **PRODUCTION RELEASE: BLOCKED**

This was a fail-closed Phase 8.1 cutover assessment. No remote migration, seed, ETL, fixture, cleanup, test write, schema push, deployment, cron invocation, email, SMS or payment operation was performed. No credential or PII is recorded here.

## Release gate

The mandatory pre-cutover `pnpm release:check` ran against a new loopback-only disposable PostgreSQL 16 target, never against the remote target. The local canonical migration chain, seed/catalog data and E2E fixtures were prepared only for that gate. The result was PASS:

- Typecheck: 10/10 tasks.
- Lint: 3/3 tasks.
- Standard test gate: 1,019 passed, 2 intentional skips, 0 failed.
- Dependency audit, full and production: 0 Critical, 0 High, 6 accepted Moderate, 0 Low.
- Web production build: PASS.
- Admin production build: PASS.
- Release manifest: candidate SHA `5cf4aa9`, Node `v22.19.0`, pnpm `9.15.4`, desktop `0.3.5`, repository migration `0040_shallow_mephistopheles`.
- Phase 8 production security E2E: 4/4 passed after the operations admin fixture was applied to the disposable target.
- Cargo check: PASS; Cargo test: 75/75; Cargo audit: 0 vulnerabilities and 9 previously accepted maintenance/unsound warnings.
- Gitleaks v8.30.1 full history: 400 commits, approximately 19.36 MB, no leaks found.

The first security E2E attempt on the fresh disposable database had two admin-auth failures because its operations admin fixture had not yet been seeded. It made no remote call. After adding that fixture locally, the unchanged candidate passed 4/4.

The exact disposable container `ogun-phase81-gate-20260912` and its anonymous data volume were removed after validation.

## Remote database read-only evidence

| Field | Safe value |
| --- | --- |
| Host | `ep-calm-heart-b1bm3vy6.c-5.eu-central-1.aws.neon.tech` |
| Database | `neondb` |
| Target fingerprint | `2444-D8A3` |
| PostgreSQL | `18.6 (2078fcb)` |
| Neon project ID | `proud-forest-22005498` |
| Neon branch ID | `br-twilight-brook-b1vhy4yi` |
| `pg_trgm` | present |
| Migration before | `0037_cool_madripoor` |
| Migration after | `0037_cool_madripoor` (unchanged) |
| Repository latest | `0040_shallow_mephistopheles` |

`pnpm release:db:check` connected read-only and returned migration compatibility BLOCKED. The guarded migration preflight denied the request before migration execution because remote-write opt-in, valid environment classification and expected target confirmations were absent. This is the required fail-closed behavior.

The database exposed stable Neon project and branch IDs, but not a trusted development/staging/production label. Repository/local configuration labels this connection `APP_ENV=local`; this is not production classification evidence. No Neon API/console session or operator mapping was available to resolve the branch ID to an environment label.

Final classification: **UNKNOWN**.

## Vercel and database mapping

Vercel CLI authentication provided read-only project/deployment metadata:

- The linked project is `ogun-web` (`apps/web`) and its latest production alias is `https://ogun-web.vercel.app`.
- Existing production deployment ID: `dpl_66iNKkJt9iinWVQK8DnZTZjexKW6`; status READY; created 2026-09-10. Its Git SHA was not available in returned metadata, so it cannot be identified as the candidate.
- No Ogun admin Vercel project or `apps/admin/.vercel/project.json` mapping exists in the accessible team.
- `DATABASE_URL` is registered as one encrypted Vercel variable scoped to both Preview and Production. The CLI could not return a verifiable non-empty value, so equality with fingerprint `2444-D8A3` cannot be proven.
- Preview and Production therefore have `same DB target = UNKNOWN`. Their combined variable scope is itself a configuration risk that must be split and verified before release.
- Vercel Development has no registered application variables. Local root and web env files point to the same remote target but both say `APP_ENV=local`; they are not trusted deployment mapping evidence.

| Consumer | Configuration | DB target relationship | Classification |
| --- | --- | --- | --- |
| `apps/web` production | Project exists; encrypted DB record exists; value unverifiable | UNKNOWN | UNKNOWN |
| `apps/admin` production | Project/mapping missing | NOT CONFIGURED | UNKNOWN |
| Preview | DB record shares Production scope; value unverifiable | UNKNOWN | UNKNOWN |
| Development | No Vercel app variables; local files only | local files reference `2444-D8A3` | DEVELOPMENT config label, remote branch classification UNKNOWN |

## Production environment validation

The canonical validator was run against the values retrievable from the real linked Vercel Production environment. It returned `PRODUCTION_ENV: FAIL`. Existing encrypted records could be listed, but their values could not be validated; required records below that were absent from the list are definite failures.

| Category | Status | Evidence without values |
| --- | --- | --- |
| Database | UNKNOWN/FAIL | `DATABASE_URL` record CONFIGURED but value/format/target unverifiable; `APP_ENV` missing |
| Web auth | UNKNOWN/FAIL | web secret and URLs CONFIGURED but values unverifiable |
| Admin auth | FAIL | admin secret, admin URL and admin project missing |
| Email | UNKNOWN/FAIL | Resend records CONFIGURED but values/format unverifiable |
| SMS | FAIL | no external SMS provider configuration; implementation remains manual |
| Payment provider | FAIL | payment mode, base URL and Iyzico credentials missing |
| S3/files | UNKNOWN/FAIL | endpoint/bucket/access records CONFIGURED but values/format unverifiable |
| Cron | FAIL | `CRON_SECRET` missing |
| Operational jobs | FAIL | `OPERATIONAL_JOBS_ENABLED` missing |
| Sentry/monitoring | FAIL | Sentry environment/DSN configuration missing |
| Public origins | FAIL | `OGUN_WEB_URL` and `NEXT_PUBLIC_SITE_URL` missing; Better Auth URLs unverifiable |
| Desktop/update | PASS for current disabled-updater artifact policy | no server secret is expected in desktop; no new desktop deployment performed |

Safe validator result:

```text
APP_ENV: FAIL
DATABASE_URL: FAIL
BETTER_AUTH_SECRET: FAIL
ADMIN_BETTER_AUTH_SECRET: FAIL
AUTH_SECRET_ISOLATION: FAIL
BETTER_AUTH_URL: FAIL
ADMIN_BETTER_AUTH_URL: FAIL
OGUN_WEB_URL: FAIL
NEXT_PUBLIC_SITE_URL: FAIL
GOOGLE_OAUTH: PASS
RESEND: FAIL
CRON_SECRET: FAIL
OPERATIONAL_JOBS_ENABLED: FAIL
S3_ENDPOINT: FAIL
S3_CREDENTIALS: FAIL
IYZICO_MODE: FAIL
IYZICO_CREDENTIALS: FAIL
PRODUCTION_ENV: FAIL
```

## Migration gap analysis

### `0038_backfill-provider-event-namespace.sql`

- Purpose: set `provider='iyzico'` on historical provider-sourced subscription events that already have a provider event ID but a null provider namespace.
- Type: bounded data migration; idempotent predicate-based `UPDATE`.
- Destructive/table rewrite: no deletion, column change or table rewrite. It updates matching rows and produces normal WAL/bloat.
- Lock risk: RowExclusive/table DML lock plus row locks on matched historical records; it may wait on concurrent writes touching those rows. Actual row count and contention must be assessed before a maintenance window.
- Runtime requirement: current `0037` application schema can boot without it and new events write a provider namespace.
- Correctness requirement: yes. Without it, historical replay/idempotency behavior can retain a duplicate-provider-event gap.
- Backward compatibility: compatible with old and new application code after `0037`.
- Operational risk: medium because it changes historical data and needs checkpoint plus observed execution.

### `0039_outgoing_colleen_wing.sql` — web/admin authentication rate-limit storage

- Purpose: create separate `admin_rate_limits` and `rate_limits` tables, each with a primary key and unique key index, for distributed Better Auth throttling.
- Type: additive DDL.
- Destructive/table rewrite: none; both tables are new and empty.
- Lock risk: low catalog/DDL locking; no rewrite or index build on an existing business table.
- Runtime requirement: the Phase 8 web/admin auth configuration expects these tables. Migration must precede deploying the candidate.
- Backward compatibility: old code ignores the new tables; additive and rollback-safe at the application level.
- Operational risk: low.

### `0040_shallow_mephistopheles.sql` — custom abuse-rate-limit storage

- Purpose: create `abuse_rate_limits` with hashed key, count, window start and expiry fields for distributed custom endpoint throttles.
- Type: additive DDL.
- Destructive/table rewrite: none; the table is new and empty.
- Lock risk: low catalog/DDL locking; no existing-table rewrite.
- Runtime requirement: Phase 8 support/reviewer/upload/public-share and related custom throttles require the table. Migration must precede deploying the candidate.
- Backward compatibility: old code ignores the new table.
- Operational risk: low.

Deployment order if all blockers are later cleared: confirmed Neon checkpoint/PITR → guarded ordered migrations `0038→0039→0040` → web production deployment → admin production deployment → read-only health/admin/web/security smoke → explicitly observed cron authorization/enablement. The migration runner must control ordering; do not execute raw SQL or `db:push`.

## Pre-migration GO / NO-GO

| Requirement | Status |
| --- | --- |
| Target classification = PRODUCTION | UNKNOWN |
| Production target fingerprint confirmed by operator record | UNKNOWN |
| Web production points to target | UNKNOWN |
| Admin production points to target | FAIL |
| Backup/PITR/checkpoint available and recorded | NOT RUN |
| Migration 0038 reviewed | PASS |
| Migration 0039 reviewed | PASS |
| Migration 0040 reviewed | PASS |
| Production env schema against real config | FAIL |
| `release:check` | PASS |
| No active incident | UNKNOWN |
| Working tree clean before assessment | PASS |
| HEAD equals expected candidate SHA | PASS |

Decision: **NO-GO**. The guarded preflight failed closed; no backup/checkpoint was created or claimed, and migration execution was not attempted.

## Existing production read-only smoke

This checks only the pre-existing deployment and is not a post-deploy acceptance result:

- `https://ogun-web.vercel.app/giris`: HTTP 200.
- `https://ogun-web.vercel.app/`: HTTP 200.
- `/api/health/live`: HTTP 404.
- `/api/health/ready`: HTTP 404.
- HSTS: present.
- Phase 8 CSP: absent.
- Private `no-store`/`noindex` policy: absent on inspected pages.
- Admin smoke: NOT RUN; no admin production deployment exists.
- Cron smoke: NOT RUN.
- Provider connectivity: NOT RUN; no email, SMS or payment was triggered.

The currently deployed web artifact is older than the Phase 8 production contract and cannot satisfy release acceptance. No deployment was attempted because database, environment, backup and admin blockers precede deployment.

## Release decision

| Gate | Status |
| --- | --- |
| Code | PASS |
| Security | PASS |
| Tests | PASS |
| Production env | FAIL |
| Remote DB classification | UNKNOWN |
| Backup/checkpoint | NOT RUN |
| Migration 0038 — provider namespace historical backfill | PENDING |
| Migration 0039 — separate web/admin auth rate limits | PENDING |
| Migration 0040 — custom abuse rate limits | PENDING |
| Web deployment | NOT RUN |
| Admin deployment | NOT RUN |
| Production smoke | NOT RUN |
| **FINAL** | **BLOCKED** |

## Exact blockers to clear

1. Resolve Neon project `proud-forest-22005498` / branch `br-twilight-brook-b1vhy4yi` to an operator-approved PRODUCTION mapping and confirm fingerprint `2444-D8A3`.
2. Separate and verify Preview versus Production database mappings; confirm both web and a real admin Vercel production project use the intended targets.
3. Complete the canonical production environment matrix and obtain `PRODUCTION_ENV: PASS`, including admin auth, public origins, cron/jobs, S3, email, payment intent/credentials and monitoring.
4. Confirm no active incident and create/record a real Neon PITR/branch checkpoint with timestamp before any write.
5. Run the guarded preflight with explicit expected host, database and production fingerprint confirmation; then apply canonical migrations once, stopping on any failure.
6. Verify remote latest `0040` read-only, deploy the candidate to web and admin, and complete health, admin, web, cron-authorization and production security smoke checks.

Until every item is closed:

```text
CODE READY
SECURITY READY
PRODUCTION RELEASE: BLOCKED
REMOTE WRITE: BLOCKED
```
