# Security review — 2026-09-11

Final verification date: 2026-09-12. Scope: Phase 8 release/security gate at repository checkpoint `2642512` through the commits listed in `walktrough.md`.

## Executive assessment

| Severity | Fixed | Accepted/open | Release blocker |
| --- | ---: | ---: | ---: |
| Critical | 3 | 0 | 0 |
| High | 7 | 0 | 1 |
| Medium | 5 | 5 | 0 |
| Low | 2 | 1 | 0 |

There are no unresolved Critical or High code/dependency vulnerabilities. The sole open High classification is an external operational correctness blocker: remote environment `UNKNOWN`, `0038` absent. Therefore the code task is complete but production release is **BLOCKED**.

## Findings

### OGUN-SEC-001 — Distributed authentication abuse protection

- Severity: Critical
- Surface: Better Auth web/admin endpoints
- Description: implicit process-memory limits did not provide a serverless-wide boundary and web/admin buckets were not explicitly isolated.
- Exploit precondition: repeated credential/reset/MFA requests across instances.
- Impact: brute force and resource abuse.
- Status: fixed
- Fix commit: `79b75db`
- Residual risk: ingress/provider volumetric controls remain necessary for network-level floods.

### OGUN-SEC-002 — Password identity ownership and enumeration

- Severity: Critical
- Surface: signup, verification, password reset
- Description: a new password identity could proceed without proving email ownership; signup could disclose an existing address.
- Exploit precondition: attacker knows or guesses an address.
- Impact: privileged clinic identity impersonation/account discovery.
- Status: fixed
- Fix commits: `79b75db`, `d1cfc20`
- Residual risk: legacy `emailVerified=false` users require the documented staged verification prompt; they are not blindly locked out.

### OGUN-SEC-003 — Direct-to-object-storage confirmation trust

- Severity: Critical
- Surface: client document upload/confirmation
- Description: confirmation trusted client MIME metadata and predictable tenant-shaped keys too far.
- Exploit precondition: authenticated clinic user manipulates upload metadata/object.
- Impact: hostile file persistence, cross-scope confusion.
- Status: fixed
- Fix commit: `9ecf61f`
- Residual risk: no malware/antivirus scanner is deployed; see OGUN-SEC-011.

### OGUN-SEC-004 — Cross-clinic object authorization

- Severity: High
- Surface: client, appointment, support, document, device, member, recipe and plan queries
- Description: audit found recipe lookup and device-query paths that needed explicit clinic/user binding; the full boundary was not regression-tested as one suite.
- Exploit precondition: authenticated user knows another tenant's identifier.
- Impact: cross-tenant disclosure or mutation.
- Status: fixed
- Fix commit: `4764d3b`
- Residual risk: every future entity family must follow `entity + active clinic + membership` and extend the suite.

### OGUN-SEC-005 — Cookie-authenticated custom API origins

- Severity: High
- Surface: non-Better-Auth browser mutation routes
- Description: custom cookie-auth mutation routes did not consistently have Server Action origin enforcement.
- Exploit precondition: victim has an active browser session and visits an attacker origin.
- Impact: cross-site state mutation.
- Status: fixed
- Fix commit: `5975e73`
- Residual risk: bearer native, cron and signed webhook calls intentionally use their own authentication instead of browser Origin.

### OGUN-SEC-006 — Browser policy/header baseline

- Severity: High
- Surface: web/admin HTTP responses
- Description: security headers, private cache policy and search indexing policy were incomplete/inconsistent.
- Exploit precondition: browser visits an affected response.
- Impact: clickjacking, MIME confusion, referrer leakage, shared-cache/index exposure.
- Status: fixed
- Fix commits: `5975e73`, `4e457c0`, `a8a5325`
- Residual risk: CSP retains Next-compatible inline styles/scripts; nonce conversion would force a larger rendering change. WASM execution alone uses the narrow `'wasm-unsafe-eval'` source for the PDF engine; general `'unsafe-eval'` remains forbidden.

### OGUN-SEC-007 — Implicit root environment ingestion

