# Security surface inventory

Date: 2026-09-11

This inventory is the Phase 8 pre-change baseline. A route being listed here is not evidence that UI visibility is an authorization boundary; every protected row depends on the server-side boundary named below.

## Trust boundaries

| Boundary | Authentication | Server-side scope |
| --- | --- | --- |
| Public web | none or opaque token | deliberately minimized public data |
| Clinic web | Better Auth cookie; Tauri may use Better Auth bearer | current session, current database membership and active clinic |
| Platform admin | isolated Better Auth instance/cookie, active `platform_staff`, MFA | canonical platform permission |
| Clinical review | web identity plus active, verified reviewer profile | reviewer capability, assignment and publish flag |
| Internal jobs | `Authorization: Bearer CRON_SECRET` | named job allowlist and operational enable flag |
| iyzico | authenticated clinic checkout or provider signature/callback token | clinic subscription/provider event idempotency |
| Object storage | server-held S3 credentials and short-lived signed operation | clinic/client/document lookup before signing |
| Desktop | constrained Tauri IPC, loopback/cloud origin, Better Auth bearer | installation status plus ordinary clinic boundary |

## Web routes

| Surface | Route families | Access / notable mutation |
| --- | --- | --- |
| Marketing/public | `/`, `/gizlilik`, `/kullanim-kosullari`, `/robots.txt`, `/sitemap.xml` | public, read-only |
| Authentication | `/giris`, `/kayit`, `/sifremi-unuttum`, `/sifreyi-sifirla`, `/api/auth/[...all]` | Better Auth; sign-up/sign-in/reset/verification are abuse-sensitive |
| Invitations | `/davet/[token]`, `/clinical-review/davet` | high-entropy hashed invitation token; acceptance binds the signed-in email |
| Public plan share | `/p/[token]` | opaque token, expiry/revocation/scope; view counter mutation |
| Health | `/api/health/live`, `/api/health/ready`, `/api/connectivity` | public, deliberately coarse output |
| Catalog reads | `/api/foods/search`, `/api/foods/index`, `/api/foods/nutrients`, `/api/foods/index/version` | public/static catalog projection, no draft clinical data |
| Clinic shell | `/panel`, `/danisanlar/**`, `/randevular`, `/planlar/**`, `/tarifler`, `/finans`, `/ayarlar/**` | authenticated current clinic; all records are tenant scoped |
| Clinic selection/setup | `/kurulum`, `/klinik-sec` | authenticated identity; membership is re-read from DB |
| Clinic APIs | `/api/clients/search`, `/api/foods/usage`, `/api/saved-meals`, `/api/analytics/**` | cookie-authenticated when private; mutation origin check required |
| Documents | server actions under `/danisanlar/[id]/dosyalar` | presign, confirm, download and delete; client/clinic boundary |
| Subscription | `/ayarlar/abonelik`, `/api/iyzico/checkout/start`, `/api/iyzico/callback`, `/api/iyzico/webhook` | clinic permission for checkout; provider authenticity/idempotency for callbacks |
| Support | `/ayarlar/destek` server actions | create/reply/reopen within active clinic; internal notes never projected |
| Clinical reviewer | `/clinical-review`, `/clinical-review/task/[id]`, `/clinical-review/admin/publish` | active verified reviewer, assignment/capability; clinical admin plus `canPublish` to publish |
| Desktop API | `/api/desktop/device`, `/workspace`, `/settings`, `/download`, auth native callback | bearer/device status; no browser-cookie-only assumption |
| Internal cron | `/api/internal/cron/[job]` | bearer secret, configured job, production enable policy |

## Server Actions

The clinic mutation surface is concentrated under `kurulum/actions.ts`, `klinik-sec/actions.ts`, `(app)/actions.ts`, client/onboarding/anamnesis/laboratory/measurement/document/payment/plan/PDF/share actions, appointments, finance, recipes, subscription, data-security, team, support, clinic identity and feedback. These actions use `requireAuth`, `requireClinic`, `requireRole`, `withAuth`, `withClientAuth` and object-to-client resolver checks; raw identifiers are not authority.

The platform mutation surface is concentrated under admin subscription, food, recipe, support, clinical-review, system and operations actions. It uses the isolated admin session and canonical platform permissions. Clinical reviewer mutations use `requireVerifiedReviewer`, assignment/capability checks, `requireClinicalAdmin`, and `requirePublisherAdmin`.

## Tokens and external transitions

- Password reset and verification are Better Auth verification-table tokens delivered by `@ogun/email`; tokens must never be logged and production links use canonical configured HTTPS origins.
- Clinic and reviewer invitation tokens are 256-bit random values stored as hashes, expire, bind to the intended normalized email and reject replay.
- Public plan-share tokens are random, expire, can be revoked, and only project the selected plan view.
- Desktop OAuth places only a ten-second one-time token in `ogun://auth/callback`; the session token is exchanged after the deep link and stored through native secure storage.
- iyzico secrets remain server-only. Browser checkout initiation is clinic-authorized; callback/webhook processing is provider-verified and idempotent.

## Native surface

The Tauri shell owns the `ogun` scheme, updater, tray/window operations, notifications, dialogs, scoped local database/storage commands and the web session token. Remote navigation is restricted by capabilities. The release gate statically rejects broad shell/filesystem/opener permissions, non-HTTPS updater endpoints, an enabled updater without a public key, and server-secret names in desktop sources/artifacts.

## Audit conclusions carried into implementation

- Both Next configs implicitly loaded the repository root `.env`; Phase 8 removes this.
- Better Auth rate limiting was implicit and process-memory backed; Phase 8 makes it explicit and database backed with separate web/admin tables.
- Browser and desktop shared the 400-day web session. Clean per-transport lifetime separation is not supported by the installed Better Auth lifecycle without a larger auth rewrite; this remains an explicitly accepted medium risk with device revocation and daily sliding renewal as compensating controls.
- Direct-to-S3 confirmation trusted browser MIME metadata. Phase 8 verifies the uploaded object metadata and magic bytes before creating the document record.
- Tauri default filesystem/opener grants were broader than the commands used; Phase 8 narrows them and adds static regression checks.
