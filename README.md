# ogun

pnpm + Turborepo ile yönetilen monorepo.

## Kurulum

1. Bağımlılıkları kurun:

   ```bash
   pnpm install
   ```

2. Ortam değişkenlerini ayarlayın:

   ```bash
   cp .env.example .env
   ```

3. Yerel Postgres'i başlatın:

   ```bash
   docker compose up -d
   ```

4. Geliştirme sunucularını çalıştırın:

   ```bash
   pnpm dev
   ```

## Masaüstü geliştirme (Tauri)

GitHub issue #51 / Faz 9 — `apps/desktop`, apps/web'i saran bir Tauri 2.x
native pencere kabuğudur. apps/web'in kod tabanı bu paketten ETKİLENMEZ;
Tauri sadece onu SARAR (bkz. `faz-9-masaustu-kabugu.md`'deki mimari not:
bu OFFLINE bir uygulama değil, klinik verisi merkezi Postgres'te kalır).

### Gereksinimler

- [Rust + Cargo](https://www.rust-lang.org/tools/install) (stabil kanal)
- Windows: "C++ ile masaüstü geliştirme" iş yükü (Visual Studio Build
  Tools, MSVC bağlayıcısı için) + [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
  (çoğu güncel Windows kurulumunda zaten mevcuttur)
- macOS: Xcode Command Line Tools
- Linux: `webkit2gtk`, `libayatana-appindicator3` (bkz. [Tauri önkoşulları](https://v2.tauri.app/start/prerequisites/))

### Geliştirme

```bash
# Web dev sunucusunu (next dev, :3000) ve Tauri penceresini birlikte başlat:
pnpm dev

# Ya da sadece masaüstü kabuğunu (apps/web'in ayrı bir terminalde
# `pnpm --filter web dev` ile zaten çalışıyor olması gerekir):
cd apps/desktop && pnpm tauri dev
```

Geliştirmede pencere doğrudan `http://localhost:3000`'e işaret eder — hot
reload apps/web'in kendi `next dev` sunucusundan gelir, kabuk tarafında
EK bir şey gerekmez.

### Üretim paketleme

```bash
cd apps/desktop
pnpm build   # apps/web'i standalone modda derler + Node sidecar hazırlar + tauri build çalıştırır
```

Üretimde Next.js API route'ları ve server action'lar GERÇEK bir sunucu
gerektirdiğinden (statik export YETERSİZ), Tauri apps/web'in standalone
çıktısını yerelde başlatan küçük bir Node sidecar süreci paketler (bkz.
`apps/desktop/src-tauri/src/sidecar.rs` ve `apps/desktop/scripts/prepare-sidecar.mjs`).

NOT (Windows): standalone çıktısı (`STANDALONE_BUILD=1`) pnpm'in
node_modules'teki symlink'lerini kopyalamaya çalışır — Windows
Geliştirici Modu ya da yönetici izni yoksa `EPERM: symlink` hatası
verir (bkz. #46, docs/deployment.md "Bilinen sınırlamalar" — bu YENİ bir
sorun değil, Docker/Linux'ta karşılaşılmaz).

### Native kimlik doğrulama (OAuth + deep link) — GitHub issue #52

Masaüstü uygulamasında Google girişi **sistem tarayıcısında** açılır
(gömülü webview'lerde Google tarafından engellenir) ve geri dönüşte
`ogun://auth/callback` özel URL şeması ile uygulamaya devredilir; "şifremi
unuttum" e-postası da native'de aynı şemayı (`ogun://auth/reset-password`)
kullanır. Oturum, tarayıcı çerezine değil Tauri'nin stronghold tabanlı
güvenli depolamasına (bearer token) yazılır — uygulama kapatılıp
açıldığında oturum otomatik devam eder. Ayrıntılı mimari/güvenlik kararları
için `apps/desktop/src-tauri/src/deep_link.rs`, `secure_storage.rs` ve
`apps/web/src/app/api/auth/native/callback/route.ts` dosya başı notlarına,
manuel test adımları için `docs/desktop-native-auth-manual-testing.md`'ye
bakın.

### Native entegrasyonlar (menü, tray, bildirimler, dosya diyalogları) — GitHub issue #53

Native menü çubuğu (Dosya/Düzen/Görünüm/Yardım, macOS'ta ayrıca bir "Öğün"
uygulama menüsü), görev çubuğu (tray) simgesi (sağ tık: bugünün randevuları
özeti, yeni danışan, uygulamayı aç, çıkış — pencere kapatma X'i varsayılan
olarak tray'e küçültür, `/ayarlar`'daki "Masaüstü uygulaması" kartından
kapatılabilir), OS native bildirimleri (bkz. `apps/web/src/components/
native-notification-bridge.tsx` — apps/web panel özetini periyodik okuyup
Rust'a "göster" der, karar mantığı apps/web'de kalır) ve native dosya
diyalogları (PDF "Farklı Kaydet", belge yükleme için native seçici +
pencere geneli sürükle-bırak) eklendi. Ayrıntılı mimari kararlar (menü API
kaynağı, bildirim köprüleme yönü, tray tercihi depolama yeri, deep-link tipi
genişletmesi) için `apps/desktop/src-tauri/src/menu.rs`, `tray.rs`,
`notifications.rs`, `settings.rs` ve `deep_link.rs` dosya başı notlarına
bakın.

### Paketleme, imzalama ve dağıtım — GitHub issue #54

Windows (.msi + .exe/NSIS) ve macOS (.dmg, universal arm64+x86_64) paketleri,
kod imzalama (credential-pending — sertifikalar geldiğinde otomatik
aktifleşir), `tauri-plugin-updater` ile otomatik güncelleme (2 sürümden
fazla geride kalınca zorunlu güncelleme uyarısı) ve `apps/web/src/app/indir`
indirme sayfası eklendi. **Bu, Faz 9'un (Masaüstü Kabuğu) SON parçasıdır —
#51/#52/#53/#54 ile faz tamamlandı.** Ayrıntılar (sertifika kurulumu, sürüm
yayınlama kontrol listesi, güncelleme manifest şeması) için
`docs/desktop-deployment.md`ye bakın.

### Doğrulama durumu (dürüstlük notu)

Bu sandbox'ta MSVC bağlayıcısı (link.exe) VE Windows SDK import
kütüphaneleri (kernel32.lib vb.) kurulu DEĞİL (`tauri info` bunu
bağımsız olarak doğruluyor). Sonuç: `cargo build` BAĞLANAMADI; `cargo
check` bile bağımlılıkların (serde, thiserror, proc-macro2 vb.) build
script'lerini çalıştırmak için linklemeye ihtiyaç duyduğundan AYNI
şekilde başarısız oldu — yani Rust kodu derleyiciyle DOĞRULANAMADI,
sadece tauri/tauri-plugin-* paketlerinin gerçek kaynak kodu okunarak
dikkatli yazıldı. Gerçek bir pencere açılıp GÖRSEL olarak test edilmesi
de mümkün değildi (headless ortam). Issue #52'nin deep-link/stronghold
eklentileri de AYNI şekilde (`cargo add`/`cargo fetch` gerçek ağ erişimiyle
ÇALIŞTI, sürümler doğrulandı — ama `cargo check` yine link.exe'de
başarısız oldu) sadece kaynak kodu okunarak doğrulandı. Issue #53'ün YENİ
bağımlılıkları (tauri-plugin-notification 2.3.3, tauri-plugin-dialog 2.7.2,
tauri-plugin-fs 2.5.1) da AYNI şekilde `cargo add` ile gerçek ağ erişimiyle
çözüldü/doğrulandı, `cargo check` ise AYNI linker hatasıyla (bu sefer daha
erken, `proc-macro2`/`serde` build script'lerinde) başarısız oldu — Rust
API'leri (Menu/MenuBuilder/TrayIconBuilder/NotificationBuilder/vb.) docs.rs
üzerinden tek tek doğrulanarak, ama derleyiciyle DOĞRULANMADAN yazıldı. Bu
YENİ Rust modüllerindeki (`menu.rs`, `tray.rs`, `notifications.rs`,
`menu_actions.rs`, `settings.rs`, `window_ops.rs`, `deep_link.rs`'e eklenen
kısımlar) SAF mantık (id ayrıştırma, URL inşası, ayar (de)serileştirme, zoom
sınırlama) `cargo test`'le DEĞİL ama `#[cfg(test)]` birim testleriyle
kaynak seviyesinde doğrulanmıştır — gerçek çalıştırma bu sandbox'ta mümkün
olmadı. JS/TS tarafı (apps/web) TAM olarak doğrulandı: `pnpm typecheck`,
`pnpm --filter web lint`, `pnpm --filter web test` (yeni testler dahil) ve
`pnpm --filter web build` (turbopack'siz) hepsi geçti. Ayrıntılar için
ilgili PR açıklamalarına bakın.

Issue #54'ün YENİ bağımlılığı `tauri-plugin-updater` de AYNI şekilde
(`cargo add` gerçek ağ erişimiyle 2.10.1'e ÇÖZÜLDÜ, `cargo check` AYNI
linker hatasıyla başarısız oldu) sadece docs.rs üzerinden doğrulanan Rust
API'leriyle (`UpdaterExt`, `UpdaterBuilder`, `MessageDialogBuilder`) yazıldı
— derleyiciyle DOĞRULANAMADI. Buna KARŞILIK,
`apps/desktop/scripts/prepare-sidecar.mjs`'in yeni `--source=download`
mekanizması (platforma özgü resmi Node dağıtımını indirme + SHA-256
doğrulama + tar.gz çıkarma) bu PR'ın hazırlanması sırasında canlı
nodejs.org'a karşı GERÇEKTEN test edildi (bkz.
`docs/desktop-deployment.md` bölüm 2 — bir Windows'a özgü `tar` tuzağı
GERÇEKTEN yakalanıp `--force-local` ile düzeltildi). `lipo` (evrensel macOS
birleştirme) VE `.github/workflows/desktop-release.yml` (gerçek bir GitHub
Actions çalıştırması) bu sandbox'ta doğrulanamadı — ayrıntılar için
`docs/desktop-deployment.md`nin "Bilinen sınırlamalar" bölümüne bakın.
