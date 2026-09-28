# Desktop 0.3.6 doğrulaması

Bu aday, klinik çalışma alanı UI yenilemesinin Tauri local-first uygulamasına ortak kaynaklardan doğru taşındığını doğrular. Desktop renderer yeni `AppShellFrame`, `SidebarNavView`, danışan listesi ve danışan profilini doğrudan `apps/web/src` içinden paketler; veri erişimi yerel şifreli repository adapter'larında kalır.

## Doğrulanan davranışlar

- Kapalı navigasyon rayı, bağımsız panel düğmesi, hover/focus ile açılan alt menü ve hızlı danışan bağlantıları desktop bundle içinde render edilir.
- Danışan listesi, arama, filtre, çoklu seçim, atama, arşivleme, mobil düzen ve boş/hata durumları ortak ekran üzerinden çalışır.
- Danışan profili sekmeleri, ölçüm ve plan görünümleri açık/koyu temada ve geniş/tablet/mobil ölçülerde taşma üretmez.
- Native başlık çubuğu kullanılırken klinik kimliği; sayfa başlığı ve profil breadcrumb alanıyla çakışmaz.
- Klinik marka rengi, rol bazlı navigasyon ve offline yerel repository sınırı korunur.
- Native PIN/vault, şifreli SQLite, outbox, deep link, pencere ve updater politikalarının Rust testleri geçer.

## Sonuçlar

- Desktop TypeScript typecheck: PASS.
- Offline desktop kaynak testleri: 15/15 PASS.
- Desktop ilişkili web testleri: 14/14 PASS.
- Production CSS/layout/klinik çalışma alanı testleri: 3/3 PASS.
- Native Rust testleri: 75/75 PASS.
- Tauri release build: PASS.
- Windows ProductVersion: `0.3.6`.
- EXE, NSIS ve MSI içinde yerel hassas env değerleri: 0 eşleşme.
- Authenticode: imzasız yerel aday.

## Installer'lar

Kök: `apps/desktop/src-tauri/target/release-artifacts/0.3.6/`

- `Ogun_0.3.6_x64-setup.exe` — 7.412.947 byte — SHA-256 `7816a8cde6c9fe6c2460ad8f853f62c992e4f5a5395c5f0ae13c9b14f3367d0a`
- `Ogun_0.3.6_x64_tr-TR.msi` — 9.687.040 byte — SHA-256 `37778c3a45ad24c81179132a77e620cc826bcefeda5eb6607db11ac1d0ecd776`
- Test edilen `ogun-desktop.exe` — SHA-256 `563c0715aef2733cbeb2ce71b6d42c62562702b0187cb15c41b7d8a2d73915b1`

Installer kurulumu ve gerçek hesapla packaged authenticated smoke bu adımda çalıştırılmadı; bunlar kullanıcı cihaz durumunu ve ayrı sentetik PostgreSQL fixture'ını değiştirir. GitHub Release, updater imzası, macOS DMG ve web indirme metadata'sı yayınlanmadı.
