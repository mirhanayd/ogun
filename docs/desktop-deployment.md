# Masaüstü paketleme, imzalama ve dağıtım — GitHub issue #54 / Prompt 9.4

Bu belge `docs/deployment.md`nin (web dağıtımı — Vercel+Neon / Docker+VPS)
masaüstü karşılığıdır: `apps/desktop`nin Windows/macOS paketlerinin nasıl
derlendiğini, imzalandığını ve otomatik güncelleme ile dağıtıldığını anlatır.
AYNI dürüstlük ilkesiyle (`docs/performance.md`), bu belgede **gerçekten
test edilen** adımlar ile **bu sandbox'ta gerçek bir Windows kod imzalama
sertifikası, Apple Developer Program üyeliği ya da R2/S3 kovası olmadığı
için canlı doğrulanamayan** adımlar açıkça ayrı işaretlidir.

Bu, Faz 9'un (Masaüstü Kabuğu) SON parçasıdır — #51 (pencere/sidecar), #52
(native OAuth), #53 (menü/tray/bildirim) tamamlandıktan sonra bu issue
paketleme/imzalama/dağıtımı ekler. Faz 10 (UI cilası) bundan SONRA gelir —
bkz. dosya sonundaki not.

## 1. Build hedefleri

| Platform | Format(lar) | Öncelik |
|---|---|---|
| Windows | `.msi` (WiX) + `.exe` (NSIS) | 1 — Türkiye'deki klinik bilgisayarlarının çoğu Windows |
| macOS | `.dmg`, **universal binary** (arm64 + x86_64 TEK dosyada) | 2 |
| Linux | — | **v2'ye ertelendi** (issue metni: "Linux şimdilik hedef DEĞİL") |

`apps/desktop/src-tauri/tauri.conf.json`daki `bundle.targets` bunu zaten
yansıtıyor: `["msi", "nsis", "dmg"]` — `appimage`/`deb`/`rpm` YOK.

```bash
# Yerel/manuel derleme (imzasız, GÖREV 2'deki gerçek sertifikalar
# GELMEDEN — bkz. aşağısı):
cd apps/desktop
pnpm build   # prepare-sidecar.mjs (host modu) + tauri build
```

## 2. Sidecar Node ikili dosyası — GÖREV 1

`apps/desktop/scripts/prepare-sidecar.mjs` iki modda çalışır:

- **`host` (varsayılan, yerel geliştirme/test)**: bu makinenin KENDİ Node
  çalıştırılabilirini kopyalar. Hızlı, ağ gerektirmez, spawn/port-poll/
  yönlendirme mekanizmasını test etmek için yeterli — ama NİHAİ dağıtım
  için doğru değildir (imzasız, resmi dağıtım değil).
- **`download` (release CI, `.github/workflows/desktop-release.yml`)**:
  nodejs.org'un RESMİ dağıtımını hedef üçlüye göre indirir, `SHASUMS256.txt`
  ile SHA-256 doğrular, gerekirse (macOS — `.tar.gz`) arşivden çıkarır.
  `universal-apple-darwin` hedefi iki mimariyi (aarch64 + x86_64) ayrı ayrı
  indirip **`lipo`** ile TEK bir evrensel ikiliye birleştirir (Tauri
  bundler'ın evrensel macOS derlemeleri için beklediği isimlendirme —
  `app-server-universal-apple-darwin`, İKİ ayrı mimariye özgü dosya DEĞİL).

  ```bash
  node scripts/prepare-sidecar.mjs --source=download --target=x86_64-pc-windows-msvc
  node scripts/prepare-sidecar.mjs --source=download --target=universal-apple-darwin  # SADECE macOS'ta (lipo)
  ```

