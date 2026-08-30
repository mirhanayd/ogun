# Masaüstü native kimlik doğrulama — manuel test checklist

GitHub issue #52 / Prompt 9.2 — "Giriş → OAuth → geri dönüş → oturum
akışını E2E test et (Playwright'ın Tauri desteği kısıtlı olabilir,
gerekirse manuel test checklist'i docs/'a yaz ve neden
otomatikleştirilemediğini belirt)". Bu belge o gerekliliği karşılıyor.

## Neden otomatikleştirilemedi (dürüstlük notu)

`apps/e2e`'deki mevcut Playwright kurulumu (`apps/e2e/playwright.config.ts`)
**apps/web'i bir tarayıcıda** (Chromium/Firefox/WebKit) açıp sürüyor —
Playwright'ın çalışma modeli bu üç motordan birini KENDİSİ başlatmak
üzerine kurulu. Bu issue'nun test etmesi gereken akışın kendisi ise tam
olarak bunun DIŞINDaki üç mekanizma:

1. **Tauri penceresi** WebView2 (Windows) / WKWebView (macOS) kullanır —
   Playwright'ın desteklediği üç motordan HİÇBİRİ değil. Resmi olarak
   Tauri'nin `tauri-driver` + WebDriver protokolü var (webdriverio ile
   sürülebilir) ama bu apps/e2e'nin BUGÜNKÜ Playwright altyapısıyla ayrı,
   paralel bir araç zinciri gerektirir — bu PR'ın kapsamı bunu kurmak
   DEĞİL (issue metninin kendisi de bunu "gerekirse" diye şartlı bıraktı).
2. **Sistem tarayıcısına geçiş + geri dönüş** OS düzeyinde bir mekanizma
   (varsayılan tarayıcıyı açma, oradan `ogun://` şemasıyla geri çağrılma) —
   headless CI ortamında (apps/e2e'nin çalıştığı ortam) ne "varsayılan
   tarayıcı" kavramı ne de kayıtlı bir özel URL şeması handler'ı vardır.
3. **Google'ın kendisi** otomatikleştirilmiş girişleri güvenlik gereği
   ENGELLER (bkz. faz-9-masaustu-kabugu.md BAĞLAM notu, bu issue'nun asıl
   çıkış noktası) — gerçek bir Google hesabıyla, gerçek bir insan
   etkileşimi olmadan bu adımı test scriptiyle geçmek zaten mümkün değil.

Sonuç: bu üçü bir arada, GERÇEKÇİ bir CI otomasyonu şu an için pratik değil.
Aşağıdaki checklist bunun yerine kullanılacak.

## Ön koşullar

- `apps/desktop` bir geliştirme makinesinde (Windows önce, Prompt 9.4
  öncelik sırası) MSVC bağlayıcısı kurulu olarak derlenebiliyor olmalı
  (bu sandbox'ta MÜMKÜN DEĞİLDİ — bkz. PR açıklaması).
- `.env`'de gerçek `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Google Cloud
  Console'dan, "Authorized redirect URIs" listesine
  `{BETTER_AUTH_URL}/api/auth/callback/google` eklenmiş) ve gerçek bir test
  Google hesabı.
- `pnpm --filter desktop dev` (ya da üretim paketleme, bkz. README.md
  "Masaüstü geliştirme" bölümü) ile uygulama gerçekten AÇIK.

## 1 — E-posta + şifre girişi (regresyon kontrolü)

- [ ] Native pencerede `/giris`'e git, mevcut bir hesapla giriş yap.
- [ ] `/kurulum`'a (ya da daha önce klinik seçiliyse ana ekrana)
      yönlendiğini doğrula — bu akış issue #52 ile HİÇ DEĞİŞMEDİ, sadece
      regresyon olmadığını doğruluyoruz.

## 2 — Google OAuth (sistem tarayıcısı akışı)

- [ ] `/giris` sayfasında "Google ile devam et" düğmesine tıkla.
- [ ] **Pencere içinde DEĞİL, işletim sisteminin varsayılan tarayıcısında**
      Google'ın giriş ekranının açıldığını doğrula (uygulama penceresi
      olduğu sayfada — `/giris` — kalmalı, boş/beyaz bir ekrana GEÇMEMELİ).
- [ ] Sistem tarayıcısında Google hesabına gerçekten giriş yap.
- [ ] Google'dan dönüşte tarayıcının **"Öğün'ü açmak istiyor musunuz?"**
      (ya da tarayıcıya göre benzer bir ifade) türünde bir onay istediğini
      doğrula — bu, özel URL şemaları için tarayıcıların STANDART, beklenen
      davranışıdır, bir HATA değildir (bkz. apps/web/src/app/api/auth/
      native/callback/route.ts dosya başı notu).
- [ ] Onayladıktan sonra Öğün masaüstü uygulamasının **öne geldiğini**
      (ya da zaten açıksa öne çıktığını) ve otomatik olarak `/kurulum`'a
      (ya da giriş yapılmış ana ekrana) yönlendiğini doğrula — bu esnada
      ARA bir "yükleniyor" ekranından hızlıca geçmesi normal.
- [ ] Google girişini (Google'ın kendi ekranında "İptal" ya da hesap
      seçmeden geri dönerek) **BAŞARISIZ** kıl. "Google ile devam et"
      düğmesi SONSUZA KADAR "Yönlendiriliyor…" durumunda TAKILI
      KALMAMALI — `/giris`'e dönüp anlamlı bir hata bildirimi (toast)
      göstermeli (kod incelemesi PR #56'da bulunup düzeltilen hata —
      önceden Rust tarafı bu geri dönüşü hiç ayrıştırmıyordu).
