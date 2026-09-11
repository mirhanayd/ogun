# Security authorization matrix

Date: 2026-09-11

The three domains below are independent. Clinic membership never grants platform or clinical-review authority; a reviewer profile never grants platform staff authority; platform permissions do not bypass clinic tenant filtering.

## Clinic RBAC

| Surface | Authentication | Scope | Required role/permission | Tenant boundary | Mutation | Audit |
| --- | --- | --- | --- | --- | --- | --- |
| Clinic selection | web session | memberships for user | any member | requested clinic membership re-read | yes | session state |
| Clinic identity/settings | web session | active clinic | owner | `clinicId` from verified scope | yes | audit event where defined |
| Team invite/member role | web session | active clinic | owner | membership query includes clinic | yes | invite/member event |
| Clients, health records, files | web session | active clinic + client | owner/assistant; dietitian only assigned client | entity resolves through clinic and client | yes/read | domain audit where defined |
| Appointments | web session | active clinic + client | owner/dietitian/assistant subject to client access | appointment resolves to clinic/client | yes/read | domain event |
| Plans and shares | web session | active clinic + client/clinic template | owner/dietitian; assistant only where explicitly allowed | plan/day/meal/item/share resolves through clinic | yes/read | share lifecycle event |
| Clinic recipes/saved meals | web session | active clinic | ordinary member; mutation role per action | every query includes clinic | yes/read | timestamps |
| Finance/subscription | web session | active clinic | owner for sensitive billing mutations | package/payment/subscription includes clinic | yes/read | billing/provider event |
| Support | web session | active clinic | any member create/reply; owner where specified | ticket/message query includes clinic | yes | support event; no internal-note projection |
| Sessions/devices | web session | current user/current clinic | self; owner for clinic-wide operation where defined | user and clinic are both checked | yes/read | device/session audit |

Canonical roles are `owner`, `dietitian`, and `assistant`. `requireClinic` revalidates membership and role from the database on every protected request; the session fields are only a selection cache.

## Platform RBAC

| Surface | Authentication | Required permission | Permitted roles | Mutation | Audit |
| --- | --- | --- | --- | --- | --- |
| Admin shell/search | isolated admin session + active staff + MFA | relevant read permission | role-dependent; `read_only` read only | no | access/request log |
| Support operations | same | `support.read` / `support.manage` | `super_admin`, `support`; read variants as matrix allows | yes | immutable support event |
| Clinical reviewer administration | same | `clinical.read` / `clinical.manage` | `super_admin`, `clinical_ops` | yes | reviewer audit |
| Food catalog | same | `foods.read` / `foods.manage` | `super_admin`, `food_editor`; read variants as matrix allows | yes | editorial audit |
| Subscription operations | same | `subscriptions.read` / `subscriptions.manage` | `super_admin`, `billing_ops`; read variants as matrix allows | yes | provider/subscription event |
| System/jobs | same | `system.read` / `system.manage` | `super_admin`; read variants as matrix allows | yes/read | job run/audit |

Canonical roles are `super_admin`, `support`, `clinical_ops`, `food_editor`, `billing_ops`, and `read_only`. Explicit negative boundaries: clinic owner is not staff; `clinical_admin` is not staff; `food_editor` cannot manage subscriptions; `support` cannot manage reviewers; `billing_ops` cannot mutate support; `read_only` cannot mutate.

## Clinical reviewer

| Surface | Authentication | Scope | Required role/capability | Tenant/task boundary | Mutation | Audit |
| --- | --- | --- | --- | --- | --- | --- |
| Reviewer dashboard | web session + reviewer profile | own assigned queue | active + verified reviewer | standard reviewer sees assigned tasks only | no | access log |
| Invitation acceptance | signed-in web identity + token | one invitation | normalized account email must match | hashed, expiring, single-use token | yes | invitation lifecycle |
| Claim/decision | active verified reviewer | eligible task | pharmacist/dietitian/physician capability | assignment and eligibility checked server-side | yes | decision event |
| Global queue/admin | active verified reviewer | global | `clinical_admin` | not granted to ordinary reviewer | yes/read | review audit |
| Publish | active verified reviewer | approved candidate | `clinical_admin` and `canPublish=true` | candidate/task linkage checked | yes | publish audit |

Canonical reviewer roles are `pharmacist`, `dietitian`, `physician`, and `clinical_admin`. Pending, rejected, suspended or inactive profiles fail closed.

## Non-user callers

| Surface | Authentication | Scope | Mutation | Audit |
| --- | --- | --- | --- | --- |
| Cron/internal jobs | bearer `CRON_SECRET`, constant-time comparison | route job allowlist | yes | job run |
| iyzico webhook/callback | provider signature/token plus idempotency key | provider event/subscription | yes | provider event |
| Tauri API | Better Auth bearer and installation state | same user/clinic checks as web | yes/read | device and request log |
| Public share | opaque expiring token | one minimized share projection | view counter only | share view count |

## Enforcement rules

- Navigation visibility, disabled controls, URL obscurity and client-side role checks are never authorization.
- Sensitive writes use explicit input schemas and field allowlists; client input cannot set identity, tenant, platform role, verification, provider, publication, or subscription state.
- Object access uses `entity id + active clinic id + current membership`, and client-health objects additionally resolve to a permitted client.
- Failure responses avoid confirming that an object exists in another tenant.