- Severity: High
- Surface: web/admin builds and local env sync
- Description: application config implicitly loaded broad root `.env` contents, risking cross-app secret exposure and wrong deployment targets.
- Exploit precondition: stale or overprivileged root environment exists.
- Impact: secret boundary violation and unsafe target selection.
- Status: fixed
- Fix commit: `e13d4b5`
- Residual risk: Next still reads an app-local `.env.local`; production must use platform injection and must not deploy local files.

### OGUN-SEC-008 — Desktop capability/navigation scope

- Severity: High
- Surface: Tauri permissions, filesystem, opener, deep link, updater
- Description: default plugin capabilities and remote navigation checks were broader than used product flows.
- Exploit precondition: compromised renderer or malformed deep link.
- Impact: local file or external navigation abuse.
- Status: fixed
- Fix commits: `7a5271a`, `6cc273c`, `4e457c0`
- Residual risk: updater is disabled until an HTTPS endpoint and signature public key are supplied; release validation rejects unsafe enablement.

### OGUN-SEC-009 — Runtime dependency vulnerabilities

- Severity: High
- Surface: Next, React, Better Auth, Drizzle, SheetJS and transitive packages
- Description: baseline audit reported 2 Critical, 15 High, 17 Moderate and 2 Low advisories.
- Exploit precondition: advisory-specific reachable runtime/development path.
- Impact: denial of service, authorization/data handling weaknesses and tooling compromise.
- Status: fixed
- Fix commits: `8474541`, `1ed2460`
- Residual risk: six accepted Moderate audit findings are recorded in OGUN-SEC-012.

### OGUN-SEC-010 — PII in logs and monitoring

- Severity: High
- Surface: pino/Sentry errors, breadcrumbs and request URLs
- Description: nested Error message/stack and arbitrary query strings could retain email, tokens or clinical/support content.
- Exploit precondition: sensitive value appears in an error or URL.
- Impact: secondary PII/secret disclosure to logs/monitoring.
- Status: fixed
- Fix commit: `d1cfc20`
- Residual risk: operational teams must not add raw request bodies as custom Sentry context.

### OGUN-SEC-011 — Uploaded-file malware scanning

- Severity: Medium
- Surface: private document uploads
- Description: size, allowlisted MIME, object metadata and magic bytes are enforced, but malware content is not scanned.
- Exploit precondition: authorized user uploads a structurally valid malicious document.
- Impact: later recipient/device exposure.
- Status: accepted
- Fix commit: `9ecf61f` (compensating controls)
- Residual risk: add quarantine + asynchronous AV/CDR before broad rollout; keep browser disposition and private bucket controls.

### OGUN-SEC-012 — Six remaining JS audit findings

- Severity: Medium
- Surface: transitive runtime/dev dependencies
- Description: current audit reports 0 Critical, 0 High, 6 Moderate, 0 Low. Items are OpenTelemetry baggage memory growth through optional Sentry 8; Vitest/@vitest-mocker file-read advisories in test-only execution; esbuild dev-server CORS through Drizzle Kit (serve API unused); and UUID buffer-bounds paths through iyzipay/Sentry (project supplies strings and does not invoke affected buffer UUID APIs).
- Exploit precondition: the specific non-production/unreachable APIs are invoked with attacker-controlled input.
- Impact: local file read, memory pressure or bounds error depending on advisory.
- Status: accepted
- Fix commit: `8474541`
- Residual risk: weekly Dependabot/audit monitoring; upgrade when compatible patched transitive releases exist. Any reachability change reopens the finding.

### OGUN-SEC-013 — Shared long-lived browser/desktop session

- Severity: Medium
- Surface: normal Better Auth sessions
- Description: the desktop persistence requirement also leaves browser cookies on the existing 400-day sliding lifecycle.
- Exploit precondition: browser session token theft.
- Impact: extended unauthorized session opportunity.
- Status: accepted
- Fix commit: `79b75db` (explicit review/reset revocation/cookie controls)
- Residual risk: installed lifecycle cannot safely split bearer and cookie expiry without a larger auth rewrite. Device/session revocation, HttpOnly/Secure/SameSite cookies and password-reset revocation compensate. Revisit before general availability.

