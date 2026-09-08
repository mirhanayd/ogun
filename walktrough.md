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

### Başarısız root test

```text
pnpm test
```

Nedenler:

1. ETL entegrasyon testleri uzak Neon veritabanında migration 0031 uygulanmadığı için `column "two_factor_enabled" of relation "users" does not exist` hatası verdi.
2. `packages/etl/src/rxnorm-db.test.ts` 5 saniyelik timeout'a ulaştı.

Admin, DB, web, desktop, PDF ve nutrition testlerinin root test çalışması sırasında tamamlanan kısımları başarılıydı. Root test migration sonrasında yeniden çalıştırılmalıdır.

## 13. Bilinen açık noktalar ve mimari riskler

- Migration uzak veritabanına henüz uygulanmadı.
- Gerçek kullanıcıyla uçtan uca login/TOTP testi migration sonrasında yapılmalı.
- Root ETL testlerindeki RxNorm timeout'u admin kapsamı dışında ayrıca incelenmeli.
- Better Auth 1.6.29, repodaki Drizzle 0.38.x için daha yeni bir peer sürümü öneriyor; mevcut web uygulamasında da görülen bu peer uyarısı Faz 2 öncesinde planlı upgrade/regresyon çalışması gerektiriyor.
- Preview Vercel deployment'larının production veritabanına bağlanması veri ve erişim riski taşır; ayrı preview DB tercih edilmelidir.
- Kritik gelecekteki admin mutasyonlarında business write ile audit write aynı DB transaction'ında yapılmalıdır.
- Faz 1 kapsamında staff mutation UI eklenmedi; `/platform-personeli` salt okunurdur.

## 14. Commit listesi

Bu görevde oluşturulan commitler:

```text
27ba86b test(admin): add admin security tests and deployment documentation
df66e8f feat(admin): add platform RBAC and audit foundation
4ed16df feat(admin): scaffold operations app with isolated authentication and MFA
e4ac566 feat(db): add platform staff and admin auth foundation
```

Bu `walktrough.md` dosyası yukarıdaki commitlerden sonra, kullanıcının son rapor talebi üzerine oluşturulmuştur ve ayrı bir dokümantasyon commit'inde tutulmalıdır.

## 15. Push sonucu

Push yapılmadı.

Kontrol sırasında branch durumu:

```text
master...origin/master [ahead 12]
```

Bu görevden önce oluşturulmuş sekiz yerel commit de push kapsamına girecekti. Kullanıcıya ait geçmiş commitleri istemeden origin'e göndermemek için işlem durduruldu.

## 16. Final `git status --short`

Son rapor commit'inden önce çalışma ağacında kullanıcıya ait ve bu görev boyunca korunmuş değişiklikler:

```text
 M .gitignore
?? ogun-clinical-db-integration/
?? packages/etl/src/importers/clinical.ts
?? packages/etl/src/verify-clinical.ts
?? scripts/apply-clinical-integration.mjs
```

`walktrough.md`, bu rapor için yeni eklenen dosyadır. Yukarıdaki mevcut kullanıcı değişiklikleri admin commitlerine dahil edilmemiş, silinmemiş veya değiştirilmemiştir.

## Devam etme kontrol listesi

Kredi yenilendiğinde veya çalışma başka bir oturumda sürdürüldüğünde:

1. `git status --short` ile kullanıcı değişikliklerini yeniden doğrula.
2. Hedef Neon veritabanının doğru ortam olduğundan emin ol.
3. `pnpm --filter @ogun/db db:migrate` çalıştır.
4. İlk staff kullanıcısını bootstrap et.
5. Admin login → enrollment → TOTP challenge → dashboard akışını gerçek tarayıcı ve kullanıcıyla doğrula.
6. `pnpm test` komutunu yeniden çalıştır.
7. RxNorm timeout devam ederse admin değişikliklerinden bağımsız baseline olarak araştır.
8. `walktrough.md` dosyasını dokümantasyon commit'i olarak kaydet.
9. Push edilecek sekiz önceki commit için kullanıcı niyetini doğrula veya güvenli ayrı branch stratejisi belirle.