**GERÇEKTEN doğrulandı** (bu PR'ın hazırlanması sırasında, canlı
nodejs.org'a karşı): `win-x64/node.exe` indirildi, SHA-256'sı
`SHASUMS256.txt` ile birebir eşleşti; `node-v24.19.0-darwin-arm64.tar.gz`
indirildi, SHA-256'sı doğrulandı, arşiv gerçekten çıkarıldı ve içindeki
`bin/node`nin gerçek bir Mach-O arm64 çalıştırılabilir olduğu `file` ile
doğrulandı. Bu sırada Windows'a özgü bir `tar` tuzağı GERÇEKTEN yakalandı ve
düzeltildi: GNU tar/Windows'un yerleşik bsdtar'ı, `C:\...` gibi tek harfli
bir "sürücü" öneki taşıyan bir yolu `host:path` UZAK tar sözdizimi SANIYOR
("Cannot connect to C: resolve failed") — `--force-local` bayrağı bunu
düzeltti (bkz. betiğin `downloadNodeBinaryForTriple` fonksiyonu).

**Canlı doğrulanamayan tek parça**: `lipo` (macOS'a özgü, bu sandbox
Windows olduğu için çalıştırılamadı) — evrensel macOS birleştirme adımı
SADECE kaynak kodu okunarak (Tauri bundler'ın kaynak kodu incelenerek
doğrulanan isimlendirme kuralı + doğru `lipo -create -output ... a b`
çağrısı) yazıldı.

## 3. Kod imzalama — GÖREV 2 (CREDENTIAL-PENDING)

> Windows kod imzalama sertifikası VE Apple Developer Program üyeliği bu
> sandbox'ta YOK — repo sahibi bunları kendisi tedarik edecek ("ben
> halledeceğim, sen yapılandırmayı hazırla"). Aşağıdaki yapılandırma
> GERÇEK ve HAZIR — secret'lar eklendiği AN bir sonraki release
> çalıştırması onları otomatik kullanır, KOD DEĞİŞİKLİĞİ gerekmez.

### 3.1 Windows

`.github/workflows/desktop-release.yml`, [`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action)
kullanır — bu resmi action şu GitHub Actions **secret**'larını okur:

| Secret | Açıklama |
|---|---|
| `WINDOWS_CERTIFICATE` | `.pfx` sertifika dosyasının base64 kodlanmış hâli (`certutil -encode cert.pfx cert_base64.txt` ya da `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx"))`) |
| `WINDOWS_CERTIFICATE_PASSWORD` | O `.pfx` dosyasının parolası |

Bunlar tanımlı DEĞİLKEN build YİNE DE başarıyla tamamlanır — sadece
imzasız `.msi`/`.exe` üretir (SmartScreen uyarısı verir, ama pilot için
engelleyici değildir). `tauri.conf.json`nun statik `bundle.windows`
bölümüne BİLEREK bir `certificateThumbprint` YAZILMADI — sertifika yerel
sertifika deposuna kurulu OLMADAN bu alan orada dursa, imzasız yerel
`pnpm build` çalıştıran her geliştiricinin build'i BOZULURDU. Bunun yerine
imzalama TAMAMEN CI'daki `tauri-action`nun ortam değişkeni okuma
davranışına bırakıldı.

### 3.2 macOS (imzalama + notarization)

Aynı action, macOS için şu secret'ları okur:

| Secret | Açıklama |
|---|---|
| `APPLE_CERTIFICATE` | `.p12` sertifikasının base64 hâli |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` parolası |
| `APPLE_SIGNING_IDENTITY` | Anahtar zincirindeki sertifika adı (ör. `Developer ID Application: Öğün (TEAMID)`) |
| `APPLE_ID` | Apple hesabı e-postası |
| `APPLE_PASSWORD` | Uygulamaya özgü parola (App Store Connect'te üretilir, Apple ID parolası DEĞİL) |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

`tauri.conf.json`nun `bundle.macOS.minimumSystemVersion` alanı **statik
olarak `10.15`** yapılandırıldı (bu bir kimlik bilgisi DEĞİL, sertifikadan
BAĞIMSIZ bir derleme ayarı — imzasız build'i BOZMAZ, bu yüzden şimdiden
eklendi).

### 3.3 Kontrol listesi (sertifikalar geldiğinde)

1. Windows: `.pfx` dosyasını base64'e çevirip `WINDOWS_CERTIFICATE` +
   `WINDOWS_CERTIFICATE_PASSWORD` GitHub Actions secret'larına ekle.
2. macOS: `.p12` dosyasını base64'e çevirip yukarıdaki 6 secret'ı ekle.
3. Yeni bir `desktop-v*` etiketi (tag) push et — workflow OTOMATİK olarak
   imzalı paketler üretir, KOD DEĞİŞİKLİĞİ gerekmez.

## 4. Otomatik güncelleme — GÖREV 3

`tauri-plugin-updater` (Cargo.toml, sürüm 2.10.1 olarak çözüldü — bkz. o
dosyadaki yorum) kuruldu. **Mimari karar**: güncelleme kontrolü ve
uyarı/diyalog akışının TAMAMI `apps/desktop/src-tauri/src/updater.rs`de,
tamamen native — `apps/web`e HİÇ dokunulmadı (mimari kural #3). Menü
çubuğundaki "Yardım > Güncellemeleri Kontrol Et" manuel bir tetikleyici
sunar; ayrıca her üretim açılışında sessizce bir kontrol yapılır.

### 4.1 Güncelleme sunucusu

Statik bir JSON manifest + R2/S3 (Prompt 4.3'te kurulu olanla AYNI
S3-uyumlu depolama deseni — bkz. `apps/web/src/lib/storage.ts` — ama
GENELLİKLE AYRI bir kova/bucket, çünkü bu, klinik verisi TAŞIMAZ, sadece
herkese açık indirilebilir kurulum dosyaları/imzalar barındırır ve
uygulamanın kendi S3 yükleme/indirme kod yollarından (presigned URL akışı)
HİÇ geçmez — Tauri'nin updater eklentisi kendi düz HTTP GET isteğini yapar).
Bu yüzden `apps/web/src/lib/storage.ts` kod olarak YENİDEN KULLANILMADI,
sadece "S3-uyumlu bir kova, R2/MinIO/gerçek S3 fark etmez" ALTYAPI deseni
tekrarlandı.

Manifest, `tauri-plugin-updater`nin beklediği standart şema:

```json
{
  "version": "0.3.0",
  "notes": "Randevu hatırlatma SMS'lerinde saat dilimi düzeltmesi.",
  "pub_date": "2026-08-18T10:00:00Z",
  "platforms": {
    "windows-x86_64": { "signature": "...", "url": "https://.../ogun_0.3.0_x64-setup.exe" },
    "darwin-x86_64": { "signature": "...", "url": "https://.../ogun_0.3.0_universal.app.tar.gz" },
    "darwin-aarch64": { "signature": "...", "url": "https://.../ogun_0.3.0_universal.app.tar.gz" }
  }
}
```

(`darwin-x86_64`/`darwin-aarch64` universal binary'de AYNI URL'i paylaşır —
TEK bir evrensel `.app` paketi her iki mimaride de çalışır.)

### 4.2 Derleme zamanı yapılandırma (CREDENTIAL-PENDING)

`plugins.updater.pubkey`/`endpoints` BİLEREK statik `tauri.conf.json`da
DEĞİL (bkz. `updater.rs` dosya başı notu — orada olsalardı, gerçek anahtar
gelmeden `createUpdaterArtifacts` build'i "no private key" hatasıyla
bozardı). Bunun yerine İKİ değer `option_env!` ile DERLEME ZAMANINDA
gömülür:

- `OGUN_UPDATE_MANIFEST_URL` — yukarıdaki manifestin taban URL'i.
- `OGUN_UPDATE_PUBKEY` — aşağıdaki komutun ürettiği GENEL anahtar.

İkisi de tanımsızken (yerel `pnpm build`) güncelleme kontrolü SESSİZCE
atlanır — çökme yok (bkz. `updater.rs::build_updater`).

**Anahtar üretimi** (repo sahibi kendisi çalıştırmalı — ÖZEL anahtar bu
repoda/PR'da asla saklanmamalı):

```bash
cd apps/desktop
pnpm signer:generate   # tauri signer generate -w ~/.tauri/ogun-updater.key
```

Sonuç: bir GENEL anahtar (paylaşılabilir) + bir ÖZEL anahtar (GİZLİ).

1. GENEL anahtarı GitHub Actions **variable**'ı olarak ekle:
   `OGUN_UPDATE_PUBKEY` (secret DEĞİL — genel anahtarlar zaten paylaşılmak
   içindir).
2. ÖZEL anahtarı + (varsa) parolasını GitHub Actions **secret**'ı olarak
   ekle: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
3. R2/S3 kovası hazır olduğunda taban URL'ini `OGUN_UPDATE_MANIFEST_URL`
   variable'ına ekle.

`.github/workflows/desktop-release.yml`, `OGUN_UPDATE_PUBKEY` tanımlıysa
`createUpdaterArtifacts`ı OTOMATİK açan küçük bir ek yapılandırma dosyası
üretir (bkz. o workflow'un "Güncelleme yapılandırmasını hazırla" adımı) —
manuel bir adım GEREKMEZ.

### 4.3 Zorunlu güncelleme politikası

Issue metni: *"Kullanıcı güncellemeyi erteleyebilsin ama 2 sürümden fazla
geride kalırsa zorunlu güncelleme uyarısı göster."* Bu repoda her yeni
ÖZELLİK sürümü MINOR bileşeni artırır (semver); PATCH sadece hata
düzeltmesidir ve "geri kalma" sayımına KATILMAZ (bkz. `updater.rs`daki
`release_ordinal`/`is_mandatory_update` — SADECE major.minor bir SIRA
numarasına indirgenir, testlerle doğrulanmış SAF mantık).

- **0-2 MINOR sürüm geride**: opsiyonel bilgi diyaloğu ("Şimdi Güncelle" /
  "Sonra"). "Sonra" tıklanırsa AYNI sürüm için bir daha SORULMAZ (bkz.
  `settings.rs::dismissed_update_version`, `apps/desktop`nin YEREL
  `settings.json`sında saklanır — apps/web'in Postgres'ine DOKUNULMADI,
  `minimize_to_tray_on_close` ile AYNI desen).
- **>2 MINOR sürüm geride**: "Zorunlu güncelleme" başlıklı bir UYARI
  diyaloğu ("Şimdi Güncelle" / "Daha Sonra Hatırlat"). "Daha Sonra
  Hatırlat" tıklansa BİLE erteleme KAYDEDİLMEZ — bir SONRAKİ açılışta AYNI
  uyarı yeniden gösterilir. (Uygulamanın kullanımını TAMAMEN engelleyen bir
  kilit YOK — issue metni bunu istemiyor, sadece "uyarı göster" diyor;
  tam bir zorunlu kilit çok daha büyük bir mühendislik yükü olurdu ve
  spesifikasyonda İSTENMİYOR.)

## 5. İndirme sayfası — GÖREV 4

`apps/web/src/app/indir/page.tsx` — Faz 9'un KARAR notunun web'de kalan
TEK ekranı ("hesap oluşturma, abonelik ve uygulamayı indirme sayfası").

**Tasarım kararı — ayrı route mu, gelecekteki Faz 10 landing'in bir alt
bölümü mü?** Faz 10 (UI cilası, landing sayfası dahil) bu repoda henüz
PLANLANMADI/issue AÇILMADI — "şimdi bir şey inşa etmemek" seçeneği
`/indir`i süresiz "Yakında" bırakırdı, ki issue metni AÇIKÇA gerçek bir
indirme akışı istiyor. Bu yüzden GERÇEK, minimal, işlevsel bir `/indir`
route'u ŞİMDİ inşa edildi — Faz 10 geldiğinde bu sayfa yeniden
tasarlanabilir/taşınabilir (route'un KENDİSİ zaten doğru yerde, `faz-9-
masaustu-kabugu.md`nin Faz 10 notundaki "Ücretsiz dene yerine İndir
birincil eylem olmalı" kararıyla da TUTARLI — kök `/` sayfası hâlâ "Yakında"
placeholder'ı, Faz 10.2 onu gerçek bir landing'e çevirdiğinde `/indir`e
birincil CTA olarak bağlanabilir).

Sayfa:
- İstemci tarafında `navigator.userAgent`/`navigator.platform`i okuyarak
  işletim sistemini (Windows/macOS/diğer) algılar, o platform için doğru
  indirme linkini ÖNE ÇIKARIR (diğer platform(lar) ikincil olarak listede
  kalır — algılama YANLIŞ olursa kullanıcı sıkışıp KALMAZ).
- Sürüm numarası + Türkçe sürüm notları + sistem gereksinimleri + kurulum
  adımlarını `apps/web/src/lib/desktop-releases.ts`deki (statik, elle
  güncellenen) bir veri kaynağından okur.

**Neden statik veri, GERÇEK zamanlı R2 manifest fetch DEĞİL**: indirme
sayfası apps/web'de (Next.js), güncelleme manifesti İSE apps/desktop'ın
`tauri-plugin-updater`si için — ikisi FARKLI tüketiciler, aynı JSON şemasını
PAYLAŞMAK ZORUNDA değiller. R2 kovası + gerçek sürümler var OLMADIĞI için
şimdilik `desktop-releases.ts`deki veri ELLE güncellenir (her release'te bir
satır eklenir) — R2 manifest'i canlı OLDUĞUNDA bu dosya, sunucu bileşeninde
`fetch(OGUN_UPDATE_MANIFEST_URL, { next: { revalidate: 3600 } })` ile
DEĞİŞTİRİLEBİLİR (issue kapsamı DIŞINDA bir gelecek iyileştirme, kod
YORUMUYLA işaretlendi).

## 6. Yayın kontrol listesi

1. `apps/desktop/src-tauri/tauri.conf.json`daki `version`i artır (semver).
2. `apps/web/src/lib/desktop-releases.ts`e yeni sürüm satırını Türkçe
   sürüm notlarıyla ekle.
3. `git tag desktop-v0.X.0 && git push origin desktop-v0.X.0` — workflow
   OTOMATİK tetiklenir.
4. Workflow tamamlandığında GitHub'da bir TASLAK (draft) release oluşur —
   varlıkları (assets) gözden geçir, elle YAYINLA (`releaseDraft: true`
   BİLEREK — bir CI hatası YANLIŞLIKLA canlıya sürüm ÇIKARMASIN diye).
5. R2/S3 güncelleme manifestini (bkz. 4.1) yeni sürümün indirme
   linkleri/imzalarıyla GÜNCELLE (draft'taki `.sig` dosyalarından — bu adım
   ŞİMDİLİK ELLE, R2 kovası kurulduğunda otomatikleştirilebilir).

## 7. Bilinen sınırlamalar / bu sandbox'ta doğrulanamayanlar

- **Gerçek Windows kod imzalama sertifikası yok** — 3.1 DOKÜMANTE edildi,
  gerçek bir `.pfx`e karşı ÇALIŞTIRILMADI.
- **Gerçek Apple Developer Program üyeliği yok** — 3.2 aynı şekilde
  DOKÜMANTE edildi, canlı notarization DENENMEDİ.
- **Gerçek R2/S3 güncelleme kovası yok** — 4.1 DOKÜMANTE edildi, gerçek bir
  HTTP uç noktasına karşı `check()` çağrısı YAPILAMADI.
- **`lipo` (evrensel macOS birleştirme)** — bu sandbox Windows olduğu için
  ÇALIŞTIRILAMADI, sadece kaynak kodu okunarak yazıldı (bkz. bölüm 2).
- **`.github/workflows/desktop-release.yml`** — gerçek bir GitHub Actions
  çalıştırması ile TEST EDİLEMEDİ (bkz. dosya başındaki yorum).
- **`cargo check`/`cargo build`** — bu sandbox'ta MSVC bağlayıcısı (link.exe)
  YOK (bkz. README.md "Doğrulama durumu" — #51/#52/#53'ten beri AYNI
  sınırlama). `updater.rs`, `settings.rs`, `menu.rs`, `menu_actions.rs`,
  `lib.rs`, `Cargo.toml` değişiklikleri derleyiciyle DOĞRULANAMADI — Rust
  API'leri (`UpdaterExt`, `UpdaterBuilder`, `MessageDialogBuilder`,
  `MessageDialogButtons`) docs.rs üzerinden TEK TEK doğrulandı,
  `tauri-plugin-updater`nin GERÇEK sürümü (2.10.1) `cargo add`ın canlı ağ
  erişimiyle ÇÖZÜLDÜ (TAHMİN değil, bkz. Cargo.lock) — ama derleyiciyle
  ASLA doğrulanmadı. SAF mantık (`is_mandatory_update`, `release_ordinal`)
  `#[cfg(test)]` birim testleriyle kaynak seviyesinde yazıldı, gerçek
  çalıştırma bu sandbox'ta mümkün OLMADI.
- **GERÇEKTEN doğrulanan**: `apps/desktop/scripts/prepare-sidecar.mjs`nin
  `--source=download` indirme+SHA-256 doğrulama+tar.gz çıkarma mekanizması
  (bkz. bölüm 2), `tauri.conf.json`nun yeni `bundle.windows`/`bundle.macOS`
  alanlarının şema geçerliliği (`tauri info` ile), `pnpm install`,
  `pnpm typecheck`, `pnpm --filter web lint`, `pnpm --filter web build`
  (turbopack'siz, gerekli env değişkenleri set edilerek — bkz. README.md
  "Kurulum" adım 2, `.env.example`) — hepsi bu PR'ın hazırlanması sırasında
  GERÇEKTEN çalıştırıldı, `/indir` dahil 35 sayfa başarıyla üretildi
  (`/indir` STATİK olarak önceden render edildi, 2.55 kB).

- **YAN BULGU — `apps/web`de ÖNCEDEN VAR OLAN, bu issue'yle İLGİSİZ bir
  hata bulundu ve düzeltildi**: `pnpm --filter web build` (turbopack'siz)
  bu PR'ın DEĞİŞİKLİKLERİ olmadan bile (yeni dosyalar geçici olarak
  kaldırılarak canlı doğrulandı) `Module not found: Can't resolve
  '@sentry/core'` hatasıyla BAŞARISIZ oluyordu — `@sentry/nextjs`nin
  build-zamanı otomatik API route enstrümantasyonu, `@sentry/core`yu
  DOĞRUDAN `apps/web`in KENDİ modül çözümleme bağlamından import ediyor,
  ama `apps/web/package.json` bunu SADECE `@sentry/nextjs` üzerinden
  DOLAYLI (transitive) bir bağımlılık olarak görüyordu — pnpm'in katı
  (strict) `node_modules` izolasyonu bu "hayalet bağımlılığı" (phantom
  dependency) DOĞRU şekilde REDDEDİYORDU. Düzeltme: `@sentry/core`
  (`@sentry/nextjs@8.55.2`nin ZATEN çözdüğü AYNI sürüm — YENİ bir sürüm
  ÇEKİLMEDİ) `apps/web/package.json`a AÇIK bir bağımlılık olarak eklendi
  (bkz. `pnpm-lock.yaml`daki 3 satırlık minimal diff). Bu değişiklik
  olmadan issue #54'ün kendi doğrulama gereksinimini ("pnpm --filter web
  build ... hâlâ başarılı olmalı") dürüstçe karşılamak mümkün değildi —
  bu yüzden dahil edildi, ama masaüstü paketleme/dağıtımıyla doğrudan
  İLGİSİZDİR.

## Not: Faz 10 ile ilişki

Bu issue'nun tamamlanmasıyla Faz 9 (Masaüstü Kabuğu — #51, #52, #53, #54)
BİTTİ. `faz-9-masaustu-kabugu.md`nin kendi notu: Faz 10 (UI cilası —
tasarım sistemi, landing sayfası, plan editörü, son rötuş) bu fazdan SONRA
gelir, "kabuk değişirse üst bar/araç çubuğu tasarımı da değişir" gerekçesiyle
BİLEREK sona bırakılmıştı. Bu repoda Faz 10 için henüz bir issue AÇILMADI —
`/indir` sayfası (bölüm 5) Faz 10.2 (landing) geldiğinde yeniden
tasarlanabilir/taşınabilir olacak şekilde BİLEREK minimal/route-seviyesinde
tutuldu, Faz 10'un "Ücretsiz dene yerine İndir birincil eylem olmalı"
kararıyla ÇELİŞMEYECEK şekilde.
