# Ogun Operasyon / Admin Platform — Faz 1 Walkthrough ve Son Rapor

Tarih: 8 Eylül 2026

## Son durum

Faz 1 uygulama kodu tamamlandı ve dört mantıksal commit halinde kaydedildi. Ayrı admin uygulaması, platform personeli yetkilendirmesi, ayrı admin session sınırı, zorunlu TOTP MFA, platform permission matrix'i, append-only platform audit altyapısı, dashboard, denetim ekranı, personel listesi, bootstrap CLI ve deployment dokümantasyonu hazırdır.

Görevin operasyonel kapanışı için iki bilinçli açık nokta vardır:

1. `.env` içindeki veritabanı uzak bir Neon instance'ıdır. Migration 0031 bu uzak veritabanına otomatik uygulanmadı.
2. `master`, `origin/master` önünde bu görevden önce oluşturulmuş sekiz commit dahil toplam on iki commit taşımaktadır. İlgisiz commitleri istemeden göndermemek için push yapılmadı.

Migration uygulanıp root test yeniden çalıştırılmadan ve güvenli push hedefi belirlenmeden Faz 1 tamamen kapatılmış kabul edilmemelidir.

## 1. Mimari olarak ne değişti?

Monorepoya bağımsız bir Next.js uygulaması eklendi:

```text
apps/web    → mevcut son kullanıcı/klinik uygulaması
apps/admin  → ayrı Ogun Operasyon uygulaması
```

`apps/admin`, `apps/web/src` altından hiçbir şey import etmez. Ortak veritabanı ve domain erişimi yalnızca `@ogun/db` üzerinden yapılır.

Admin uygulaması aynı canonical PostgreSQL veritabanındaki mevcut `users` ve credential `accounts` kimliğini kullanabilir. Buna karşılık aşağıdaki güvenlik sınırları ayrıdır:

- Ayrı Better Auth instance'ı
- Ayrı `ADMIN_BETTER_AUTH_SECRET`
- Ayrı `ADMIN_BETTER_AUTH_URL`
- `ogun-admin` cookie prefix'i
- Ayrı `admin_sessions` tablosu
- En fazla sekiz saatlik session
- Yalnızca e-posta/şifre ve TOTP
- Public signup kapalı
- Google OAuth, Tauri bearer auth, one-time token ve clinic session alanları yok

## 2. Eklenen ve değiştirilen ana dosyalar

### Veritabanı

- `packages/db/src/schema/platform-admin.ts`
- `packages/db/src/schema/tenancy.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/src/queries/platform-admin.ts`
- `packages/db/src/queries/index.ts`
- `packages/db/src/scripts/platform-admin.ts`
- `packages/db/drizzle/0031_overrated_layla_miller.sql`
- `packages/db/drizzle/meta/0031_snapshot.json`
- `packages/db/drizzle/meta/_journal.json`
- `packages/db/package.json`

### Admin uygulaması

- `apps/admin/package.json`
- `apps/admin/next.config.ts`
- `apps/admin/tsconfig.json`
- `apps/admin/eslint.config.mjs`
- `apps/admin/vitest.config.ts`
- `apps/admin/postcss.config.mjs`
- `apps/admin/src/lib/auth.ts`
- `apps/admin/src/lib/auth-client.ts`
- `apps/admin/src/lib/platform-authz.ts`
- `apps/admin/src/lib/platform-access.ts`
- `apps/admin/src/lib/platform-permissions.ts`
- `apps/admin/src/lib/platform-audit.ts`
- `apps/admin/src/app/api/auth/[...all]/route.ts`
- `apps/admin/src/app/(auth)/giris/**`
- `apps/admin/src/app/(auth)/iki-asama/**`
- `apps/admin/src/app/guvenlik/iki-asama-kurulum/**`
- `apps/admin/src/app/(app)/layout.tsx`
- `apps/admin/src/app/(app)/page.tsx`
- `apps/admin/src/app/(app)/denetim/page.tsx`
- `apps/admin/src/app/(app)/platform-personeli/page.tsx`
- `apps/admin/src/components/admin-shell.tsx`
- `apps/admin/src/components/sign-out-button.tsx`
- `apps/admin/src/app/globals.css`

### Yapılandırma ve dokümantasyon

- `.env.example`
- `turbo.json`
- `pnpm-lock.yaml`
- `docs/admin-deployment.md`
- `docs/admin-phase-1-status.md`
- `walktrough.md`

