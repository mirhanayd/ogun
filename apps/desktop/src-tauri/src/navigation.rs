//! GitHub issue #51 / Prompt 9.1, GÖREV 3 — "Dış bağlantı davranışı."
//!
//! apps/web'in KODU DEĞİŞMEYECEĞİ için (mimari kural, bkz. issue #51),
//! "uygulama içinden tıklanan http(s) linkler sistem tarayıcısında açılsın"
//! kuralı apps/web'e bir tıklama işleyicisi EKLEMEDEN, tamamen native kabuk
//! seviyesinde (Tauri'nin `on_navigation` engelleyicisi) uygulanıyor: pencere
//! içinde başlatılan HER tam sayfa navigasyonu buradan geçer, biz karar
//! veririz — izin ver (pencere içinde kalsın) ya da iptal edip sistem
//! tarayıcısında aç.
//!
//! NOT: Next.js App Router'ın `<Link>` bileşeniyle yapılan istemci-taraflı
//! (SPA) rota değişiklikleri tarayıcı geçmişi API'siyle çalışır ve GERÇEK
//! bir webview navigasyonu TETİKLEMEZ — bu yüzden uygulama içi normal
//! gezinme bu engelleyiciden hiç geçmez, olduğu gibi çalışmaya devam eder.
//! Bu fonksiyon sadece TAM SAYFA navigasyon denemelerinde (örn. hedef
//! `_blank`/`_self` ile gerçek bir `<a href>` tıklaması, ya da programatik
//! `window.location` ataması) devreye girer.

use std::sync::Mutex;
use tauri::Url;

/// Uygulamanın KENDİ içeriğinin yüklendiği origin (şema://host:port).
///
/// - Geliştirmede sabittir: "http://localhost:3000" (apps/web'in `next dev`
///   sunucusu, bkz. lib.rs).
/// - Üretimde başlangıçta BOŞTUR — sidecar.rs, Node sidecar süreci hazır
///   olup pencere ona yönlendirildiğinde bunu bir KEZ ayarlar.
///
/// Boşken (üretimde sidecar henüz hazır değilken) hiçbir http(s) adresi
/// "kendi origin'imiz" sayılmaz; ama bu durumda zaten pencerede sadece
/// paketlenmiş splash sayfası (tauri:// / http://tauri.localhost) yüklü
/// olduğundan pratikte bir http(s) navigasyon denemesiyle karşılaşılmaz.
pub struct AppOrigin(Mutex<Option<String>>);

impl AppOrigin {
    pub fn new(initial: Option<String>) -> Self {
        Self(Mutex::new(initial))
    }

    pub fn set(&self, origin: String) {
        *self.0.lock().expect("AppOrigin mutex zehirlendi") = Some(origin);
    }

    /// GitHub issue #52 / Prompt 9.2 — deep_link.rs, üretimde sidecar henüz
    /// hazır değilken (origin BOŞKEN) gelen bir şifre sıfırlama deep
    /// link'ini hemen mi işleyeceğine yoksa `PendingResetPasswordToken`'a mı
    /// koyacağına karar vermek için origin'in şu anki değerine ihtiyaç
    /// duyar. `is_own_origin` (yukarıda) sadece bir KARŞILAŞTIRMA yapar,
    /// değeri DIŞARI vermez — bu yüzden ayrı bir okuma metodu gerekiyor.
    pub fn current(&self) -> Option<String> {
        self.0.lock().expect("AppOrigin mutex zehirlendi").clone()
    }

    fn is_own_origin(&self, url: &Url) -> bool {
        let current = self.0.lock().expect("AppOrigin mutex zehirlendi");
        match (&*current, origin_of(url)) {
            (Some(own), Some(requested)) => *own == requested,
            _ => false,
        }
    }
}

fn origin_of(url: &Url) -> Option<String> {
    let host = url.host_str()?;
    Some(match url.port() {
        Some(port) => format!("{}://{}:{}", url.scheme(), host, port),
        None => format!("{}://{}", url.scheme(), host),
    })
}

/// `true` dönerse: bu navigasyon sistem tarayıcısına yönlendirilip pencere
/// içindeki navigasyon İPTAL edilmeli (bkz. lib.rs'teki `on_navigation`
/// çağrısı `open_and_cancel` içine sarıyor).
pub fn should_open_externally(url: &Url, app_origin: &AppOrigin) -> bool {
    let scheme = url.scheme();

    // Tauri'nin kendi paketlenmiş varlık protokolü — platforma göre iki
    // farklı biçimde gelir: macOS'ta özel şema `tauri://localhost`,
    // Windows/Linux'ta ise WebView2/WebKitGTK kısıtları yüzünden
    // `http://tauri.localhost` (GERÇEK http şeması, host'a bakmak şart).
    // İkisi de her zaman pencere İÇİNDE kalmalı (splash sayfası, vb.).
    if scheme == "tauri" || url.host_str() == Some("tauri.localhost") {
        return false;
    }

    // http(s) DIŞINDAKİ her şey (asset:, blob:, data: vb.) pencere içi
    // uygulama davranışının bir parçasıdır, dokunma.
    if scheme != "http" && scheme != "https" {
        return false;
    }

    // /p/[token] danışan paylaşım sayfası AYNI origin'de sunulsa bile
    // kasıtlı olarak tarayıcı için tasarlandı — native pencerede AÇILMASIN
    // (bkz. issue #51, GÖREV 3 ve apps/web/src/app/p/[token]).
    if url.path().starts_with("/p/") {
        return true;
    }

    // Kalan durum: kendi origin'imiz DIŞINDA bir http(s) adresi — dış link.
    !app_origin.is_own_origin(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn allows_own_origin_dev_url() {
        let origin = AppOrigin::new(Some("http://localhost:3000".to_string()));
        assert!(!should_open_externally(&url("http://localhost:3000/danisanlar"), &origin));
    }

    #[test]
    fn opens_external_https_link() {
        let origin = AppOrigin::new(Some("http://localhost:3000".to_string()));
        assert!(should_open_externally(&url("https://example.com/yardim"), &origin));
    }

    #[test]
    fn always_opens_share_link_page_even_on_own_origin() {
        let origin = AppOrigin::new(Some("http://localhost:3000".to_string()));
        assert!(should_open_externally(&url("http://localhost:3000/p/abc123"), &origin));
    }

    #[test]
    fn keeps_windows_asset_protocol_in_window() {
        let origin = AppOrigin::new(None);
        assert!(!should_open_externally(&url("http://tauri.localhost/index.html"), &origin));
    }

    #[test]
    fn keeps_macos_asset_protocol_in_window() {
        let origin = AppOrigin::new(None);
        assert!(!should_open_externally(&url("tauri://localhost/index.html"), &origin));
    }

    #[test]
    fn different_port_is_external() {
        let origin = AppOrigin::new(Some("http://127.0.0.1:3000".to_string()));
        assert!(should_open_externally(&url("http://127.0.0.1:4000/"), &origin));
    }
}
