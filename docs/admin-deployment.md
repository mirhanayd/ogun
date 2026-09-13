# Ogun Operasyon dağıtımı

`apps/admin`, son kullanıcı web uygulamasından ayrı bir Next.js uygulamasıdır. Aynı canonical PostgreSQL veritabanını ve mevcut `users`/`accounts` kimliklerini kullanır; buna karşılık ayrı Better Auth yapılandırması, `admin_sessions` tablosu, cookie prefix'i ve sekiz saatlik oturum ömrü vardır.

## Ön koşullar

Migration'ı canonical veritabanına uygulayın:

```bash
pnpm --filter @ogun/db db:migrate
```

Bu migration `platform_staff`, `admin_sessions`, `two_factors`, `platform_audit_logs`, iki platform enum'u ve `users.two_factor_enabled` alanını ekler. Migration dosyası: `packages/db/drizzle/0031_overrated_layla_miller.sql`.

Gerekli ortam değişkenleri:

```dotenv
DATABASE_URL=postgresql://...
ADMIN_BETTER_AUTH_SECRET=<en-az-32-byte-rastgele-ve-web-secretindan-farkli>
ADMIN_BETTER_AUTH_URL=https://admin.example.com
OGUN_WEB_URL=https://app.example.com
RESEND_API_KEY=<resend-api-key>
RESEND_FROM_EMAIL=Ogun <bildirim@example.com>
```

Production'da `APP_ENV=production`, Preview'da `APP_ENV=staging` kullanılır.
Preview için `ADMIN_BETTER_AUTH_URL` sabitlenmez; uygulama Vercel'in deployment'a
özel `VERCEL_URL` değerini yalnızca doğrulanmış `*.vercel.app` origin'i olarak
kullanır. Böylece rastgele Preview URL'si production trusted-origin listesine
eklenmez. Preview ortamına `RESEND_API_KEY` veya `RESEND_FROM_EMAIL` taşınmaz;
email side effect'leri eksik provider yapılandırmasıyla fail-closed kalır.

Opsiyonel değişkenler `DATABASE_POOL_MAX`, `LOG_LEVEL` ve Sentry yapılandırmasıdır.
`CLINICAL_REVIEW_INVITATION_CAPTURE_PATH` yalnızca yerel/E2E capture içindir ve
Vercel ortamlarında tanımlanmamalıdır.

Secret örneğin `openssl rand -base64 32` ile üretilebilir. Secret'ı repoya, dokümana veya build loguna yazmayın. Uygulama `ADMIN_BETTER_AUTH_SECRET` eksikse bilinçli olarak başlatılmaz; normal `BETTER_AUTH_SECRET` değerine düşmez. `OGUN_WEB_URL`, admin server action'ının Better Auth 1.6.29 resmi `/api/auth/request-password-reset` endpoint'ine gittiği sabit normal web origin'idir; kullanıcı girdisinden türetilmez. Reset maili normal web auth callback'inde ortak `@ogun/email` paketi ve Resend üzerinden gönderilir.

## İlk super admin

Public admin signup kapalıdır. Önce kullanıcı normal Ogun hesabı olarak mevcut `users` tablosunda bulunmalıdır. Sonra repo kökünden:

```bash
pnpm --filter @ogun/db platform-admin:grant --email admin@example.com --role super_admin
```

Komut kullanıcı veya parola üretmez, secret basmaz ve yeniden çalıştırıldığında aynı personel kaydını güvenli biçimde aktifleştirip rolünü günceller. İşlem `source=bootstrap_cli` metadata'sıyla platform audit kaydı oluşturur.

Erişimi kapatmak ve o kullanıcıya ait admin session'larını iptal etmek için:

```bash
pnpm --filter @ogun/db platform-admin:revoke --email admin@example.com
```

İlk girişte personel e-posta/şifre ile doğrulanır ve TOTP etkin değilse dashboard yerine zorunlu kurulum ekranına yönlendirilir. QR kodu tarandıktan sonra yedek kodlar yalnızca kurulum state'inde gösterilir; sunucu loguna veya sonradan okunabilen bir UI'a yazılmaz.

## Yerel geliştirme

Kök `.env` dosyanıza local değerleri ekleyin, ardından:

```bash
pnpm install
pnpm --filter admin dev
```

Uygulama `http://localhost:3001` adresinde çalışır. Normal web uygulaması port 3000'de bağımsız kalır.

Doğrulama:

```bash
pnpm --filter @ogun/db typecheck
pnpm --filter @ogun/db test
pnpm --filter admin typecheck
pnpm --filter admin lint
pnpm --filter admin test
pnpm --filter admin build
```

## Vercel

Aynı GitHub reposundan ikinci bir Vercel Project oluşturun:

- Root Directory: `apps/admin`
- Framework Preset: Next.js
- Install Command: repo/pnpm varsayılanı
- Build Command: `pnpm build`
- Production domain: örneğin `admin.example.com`

Vercel Production, Preview ve ihtiyaç varsa Development ortamlarına doğru `DATABASE_URL`, `ADMIN_BETTER_AUTH_SECRET`, `ADMIN_BETTER_AUTH_URL`, `OGUN_WEB_URL`, `RESEND_API_KEY` ve `RESEND_FROM_EMAIL` değerlerini ekleyin. Preview deployment'ları canonical production veritabanına bağlanacaksa erişim ve veri etkisini ayrıca değerlendirin; mümkünse ayrı bir preview veritabanı kullanın.

Normal web ve admin projelerinde farklı Better Auth secret'ları kullanın. Cookie domain'ini üst domaine genişletmeyin; varsayılan host-only cookie davranışı ve `ogun-admin` prefix'i iki auth boundary'sinin çakışmasını önler.

## Güvenlik ve operasyon notları

- Platform yetkisi `clinic_members`, `owner` veya `clinical_admin` üzerinden türetilmez; tek kaynak `platform_staff` tablosudur.
- Session oluşturulmadan önce ve her korumalı server request'inde aktif personel kaydı yeniden kontrol edilir.
- Menü görünürlüğü yalnızca UX'tir; dashboard, audit ve personel sorguları server-side permission kontrolü yapar.
- Authorization-dependent sayfalar dinamik ve `revalidate=0` olarak işaretlidir.
- `platform_audit_logs` append-only'dir; DB query paketinden update/delete fonksiyonu export edilmez.
- Faz 1 admin sorguları danışan, ölçüm, laboratuvar, sağlık kaydı veya diyet planı tablolarını okumaz.
- Faz 2 cihaz kaydı MAC adresi, BIOS UUID, seri numarası veya donanım fingerprint'i toplamaz. Ogun Desktop ilk çalıştırmada 256 bit random installation ID üretir ve Stronghold'da saklar; sunucu yalnız SHA-256 hash'ini tutar. Bu kimlik bir auth credential veya donanım doğrulaması değildir.
- Device revoke yalnız ilgili `device_sessions` bağlarındaki normal `sessions` kayıtlarını sonlandırır; `admin_sessions` ve aynı kullanıcının browser oturumları etkilenmez.