## 3. Yeni DB tabloları ve enumlar

### `platform_staff_role`

```text
super_admin
support
clinical_ops
food_editor
billing_ops
read_only
```

### `platform_audit_outcome`

```text
success
failure
```

### `platform_staff`

Platform authorization için canonical kaynaktır. `clinic_members.role`, `owner` veya `clinical_admin` ile bağlantılı değildir.

Alanlar:

```text
id
user_id
role
is_active
created_by
deactivated_at
created_at
updated_at
```

Bir kullanıcı için en fazla bir platform personeli satırı bulunabilir. Kayıt silmek yerine devre dışı bırakılır.

### `admin_sessions`

Admin browser session'larını normal `sessions` tablosundan ayırır.

```text
id
token
user_id
expires_at
ip_address
user_agent
created_at
updated_at
```

### `two_factors`

Better Auth 1.6.29'un kurulu plugin şeması incelenerek oluşturuldu:

```text
id
secret
backup_codes
user_id
verified
failed_verification_count
locked_until
```

TOTP secret ve backup code'lar Better Auth tarafından şifrelenir. Custom plain-text MFA kolonları kullanılmaz.

`users` tablosuna Better Auth plugin'inin beklediği `two_factor_enabled` alanı eklendi. Admin plugin'inin etkin olması normal web uygulamasında MFA zorunluluğu oluşturmaz.

### `platform_audit_logs`

Clinic/sağlık verisi audit sisteminden tamamen ayrıdır ve append-only kabul edilir.

```text
id
actor_user_id
platform_staff_id
action
entity_type
entity_id
clinic_id
outcome
reason
ip_address
user_agent
metadata
created_at
```

DB query katmanından update veya delete fonksiyonu export edilmez.

## 4. Migration

Canonical migration:

```text
packages/db/drizzle/0031_overrated_layla_miller.sql
```

Uygulama komutu:

```bash
pnpm --filter @ogun/db db:migrate
```

Bu komut mevcut `.env` dosyasında uzak Neon bağlantısı bulunduğundan otomatik çalıştırılmadı. Uygulamadan önce doğru hedef veritabanı ayrıca teyit edilmelidir.

## 5. Auth ve MFA akışı

```text
/giris
  → email/password
  → platform_staff var mı ve aktif mi?
  → hayır: generic erişim reddi, session oluşturulmaz
  → evet: Better Auth credential doğrulaması
  → TOTP aktifse /iki-asama challenge
  → TOTP aktif değilse kısa admin session
  → protected layout MFA eksikliğini görür
  → /guvenlik/iki-asama-kurulum
  → şifre tekrar doğrulama
  → QR/TOTP URI ve tek seferlik backup code gösterimi
  → TOTP verify
  → dashboard
```

Savunma katmanları:

- Login endpoint'i çalışmadan önce personel DB kontrolü
- Session oluşturulurken yeniden aktif personel kontrolü
- Her protected route request'inde session + staff + active + MFA kontrolü
- Her server-side veri okuma veya action'da permission kontrolü
- Client menü görünürlüğü authorization kaynağı olarak kullanılmaz

## 6. Permission matrix

Canonical dosya:

```text
apps/admin/src/lib/platform-permissions.ts
```

- `super_admin`: tüm permission'lar
- `support`: dashboard, klinik/kullanıcı/cihaz okuma ve ticket yönetimi
- `clinical_ops`: reviewer ve clinical task yönetimi/yayınlama
- `food_editor`: besin okuma, yazma ve yayınlama
- `billing_ops`: klinik okuma ve abonelik yönetimi
- `read_only`: yalnızca `.read` permission'ları

Server-side yardımcılar:

```ts
requirePlatformStaff()
requirePlatformPermission(...)
withPlatformPermission(...)
```

## 7. Platform audit yaklaşımı

`recordPlatformAudit` request header'larından IP ve user-agent toplar. `withPlatformAudit` ise başarılı operasyonlarda `success`, hata atan operasyonlarda `failure` kaydı üretir ve orijinal hatayı tekrar fırlatır.

Audit descriptor üzerinden action, entity, entity id, clinic id ve metadata türetilebilir. Bu tasarım recorder dependency injection ile unit test edilebilir.

Dashboard dışındaki gerçek Faz 1 ekranı `/denetim` rotasıdır. Yalnızca `audit.read` permission'ı ile açılır ve 50 satırlık server-side pagination kullanır.

## 8. İlk super admin bootstrap

