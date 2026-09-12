# GitHub security settings checklist

Date: 2026-09-12

These account-level settings were not changed by the Phase 8 implementation. A repository administrator must verify them in GitHub before pilot release.

- [ ] Dependabot alerts enabled.
- [ ] Dependabot security updates enabled; automated merge remains disabled.
- [ ] Secret scanning enabled where the repository plan supports it.
- [ ] Push protection enabled where the repository plan supports it.
- [ ] CodeQL/default code scanning alerts visible and triaged.
- [ ] `master` branch protection enabled.
- [ ] Pull request review required before merge.
- [ ] Required checks include application security, Rust audit, secret scan, CodeQL, builds and Playwright release gates.
- [ ] Force pushes and branch deletion disabled for `master`.
- [ ] Workflow token default permission set to read-only; approval required for elevated workflows.
- [ ] Actions are restricted to GitHub/verified allowlisted actions or immutable commit SHAs.
- [ ] Fork pull requests do not receive production secrets and no `pull_request_target` job executes untrusted checkout code.
- [ ] Environment-scoped production secrets require reviewer approval.
- [ ] Production deployment uses a feature branch → CI → review → protected `master` workflow.

Repository controls already committed: weekly grouped npm/Cargo/Actions Dependabot checks, immutable action SHAs, workflow-level least privilege, RustSec, full-history secret scanning and JS/TS CodeQL.
