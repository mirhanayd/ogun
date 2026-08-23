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

`apps/desktop`, ortak web arayüzünü kullanan bir Tauri 2.x istemcisidir.
Üretimde önce paketlenmiş yerel çalışma alanı açılır: bağlantı varsa canlı
web uygulamasına geçer, bağlantı yoksa kayıtlı cihaz hesabı + PIN ile
şifreli çevrimdışı çalışma alanını açar. Klinik verisinin merkezi kaynağı
Postgres olarak kalır; cihaz değişiklikleri bağlantı gelince uzlaştırılır.

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
pnpm build   # Tauri uygulamasını ve platform installer'larını derler
```

Üretim paketi yerel başlangıç/çevrimdışı arayüzü içerir ve bağlantı varken
`https://ogun-web.vercel.app` adresine geçer. Neon bağlantı bilgisi, Better
Auth secret'ı veya başka bir sunucu `.env` değeri installer'a konmaz. API
route'ları ve server action'lar Vercel'deki web sunucusunda çalışır.

### Çevrimdışı çalışma ve cihaz PIN'i

İlk başarılı masaüstü girişinde kullanıcıdan 4-8 rakamlı bir cihaz PIN'i
istenir. PIN Argon2id ile özetlenir; profil, klinik snapshot'ı ve bekleyen
mutasyon günlüğü Tauri Stronghold kasasında tutulur. Uygulama kapatılsa bile
kuyruk kaybolmaz. İnternet geldiğinde danışan, plan ve randevu oluşturma
kayıtları idempotent kimliklerle sunucuya aktarılır; plan editörünün son
taslağı da kapanışlar arasında kalıcıdır. Açıkça "Çıkış yap" seçilirse cihaz
profili ve ona ait çevrimdışı snapshot kaldırılır; yalnızca pencereyi veya
uygulamayı kapatmak bunları silmez.

E-posta/WhatsApp gönderimi, buluta belge yükleme ve başka bir harici servise
ulaşmayı gerektiren işlemler doğal olarak bağlantı bekler. Mimari ve senkron
kuralları için `docs/desktop-offline.md` dosyasına bakın.

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

### Doğrulama durumu

Windows MSVC araç zinciri bu çalışma ortamında kuruludur. Tauri release
binary'si `pnpm --filter desktop tauri build --no-bundle` ile üretildi;
Rust kitaplığının 60 testi, web typecheck/lint/test ve Next.js production
build'i geçti. Kod imzalama sertifikası tanımlı olmadıkça üretilen Windows
installer'ı imzasızdır ve SmartScreen uyarısı gösterebilir.

Release, kod imzalama ve otomatik güncelleme akışının ayrıntıları için
`docs/desktop-deployment.md` dosyasına bakın.