- [ ] **Soğuk başlangıç varyantı**: Google girişini BAŞLAT, sistem
      tarayıcısı açıldıktan SONRA masaüstü uygulamasını (girişi henüz
      TAMAMLAMADAN) tamamen KAPAT. Tarayıcıda girişi tamamla — bu,
      uygulamayı `ogun://auth/callback` ile YENİDEN başlatmalı ve
      (React henüz mount olmamışken gelen olayı `PendingDeepLink` +
      `notify_frontend_ready` el sıkışması sayesinde kaybetmeden)
      normal şekilde `/kurulum`'a inmeli — SESSİZCE hiçbir şey
      olmaması (3 dakika sonra token'ın sessizce süresinin dolması)
      bir REGRESYONDUR.

## 3 — Oturum kalıcılığı (uygulama kapat/aç)

- [ ] Adım 2'deki (ya da adım 1'deki) oturum AÇIKKEN uygulamayı tamamen
      kapat (pencereyi kapatmak yeterli olmayabilir — Prompt 9.3'te tray
      davranışı eklenene kadar şu an X = gerçek kapanış).
- [ ] Uygulamayı yeniden aç.
- [ ] **Giriş ekranına DÜŞMEDEN**, doğrudan oturum açık bir ekranda
      (ör. `/kurulum` ya da ana panel) başladığını doğrula — bu, bearer
      token'ın stronghold'dan (bkz. secure_storage.rs) okunup
      auth-client.ts'e enjekte edildiğini kanıtlar.
- [ ] (İsteğe bağlı, ileri düzey doğrulama) Uygulamanın app-local-data
      dizinini (Windows: `%LOCALAPPDATA%\app.ogun.desktop\`) incele —
      `native-session.stronghold` VE `native-session.salt` dosyalarının
      var olduğunu, ama `native-session.stronghold` dosyasının düz metin
      bir editörle AÇILAMADIĞINI (şifreli/ikili olduğunu) doğrula.
- [ ] Kullanıcı menüsünden **"Çıkış yap"**'a tıkla, uygulamayı TAMAMEN
      kapatıp yeniden aç. Doğrudan `/giris` ekranında başlaMALI —
      OTOMATİK olarak tekrar oturum açılmamalı (kod incelemesi PR #56'da
      eklendi: "çıkış yap" artık stronghold'daki bearer token'ı da siler,
      aksi halde çıkış native'de kalıcı OLMAZDI).

## 4 — Şifremi unuttum (deep link e-postası)

- [ ] Native pencerede `/sifremi-unuttum`'a git, test hesabının
      e-postasını gir, gönder.
- [ ] Gelen e-postadaki bağlantının `ogun://auth/reset-password?token=...`
      ile BAŞLAYAN (ya da ona 302 ile yönlenen bir
      `{BETTER_AUTH_URL}/api/auth/reset-password/...` linki OLDUĞUNU;
      NORMAL bir `/sifre-sifirla?token=...` web linki OLMADIĞINI) doğrula.
- [ ] E-postadaki linke tıkla (masaüstü uygulaması AÇIKKEN).
- [ ] Tarayıcının deep link onayından sonra Öğün'ün öne geldiğini ve
      doğrudan `/sifre-sifirla` sayfasında (token ÖN DOLDURULMUŞ, "Yeni
      şifre" alanı hazır) açıldığını doğrula.
- [ ] Yeni şifreyi belirle, `/giris`'e yönlendiğini ve yeni şifreyle giriş
      YAPILABİLDİĞİNİ doğrula.
- [ ] **Soğuk başlangıç varyantı** (üretim paketinde, ideal olarak): aynı
      adımları uygulama TAMAMEN KAPALIYKEN tekrarla — linke tıklamak
      uygulamayı BAŞLATMALI (paketlenmiş renderer hazır → doğrudan
      `/sifre-sifirla`), ara bir kök sayfaya SIÇRAMAMALI.

## 5 — Web (tarayıcı) regresyon kontrolü

- [ ] Aynı `/giris`, `/kayit`, `/sifremi-unuttum` sayfalarını DÜZ bir
      tarayıcıda (Chrome/Edge/Firefox, Tauri DIŞINDA) aç.
- [ ] Google düğmesinin (varsa) `/kurulum` ve `/giris`'e (native'deki
      `/api/auth/native/callback` KÖPRÜSÜNE DEĞİL) yönlendiğini doğrula.
- [ ] "Şifremi unuttum" linkinin `ogun://` DEĞİL, normal
      `/sifre-sifirla?token=...` web linki ürettiğini doğrula.
- [ ] E-posta+şifre girişi/kaydı issue #52'DEN ÖNCEKİYLE AYNEN aynı
      şekilde çalışmaya devam ettiğini doğrula (regresyon YOK).

## Otomatikleştirilebilen kısım — mevcut durum

`apps/web/src/lib/native-shell.test.ts` (vitest), `isNativeShell()` /
`getGoogleSignInRedirects()` SAF mantığını (Tauri çalışma zamanı
GEREKTİRMEDEN) zaten kapsıyor. `apps/desktop/src-tauri/src/deep_link.rs`
ve `secure_storage.rs`'teki `#[cfg(test)]` birim testleri de aynı şekilde
SAF URL ayrıştırma/anahtar türetme mantığını (Tauri `AppHandle`
gerektirmeden) kapsıyor — bkz. o dosyaların "Bu testler Tauri çalışma
zamanı GEREKTİRMEZ" notları. Yukarıdaki checklist SADECE gerçek OS/tarayıcı/
Google etkileşimi gerektiren kısmı kapsıyor.
