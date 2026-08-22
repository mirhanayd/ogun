# Öğün masaüstü dağıtımı

Bu belge Windows/macOS masaüstü paketlerinin mimarisini, yerel derlemesini
ve release akışını açıklar.

## 1. Güvenlik mimarisi

Desktop uygulaması ince bir Tauri istemcisidir. Production'da doğrudan
`https://ogun-web.vercel.app` adresini açar; API route'ları, server action'lar
ve kimlik doğrulama sunucuda çalışır.

Installer'a şunlar **konmaz**:

- `DATABASE_URL` veya Neon kimlik bilgileri,
- `BETTER_AUTH_SECRET`, Google OAuth secret'ı ya da başka `.env` değerleri,
- Node.js runtime/sidecar,
- Next.js standalone sunucu çıktısı.

Remote Tauri IPC yetkisi `src-tauri/capabilities/default.json` içinde yalnızca
production domain'i ve localhost geliştirme adresleriyle sınırlıdır. Native
oturum token'ı Tauri Stronghold kasasında şifreli tutulur.

## 2. Yerel geliştirme ve derleme

Geliştirme sırasında web sunucusunu ve desktop kabuğunu ayrı terminallerde
çalıştırın:

```powershell
pnpm --filter web dev
pnpm --filter desktop dev
```

Windows NSIS installer:

```powershell
pnpm --filter desktop tauri build --bundles nsis
```

Çıktı:

```text
apps/desktop/src-tauri/target/release/bundle/nsis/Öğün_<sürüm>_x64-setup.exe
```

Tüm yapılandırılmış platform paketleri için:

```powershell
pnpm --filter desktop build
```

## 3. Sürüm numarası

Aşağıdaki dört dosya aynı semver değerini taşımalıdır:

- `apps/desktop/package.json`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/Cargo.lock` (`ogun-desktop` paketi)
- `apps/desktop/src-tauri/tauri.conf.json`

Web indirme sayfasının yayın bilgisi
`apps/web/src/lib/desktop-releases.ts` dosyasındadır.

## 4. GitHub Release

`.github/workflows/desktop-release.yml`, `desktop-v*` etiketi push edildiğinde
Windows ve macOS paketlerini derler ve taslak GitHub Release oluşturur:

```powershell
git tag desktop-v0.1.9
git push origin desktop-v0.1.9
```

Taslak release'in dosyaları kontrol edildikten sonra yayınlanması gerekir.
Windows kod imzalama sertifikası yoksa installer yayınlanabilir ancak
Windows SmartScreen yayıncı doğrulama uyarısı gösterebilir; `/indir` sayfası
bu durumu kullanıcıya açıkça bildirir.

## 5. Kod imzalama ve notarization

Workflow aşağıdaki GitHub Actions secret'ları tanımlıysa imzalama yapar:

- Windows: `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`
- macOS: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`
- Tauri updater: `TAURI_SIGNING_PRIVATE_KEY`,
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Updater için ayrıca `OGUN_UPDATE_PUBKEY` ve
`OGUN_UPDATE_MANIFEST_URL` repository variable'ları kullanılır. Bu
değerler tanımlı değilse uygulama açılır; otomatik güncelleme kontrolü
sessizce devre dışı kalır.

## 6. Yayın kontrol listesi

1. Dört desktop sürüm alanını birlikte artır.
2. `/indir` release verisini ve Türkçe sürüm notlarını güncelle.
3. `cargo test --lib`, web typecheck/lint/test ve installer build'i çalıştır.
4. Installer binary'sinde `.env`, Neon host'u ve auth secret bulunmadığını
   kontrol et.
5. `desktop-v<version>` etiketini push et.
6. GitHub Actions çıktılarını kontrol et ve release'i yayınla.
7. `/indir` butonunun gerçek asset'i indirdiğini production'da doğrula.
