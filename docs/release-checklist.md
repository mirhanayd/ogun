# Production release checklist

Date: 2026-09-12

Do not interpret code-level PASS as deployment authorization. The current candidate is blocked until the remote target is classified and migration `0038` is applied by an authorized human through the guarded procedure.

## Change control and database

- [ ] Freeze a reviewed git SHA and record `pnpm release:manifest` output.
- [ ] Confirm working tree is clean and the candidate is reachable from protected `master`.
- [ ] Confirm 0 open Critical and 0 open High security findings/dependency advisories.
- [ ] Complete `pnpm audit`, production-only audit, Cargo audit and full-history secret scan.
- [ ] Classify the remote database from trusted provider/deployment metadata; never infer from hostname.
- [ ] Create and verify a restorable DB backup/checkpoint.
- [ ] Confirm `pg_trgm` extension exists before a clean-chain migration; canonical migration `0000` requires `gin_trgm_ops`.
- [ ] Run sanitized `db:migrate:check` with expected host/database and change record.
- [ ] Run read-only `pnpm release:db:check`; repository and target migration state must be compatible.
- [ ] Have a second person verify target fingerprint and migration plan.
- [ ] Apply pending migrations manually with the guarded remote-write variables; never use `db:push`.
- [ ] Record post-migration journal state and health; do not roll back additive migrations destructively.

## Environment, build and verification

- [ ] Validate web and admin environment sets separately with `pnpm release:env:check`; retain only PASS/FAIL output.
- [ ] Confirm web/admin auth secrets differ and all canonical URLs are HTTPS/non-placeholder.
- [ ] Confirm private S3 bucket policy, scoped credentials, CORS and lifecycle retention.
- [ ] Confirm `PAYMENTS_MODE` agrees with Iyzico base URL and release intent.
- [ ] Run `pnpm release:check` in CI/disposable infrastructure; it must not migrate, seed or ETL a remote DB.
- [ ] Build web and admin from the frozen SHA.
- [ ] Run root typecheck, lint and tests with the documented local write-test flags.
- [ ] Run canonical Chromium and Phase 8 security Playwright suites.
- [ ] Run clinical reviewer, food, subscription and operations Playwright suites.
- [ ] Run `cargo check`, `cargo test` and Cargo audit for the desktop lockfile.
- [ ] Verify desktop updater is disabled, or configure HTTPS endpoints and a non-empty verification public key; keep signing private key outside repository/artifact.
- [ ] Verify the desktop bundle contains no DB/auth/provider/storage secrets.

## Manual production smoke

- [ ] `/api/health/live` and `/api/health/ready` return minimal expected responses.
- [ ] Admin login requires MFA; inactive/non-platform users remain denied.
- [ ] Clinic password login, email verification and password reset complete with canonical links.
- [ ] Google login returns only to the canonical configured origin.
- [ ] Clinic switching preserves membership/tenant boundaries.
- [ ] Support ticket create/reply works and internal notes remain hidden from clinic users.
- [ ] Reviewer invite, assignment, wrong-account denial, replay denial and publish permission work.
- [ ] Food search works; draft/external mutation boundaries remain enforced.
- [ ] Subscription page and intended provider mode are correct; provider IDs/tokens are not editable/projected.
- [ ] Cron/job health is visible to authorized staff; missing/wrong cron secret is rejected.
- [ ] Sentry receives a synthetic redacted event in the intended EU project with no request body/query/PII.
- [ ] Desktop password/Google deep link, one-time-token exchange, secure storage and logout/revocation work.
- [ ] Rollback/forward-fix owner, communication route and recovery threshold are recorded.

## Current mandatory stop

```text
Remote DB latest: 0037
Repository latest: 0040
Production classification: UNKNOWN
Result: BLOCKED
```

The stop can be cleared only after classification, backup, approved guarded `0038` migration and read-only post-check. Phase 8 does not authorize or perform that write.