### OGUN-SEC-014 — CSP nonce limitation

- Severity: Medium
- Surface: Next.js web/admin rendering
- Description: nonce-based CSP would force dynamic rendering and a broad hydration/build refactor; enforced policy retains framework-required inline allowance.
- Exploit precondition: a separate injection primitive exists.
- Impact: reduced CSP defense-in-depth against injected inline code.
- Status: accepted
- Fix commit: `5975e73`
- Residual risk: no general `unsafe-eval`, no wildcard, `object-src none`, `frame-ancestors none`; revisit nonce support with a dedicated rendering migration.

### OGUN-SEC-015 — Linux-only unmaintained/unsound Rust transitive crates

- Severity: Medium
- Surface: Tauri GTK dependency tree
- Description: Cargo audit reports 9 informational maintenance/unsound warnings, including `glib 0.18.5`; the Windows target tree does not include `glib` and reports zero vulnerabilities across 643 dependencies.
- Exploit precondition: a future Linux desktop target is shipped using the current GTK tree.
- Impact: maintenance and possible unsoundness risk.
- Status: accepted
- Fix commit: `7a5271a` (target/security review)
- Residual risk: block Linux release until its target-specific tree is upgraded and re-audited.

### OGUN-SEC-016 — Remote migration history correctness

- Severity: High
- Surface: remote PostgreSQL migration state
- Description: trusted last evidence says remote latest is `0037`, `0038` is absent and environment classification is `UNKNOWN`; repository latest is `0040`.
- Exploit precondition: deploy before classification and guarded backfill.
- Impact: historical provider-event replay/idempotency correctness cannot be guaranteed.
- Status: release_blocker
- Fix commit: none — authorized human operation required
- Residual risk: production release remains BLOCKED until backup, classification, guarded `0038` and read-only post-check. Phase 8 performed no remote DB operation.

### OGUN-SEC-017 — Update/input/link/SQL/XSS audit

- Severity: Low
- Surface: server actions, redirects, server fetches, SQL/search, user text
- Description: no uncontrolled DB `.set(input)`/`.values(input)`, arbitrary external redirect, user-controlled server fetch, raw user SQL interpolation, raw Markdown HTML, or general `dangerouslySetInnerHTML` sink was found. The single inline bootstrap is a static application-owned script.
- Exploit precondition: future code bypasses explicit schemas/allowlists.
- Impact: privilege escalation, SSRF, injection or XSS.
- Status: fixed
- Fix commit: `5778738` (inventory/matrix and enforced patterns)
- Residual risk: keep these searches and code review checks in every release.

### OGUN-SEC-018 — Full-history secret scan findings

- Severity: Low
- Surface: tracked Git history
- Description: Gitleaks found two reviewed generic-key false positives: security documentation wording and empty/boolean example environment placeholders. No verified secret was found.
- Exploit precondition: none for reviewed fingerprints.
- Impact: scanner noise only.
- Status: fixed
- Fix commit: `9f647d8`
- Residual risk: `.gitleaksignore` uses exact commit/file/rule/line fingerprints; changed content is scanned again.

### OGUN-SEC-019 — Production extension prerequisite

- Severity: Low
- Surface: clean database bootstrap
- Description: migration `0000` requires `pg_trgm` for `gin_trgm_ops`; vanilla PostgreSQL needs the extension enabled before the chain.
- Exploit precondition: clean environment without extension.
- Impact: migration stops safely before schema completion.
- Status: accepted
- Fix commit: documentation commit containing this review
- Residual risk: human preflight must verify/install the extension with appropriate DB authority.

## Release policy result

```text
Code/dependency Critical  PASS (0 open)
Code/dependency High      PASS (0 open)
Accepted Medium          PASS (explicit rationale above)
Remote DB migration      BLOCKED
OVERALL                   BLOCKED
```
