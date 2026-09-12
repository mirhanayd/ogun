# Production environment matrix

Date: 2026-09-12

Values belong in the deployment platform's encrypted environment store. They must not be committed, printed by sync scripts, embedded in desktop artifacts, or copied between applications unless the matrix explicitly marks both applications. `pnpm env:sync:web` and `pnpm env:sync:admin` are local-only, explicit, allowlisted helpers.

| Variable / group | Web | Admin | Cron/runtime | Build-only | Public? | Secret? | Required prod? | Purpose |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| `APP_ENV=production` | yes | yes | yes | no | no | no | yes | Enables production validation semantics. |
| `DATABASE_URL` | yes | yes | yes | no | no | yes | yes | PostgreSQL runtime connection; explicit injection only. |
| `DATABASE_POOL_MAX` | yes | yes | yes | no | no | no | recommended | Per-instance pool bound. |
| `BETTER_AUTH_SECRET` | yes | no | no | no | no | yes | yes | Clinic/web session signing; minimum 32 chars. |
| `ADMIN_BETTER_AUTH_SECRET` | no | yes | no | no | no | yes | yes | Admin session signing; must differ from web. |
| `BETTER_AUTH_URL` / `NEXT_PUBLIC_BETTER_AUTH_URL` | yes | no | no | no | latter yes | no | yes | Canonical HTTPS web auth origin. |
| `ADMIN_BETTER_AUTH_URL` | no | yes | no | no | no | no | yes | Canonical HTTPS admin auth origin. |
| `OGUN_WEB_URL` | yes | yes | yes | no | no | no | yes | Canonical web links and admin-to-web calls. |
| `NEXT_PUBLIC_SITE_URL` | yes | no | no | yes | yes | no | yes | Canonical public site/sitemap origin. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | yes | no | no | no | ID only | secret only | conditional | Both present when Google login is enabled. |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | yes | yes | yes | no | from address | key only | yes | Transactional email; tests explicitly blank these values. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE`, `S3_BUCKET` | yes | no | no | no | no | bucket private | yes | Private object storage coordinates. |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | yes | no | no | no | no | yes | yes | Server-only object storage credentials. |
| `CRON_SECRET` | yes | no | yes | no | no | yes | yes | Internal job bearer secret. |
| `OPERATIONAL_JOBS_ENABLED=true` | yes | no | yes | no | no | no | yes | Explicit production job enablement. |
| `EXTERNAL_DELIVERY_ENABLED` | yes | no | yes | no | no | no | policy | Explicit non-production provider-send opt-in. |
| `PAYMENTS_MODE` | yes | no | no | no | no | no | yes | Explicit `sandbox` or `production` intent. |
| `IYZICO_BASE_URL` | yes | no | no | no | no | no | yes | Must agree with payment mode. |
| `IYZICO_API_KEY` / `IYZICO_SECRET_KEY` | yes | no | no | no | no | yes | yes | Server-only payment provider credentials. |
| `IYZICO_*_REFERENCE_CODE` | yes | no | no | no | no | no | yes | Provider plan identifiers. |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | yes | yes | no | no | DSN may be public | no | optional | Error ingestion endpoint; no PII payloads. |
| `SENTRY_ENVIRONMENT` | yes | yes | no | no | no | no | optional | Environment label. |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | yes | yes | no | yes | no | token only | build conditional | Source map upload; token is build-only secret. |
| `LOG_LEVEL` | yes | yes | yes | no | no | no | recommended | Structured logging threshold. |
| `CLINICAL_REVIEW_ENABLED` | yes | no | no | no | no | no | policy | Reviewer feature rollout switch. |
| `PILOT_METRICS_ACCESS_EMAILS` | yes | no | no | no | no | personal/config | conditional | Pilot metric access allowlist. |
| `NEXT_PUBLIC_PILOT_CONTACT_EMAIL` | yes | no | no | yes | yes | no | optional | Public pilot contact address. |
| `BLOB_READ_WRITE_TOKEN` | yes | no | no | no | no | yes | conditional | Legacy/provider blob integration only if used. |
| `STANDALONE_BUILD=1` | yes | no | no | yes | no | no | artifact conditional | Docker/Tauri sidecar standalone output. |
| `CLINICAL_REVIEW_INVITATION_CAPTURE_PATH` | no | test only | no | no | no | no | never | Local E2E capture; forbidden in production. |

The production validator rejects missing/weak secrets, equal web/admin secrets, local/example URLs, placeholder credentials, absent job intent, and Iyzico mode/base-URL mismatches. It reports only check names and PASS/FAIL.