Belirtilen e-posta önceden `users` tablosunda bulunmalıdır:

```bash
pnpm --filter @ogun/db platform-admin:grant --email admin@example.com --role super_admin
```

Komut:

- Yeni kullanıcı veya parola üretmez.
- Secret basmaz.
- Rol değerini allowlist ile doğrular.
- Mevcut staff kaydını idempotent biçimde aktifleştirir/günceller.
- `source=bootstrap_cli` metadata'sıyla audit oluşturur.

Erişimi iptal etmek ve ilgili admin session'larını silmek için:

```bash
pnpm --filter @ogun/db platform-admin:revoke --email admin@example.com
```

## 9. Local admin çalıştırma

Kök `.env` dosyasına aşağıdaki değerler eklenmelidir:

```dotenv
ADMIN_BETTER_AUTH_SECRET=<en-az-32-byte-rastgele-deger>
ADMIN_BETTER_AUTH_URL=http://localhost:3001
```

Ardından:

```bash
pnpm install
pnpm --filter admin dev
```

Adres:

```text
http://localhost:3001
```

## 10. Vercel'de ikinci proje

Aynı GitHub repository üzerinden yeni bir Vercel Project oluşturulmalıdır:

```text
Root Directory: apps/admin
Framework: Next.js
Production domain: https://admin.example.com
```

Normal web ve admin projeleri farklı Better Auth secret'ları kullanmalıdır. Admin cookie'leri host-only bırakılmalı ve üst domain genelinde paylaşılmamalıdır.

Ayrıntılar `docs/admin-deployment.md` içindedir.

## 11. Environment variables

Zorunlu:

```text
DATABASE_URL
ADMIN_BETTER_AUTH_SECRET
ADMIN_BETTER_AUTH_URL
```

`ADMIN_BETTER_AUTH_SECRET` eksikse admin uygulaması fail-fast davranır. Normal `BETTER_AUTH_SECRET` değerine örtük fallback yapılmaz.

## 12. Çalıştırılan testler ve sonuçları

### Başarılı

```text
pnpm --filter @ogun/db typecheck
  geçti

pnpm --filter @ogun/db test
  22 test geçti, 50 mevcut koşullu test skip

pnpm --filter admin typecheck
  geçti

pnpm --filter admin lint
  geçti, uyarı yok

pnpm --filter admin test
  13 test geçti

pnpm --filter admin build
  production build geçti

pnpm typecheck
  8 task geçti

pnpm lint
  3 task geçti
```

Admin test kapsamı:

- unauthenticated erişim reddi
- normal kullanıcının platform erişiminin reddi
- inactive staff reddi
- MFA enrollment gating
- aktif staff + MFA kabulü
- role permission matrix regresyonları
- başarılı audit kaydı
- başarısız audit kaydı ve hata propagation

## 13. Operasyonel kapanış — final rapor

Bu bölüm 8 Eylül 2026 tarihli disposable PostgreSQL doğrulamasından sonraki nihai durumu gösterir ve önceki ara durum notlarının yerine geçer.

### A. Database

```text
Migration static validation: PASS
Migration test target: disposable Docker PostgreSQL 16 (`ogun-admin-phase1-test`)
Migration applied remotely: no
Reason: kök `.env` hedefi uzak Neon (`ep-calm-heart-…neon.tech`, DB `neondb`); production/dev ayrımı güvenle doğrulanamadı.
Root tests after migration: PASS — 8/8 Turbo task; 871 pass, 7 skip
```

