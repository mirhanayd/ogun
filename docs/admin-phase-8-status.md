# Ogun Admin — Phase 8 status

Date: 2026-09-12

Phase 8 code and disposable validation are complete. Ogun now has explicit distributed auth/custom abuse limits, migration-safe email ownership verification, hardened reset/cookies/origins/headers, cross-clinic IDOR coverage, bound object-upload intents, least-privilege application environments and Tauri capabilities, dependency/secret/Rust security gates, production environment validation and a deterministic release runbook.

## Security outcome

- Web/admin Better Auth rate limits use distinct PostgreSQL tables. Admin login/MFA and web login/signup/reset/verification rules are explicit.
- New password signups cannot auto-login before email verification; existing legacy identities are not blindly locked out. Signup returns the same envelope for existing/new addresses.
- Password reset revokes normal sessions and passwords have explicit 8–128 bounds.
- Clinic, platform and clinical-review roles remain independent; two-clinic query tests cover client, appointment, support, document, device, user/member, recipe and plan denial.
- Browser-cookie custom mutations enforce same-origin. Tauri bearer, cron bearer and signed provider calls retain mechanism-appropriate exceptions.
- Web/admin enforce nosniff, deny framing, strict referrer/permissions policy, HSTS in production, no-store/noindex for private surfaces and an enforced no-wildcard/no-general-eval CSP.
- App configs no longer broadly ingest root `.env`; local sync is explicit, app-specific and output-redacted. Production validation prints only PASS/FAIL.
- Upload confirmation binds client/key/size/type to a signed intent and verifies remote metadata plus magic bytes. Keys are random, signed URLs are five minutes and downloads re-check clinic/client/document scope.
- Tauri has constrained IPC/opener/filesystem/deep-link policy. Updater cannot be enabled without HTTPS plus a public verification key; server secret names are rejected from desktop sources/artifacts.
- Pino/Sentry scrub nested errors, tokens and common PII; Sentry strips query/fragment and does not send arbitrary request bodies.

## Supply chain and release automation

Targeted patched versions removed all Critical/High `pnpm audit` findings. Weekly grouped Dependabot covers pnpm, Cargo and Actions. Workflow permissions default to `contents: read`; Actions are immutable-SHA pinned; untrusted PR code receives no production secrets. Security CI runs application checks, production audit, RustSec, full-history secret scan and JS/TS CodeQL.

Root release commands:

```text
pnpm release:env:check   real production variables; safe PASS/FAIL only
pnpm release:env:schema  static validator availability
pnpm release:db:check    read-only repo-vs-target migration compatibility
pnpm release:check       no migration, seed or ETL write
pnpm release:e2e         canonical Chromium suite
pnpm release:security:e2e production HTTP security suite
```

Final local verification:

- `release:check`: PASS, including typecheck, lint, both production builds and release manifest.
- Standard test gate: 1,019 passed and 2 intentionally skipped (one packaged-native desktop E2E and one provider-specific web test).
- Phase 8 production security E2E: 4/4 passed.
- Rust: `cargo check` PASS; `cargo test` 75/75; `cargo audit` 0 vulnerabilities with 9 documented maintenance/unsound warnings limited to the reviewed transitive tree.
- JavaScript dependency audit: both full and production trees have 0 Critical, 0 High, 6 accepted Moderate and 0 Low findings.
- Gitleaks v8.30.1: 396 commits and approximately 19.14 MB scanned; no leaks found.
- Disposable migration compatibility: repository and target both `0040_shallow_mephistopheles`; PASS.

## Disposable PostgreSQL validation

PostgreSQL 16 was bound to loopback only. After explicitly enabling the infrastructure prerequisite `pg_trgm`, canonical migrations `0000 → 0040` applied with 41 journal entries. Main seed, demo seed, clinical catalog, RxNorm mapping, Ogun food ETL and E2E/security fixtures ran only against that local target. The exact container was removed after validation; no remote migration, seed, ETL, fixture or test write occurred.

## Final release state

```text
Code quality          PASS
Tests                 PASS
Dependency security   PASS (0 Critical / 0 High; 6 accepted Moderate)
Authorization         PASS
Secrets               PASS
Production env        NOT CHECKED (real values intentionally unavailable)
Remote DB migration   BLOCKED
Canonical E2E         PASS
Phase 8 security E2E  PASS

OVERALL                BLOCKED
```

Trusted previous read-only evidence remains: remote latest `0037`, `0038` absent, environment `UNKNOWN`. Repository latest is `0040`. An authorized human must classify the target, take a backup/checkpoint, execute guarded `0038`, and run the read-only compatibility/post-check before deployment. Phase 8 deliberately did not perform that remote operation.
