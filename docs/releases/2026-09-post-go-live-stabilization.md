# Phase 8.3 — Post-Go-Live Stabilization

Date: 2026-09-13

Status: **CODE/LOCAL OPERATIONS COMPLETE; REMOTE VALIDATION BLOCKED**

Repository discovery found an explicit Phase 9 (`faz-9-masaustu-kabugu.md`), but README records issues #51–#54 and Phase 9 itself as complete. The repository also contains the later Phase 10 UI work. There is no unimplemented, explicitly approved next product phase, so this work intentionally stayed inside operational/security stabilization and did not invent a product feature. A new Phase 9 proposal was not created because an official Phase 9 already exists.

## Operations visibility

The existing `/sistem` dashboard now separates the operational states that previously collapsed into totals:

- support vs subscription pending and terminal e-mail;
- pending, processing, retryable, terminal and unknown SMS;
- processing, failed and duplicate webhook receipts;
- active job leases and running durable job records;
- existing latest job history, findings and reconciliation controls remain unchanged.

No migration or schema change was required. The query uses aggregate counts only and does not expose message bodies, phone numbers, recipients, provider payloads or other PII. Disposable PostgreSQL integration tests passed 5/5.

## Observability and log privacy

- Route error boundaries no longer write raw `Error` objects to the browser console.
- Errors are sent through the existing Sentry client initializer, whose `beforeSend` recursively scrubs PII and secrets.
- A root `global-error.tsx` now captures layout/render failures and renders no error details.
- Production builds use Webpack because the installed Sentry SDK reports incomplete client/server instrumentation under Turbopack. The former 13 unresolved instrumentation-package warnings and Sentry/Turbopack warning are gone. One Webpack cache serialization performance warning remains non-fatal and has no runtime correctness/security impact.
- Sentry DSNs are still not configured in Vercel, so remote error delivery remains operationally blocked.

## Backup and disaster recovery

The operator-provided production snapshot is `snap-lucky-pine-b11uhzpm` (`pre-phase8-2-production-2026-09-13`). It was not restored or mutated. Neon authentication was unavailable, so existence, retention, protected-branch state and a provider-side rehearsal could not be independently verified.

The current `0040` database shape was exercised with a local isolated logical restore:

1. `pg_dump -Fc` from the disposable release DB;
2. restore to a new empty PostgreSQL 16 database with `--no-owner --no-privileges --exit-on-error`;
3. comparison of migration ledger and seven representative operational/domain tables.

Source and restore matched exactly:

```text
migrations 41 | users 148 | clinics 55 | foods 129 | conditions 21505
operational_job_runs 7 | sms_reminder_deliveries 6 | provider_webhook_receipts 6
dump size 12.9 MiB
sha256 de575ce19025499632eb4ba1248308d531cb0eae7bfbab5949b8f82604495fe8
```

The dump existed only inside the disposable local container and is removed with that container.

Provisional planning targets, not contractual SLA commitments:

| Objective | Proposed target | Evidence / next validation |
| --- | --- | --- |
| RPO | 15 minutes | Confirm Neon history retention and snapshot policy on the active plan |
| RTO | 120 minutes | Measure provider-side snapshot-to-isolated-branch restore plus web/admin smoke |

Production restore remains incident-commander controlled. Always restore to an isolated branch first, keep delivery jobs disabled, compare ledger/counts and run read-only smoke before any traffic decision. Never run the repository restore script against production directly.

## Security and platform controls

- Production DB read-only compatibility check confirms repository and target at `0040` with ledger 41.
- Migration target guards passed 17/17 regressions; production was not mutated.
- Web/admin auth secrets are separate, and Preview secrets are separate from Production.
- Preview jobs/external delivery are fail closed.
- Local production-mode security E2E passed 4/4 in the full gate.
- GitHub Actions is enabled, but `master` currently has no branch protection and Actions does not require SHA-pinned actions. These are account-level security follow-ups, not code mutations performed without an owner policy decision.
- Neon protected branches are a paid-plan feature; plan/control-plane state was unavailable, so it was not enabled or claimed.
- Dependency policy remains 0 Critical/High for JavaScript. Rust and full-history secret-scan results are in the final walkthrough.

## Final verification

- `pnpm release:check` at code SHA `ce7a7a3ddb184c04c9a7dee15e89718fd3dddb17`: PASS.
- The gate emitted 1,025 pass / 3 skip; its opt-in distributed rate-limit test was then explicitly enabled and passed 1/1. The fully exercised set is therefore 1,026 pass / 2 intentional skip.
- Production-mode security HTTP E2E: 4/4 PASS.
- Typecheck 10/10, lint 3/3, canonical browser E2E 11/11, web build 62 pages, admin build PASS.
- JavaScript audits: 0 Critical, 0 High, 6 reviewed Moderate.
- Cargo check PASS; Cargo test 75/75; RustSec scanned 643 dependencies with 0 vulnerabilities and 9 accepted warnings.
- Immutable Gitleaks v8.30.1 full history: 408 commits, 19.41 MB, no leaks found.

## Release hygiene

- `.vercel` is ignored for nested apps; tracked `.env*`, phase temp files, logs and local dump artifacts were checked.
- Vercel OIDC `.env.local` files and control-plane temp directories are removed at closeout.
- The release DB/container is removed after all final checks.
- Automatic `master` deployments are temporarily frozen in both Vercel project configs until environment repair.
- Official Phase 9 exists and is already complete; no `docs/plans/phase-9-proposal.md` was created.

## Remote blockers

1. Web Production lacks approved Resend and S3 records; Admin Production lacks Resend.
2. Preview cannot boot until safe S3/Resend/auth origins and the admin Preview DB/web URL mapping are supplied.
3. No candidate web/admin deployment exists, so runtime logs, current-SHA health/security, admin MFA and cron authorization cannot be verified.
4. Neon snapshot/protected-branch/restore rehearsal requires an authenticated Neon control plane.

These blockers do not invalidate the code or disposable validation, but they prevent a production GO decision.