`0031_overrated_layla_miller.sql` statik incelemesinde yalnızca beklenen iki enum, dört tablo, `users.two_factor_enabled`, yedi foreign key ve sekiz index bulundu. `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, destructive `ALTER` veya güvenli default'u olmayan yeni `NOT NULL` alan yoktur.

Boş DB migrasyon zinciri, dokümante edilmiş `pg_trgm` önkoşulu kurulduktan sonra 0000–0031 arasında başarıyla çalıştı. Mevcut kullanıcı senaryosu ayrıca `users.two_factor_enabled` alanı kaldırılıp kullanıcı eklendikten sonra migration'daki gerçek `ADD COLUMN ... DEFAULT false NOT NULL` ifadesiyle tekrar uygulandı; eski satır `false` aldı ve `NULL` oluşmadı. Normal web kullanıcısının parola girişi de `twoFactorRedirect=false` ile geçti.

Uzak hedefe hiçbir schema değişikliği uygulanmadı. Ortam sahibi hedefi doğruladıktan ve yedek/rollback planını hazırladıktan sonra çalıştırılacak komut:

```bash
pnpm --filter @ogun/db db:migrate
```

### B. Real auth smoke test

Bağlı UI tarayıcısı bulunamadığı için browser-driven görsel admin smoke testi `NOT RUN` kaldı. Bunun yerine disposable DB'ye bağlı gerçek Next.js admin sunucusunda aynı auth uçları ve korumalı sayfalar HTTP üzerinden uçtan uca çalıştırıldı:

```text
browser-driven UI smoke: NOT RUN — bu oturumda bağlı tarayıcı yüzeyi yok
password login: PASS
MFA enrollment: PASS
TOTP verify: PASS
second login challenge: PASS
logout: PASS
staff revoke: PASS
normal user denied: PASS
inactive staff denied: PASS
```

Ek doğrulamalar:

- MFA öncesi `/` isteği enrollment rotasına yönlendi; enrollment ve TOTP doğrulamasından sonra dashboard, `/denetim` ve `/platform-personeli` 200 döndü.
- Logout sonrasında admin session silindi ve `/` yeniden `/giris` rotasına yönlendi.
- Revoke işlemi mevcut `admin_sessions` satırını sildi; aynı cookie artık erişim sağlamadı ve yeni login genel 401 mesajıyla reddedildi.
- Admin login normal `sessions` tablosuna yazmadı; admin oturumları yalnız `admin_sessions` tablosunda oluştu.
- Cookie'ler `ogun-admin.*` prefix'i, `HttpOnly` ve `SameSite=Lax` kullandı. Test geliştirme HTTP ortamında olduğundan `Secure=false`; production build'de ayar `true` olur.
- TOTP secret ve backup code değerleri sunucu loglarına yazılmadı.
- Bootstrap grant/revoke işlemleri audit tablosuna kaydedildi ve transaction içinde yürüdü.

### C. Commit inventory

| Hash | Subject | Ana dosyalar | Feature | Push kararı |
|---|---|---|---|---|
| `5c4ed77` | `fix(panel): align appointments and quick-start cards` | `panel-screen.tsx`, desktop layout testi | Panel yerleşimi | Güvenli |
| `30b21af` | `fix(settings): resolve desktop settings subroutes` | settings rotaları, desktop settings API/adapter | Desktop ayar alt rotaları | Güvenli |
| `6fc94c4` | `fix(sync): separate workspace and catalog health` | sync engine/diagnostics, Tauri local DB | Workspace/catalog health ayrımı | Güvenli |
| `445bc60` | `feat(measurements): parse Tanita BC-601 exports` | Tanita CSV/PDF parser ve 165 KB test fixture'ı | Tanita parse | Güvenli; binary yalnız test fixture'ı |
| `da791c7` | `feat(measurements): persist Tanita device metrics` | migration 0030, measurement query/schema, desktop DB | Tanita persistence | Güvenli; Drizzle snapshot beklenen generated schema kaydı |
| `9cab69e` | `feat(measurements): integrate Tanita import into shared form` | measurement form/view, import control | Tanita UI entegrasyonu | Güvenli |
| `5fbd19d` | `test(desktop): cover panel settings sync and Tanita import` | desktop smoke/testler, doğrulama dokümanı | Desktop regresyon kapsamı | Güvenli |
| `7103985` | `chore(release): bump Ogun version to 0.3.5` | Tauri/package sürümleri, release manifesti | 0.3.5 release metadata | Güvenli |
| `e4ac566` | `feat(db): add platform staff and admin auth foundation` | migration 0031, admin schema/query/CLI | Admin DB temeli | Güvenli |
| `4ed16df` | `feat(admin): scaffold operations app with isolated authentication and MFA` | `apps/admin`, lockfile | Ayrı admin auth ve MFA | Güvenli |
| `df66e8f` | `feat(admin): add platform RBAC and audit foundation` | audit/personel sayfaları ve yardımcıları | RBAC ve audit | Güvenli |
| `27ba86b` | `test(admin): add admin security tests and deployment documentation` | `.env.example`, admin docs, `turbo.json` | Test/deployment dokümantasyonu | Güvenli; yalnız placeholder env değerleri |
| `60f126e` | `docs(admin): add phase one walkthrough report` | `walktrough.md` | Faz 1 raporu | Güvenli |
| `d077583` | `feat(etl): add clinical catalog import and verification` | clinical importer/verifier, `.gitignore` | Clinical entegrasyon source'u | Güvenli |
| `540a2c2` | `fix(admin): close platform staff CLI database connection` | admin bootstrap CLI | CLI'nin işlem sonunda kapanması | Güvenli |
| `2864679` | `test(workspace): stabilize database integration validation` | `turbo.json`, `rxnorm-db.test.ts` | Test DB env aktarımı ve kanıtlı timeout sınırı | Güvenli |
| `0462461` | `test(web): refresh panel visual baselines` | light/dark panel PNG snapshot'ları | Kasıtlı panel düzeni baseline'ı | Güvenli |
| `fbd48c9` | `docs(admin): finalize phase one operational walkthrough` | `walktrough.md` | Nihai kapanış raporu | Güvenli |
| bu push-sonucu commit'i | `docs(admin): record phase one push result` | `walktrough.md` | Push sonucu ve senkron durum kaydı | Güvenli |

Commit diffleri tek tek incelendi. Credential/private key yoktur; yalnız `.env.example` placeholder değerleri içerir. Büyük dosyalar iki Drizzle schema snapshot'ı ve kasıtlı Tanita/Playwright test fixture-baseline dosyalarıdır.

### D. Pre-existing/uncommitted changes

| Dosya | Sınıflandırma | İşlem | Commit |
|---|---|---|---|
| `.gitignore` | Amaçlı clinical artifact politikası | Clinical source commit'ine alındı; bundle/script de ignore edildi | `d077583` |
| `packages/etl/src/importers/clinical.ts` | Gerçek, package script'i tarafından çağrılan source | Typecheck + disposable import sonrası commitlendi | `d077583` |
| `packages/etl/src/verify-clinical.ts` | Gerçek doğrulama source'u | 21.505 condition / 23.348 ürün doğrulaması sonrası commitlendi | `d077583` |
| `ogun-clinical-db-integration/` | Taşıma paketi + yaklaşık 13 MB generated veri kopyası | Silinmedi; repo kökünde ignore edildi | `d077583` (`.gitignore`) |
| `scripts/apply-clinical-integration.mjs` | Değişiklikleri zaten uygulanmış tek seferlik taşıma betiği | Silinmedi; ignore edildi | `d077583` (`.gitignore`) |
| `CLINICAL_DB_INSTALL_TR.md`, `DATA_MERGE_AUDIT_TR.md` | Taşıma paketindeki yerel kurulum/audit kopyaları | Kullanıcının mevcut ignore tercihi korundu | `d077583` (`.gitignore`) |
| `walktrough.md` | Proje kökünde istenen Faz 1 raporu | Korundu, operasyonel sonuçlarla güncellendi | `60f126e` + nihai docs commit'i |

### E. New commits created

```text
d077583 feat(etl): add clinical catalog import and verification
540a2c2 fix(admin): close platform staff CLI database connection
2864679 test(workspace): stabilize database integration validation
0462461 test(web): refresh panel visual baselines
fbd48c9 docs(admin): finalize phase one operational walkthrough
<current> docs(admin): record phase one push result
```

### F. Push

```text
branch pushed: master
remote: origin (https://github.com/mirhanayd/ogun.git)
result: PASS — 8b486e3..fbd48c9 master -> master
force push: no
```

Bu push-sonucu dokümantasyon commit'i ayrıca normal fast-forward push ile gönderilir; onun kesin hash'i kullanıcıya verilen son mesajdaki commit listesinde yer alır.

### G. Final repository state

Push-sonucu commit'inin normal fast-forward push'undan sonra doğrulanan hedef durum:

```text
## master...origin/master
```

Ignored yerel entegrasyon/veri paketleri diskte korunur fakat `git status --short` çıktısında görünmez ve push'a dahil değildir.

## 14. Kalan teknik borçlar

- Kritik platform mutasyonlarında business write ve platform audit write mümkün olduğunca aynı DB transaction içinde atomik yürütülmelidir.
- Faz 1 kapsamında staff mutation UI eklenmedi; `/platform-personeli` salt okunurdur.
- Better Auth/Drizzle peer sürümü planlı bir dependency upgrade ve regresyon çalışmasında ele alınmalıdır.
- Preview ortamları production veritabanını paylaşmamalı; ayrı preview DB kullanılmalıdır.
- Bağlı tarayıcı sağlandığında UI seviyesindeki admin login/enrollment/TOTP smoke’u ayrıca çalıştırılmalıdır.
