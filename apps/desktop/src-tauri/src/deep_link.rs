//! GitHub issue #52 / Prompt 9.2, GÖREV 1 ve GÖREV 2 — `ogun://` özel URL
//! şeması (deep link) desteği.
//!
//! Bu, navigation.rs'teki (issue #51) `on_navigation` engelleyicisinden
//! TAMAMEN FARKLI bir mekanizma — KARIŞTIRMAYIN (bkz. görev talimatındaki
//! açık uyarı): navigation.rs pencere İÇİNDEKİ http(s) navigasyonlarını
//! yakalar; bu modül ise işletim sisteminin BİZE dışarıdan (sistem
//! tarayıcısı ya da e-posta istemcisi gibi başka bir uygulamadan) teslim
//! ettiği `ogun://...` URL'lerini işler (tauri-plugin-deep-link aracılığıyla).
//!
//! İKİ KULLANIM SENARYOSU (bkz. `AuthDeepLink`):
//!
//! 1. OAuth geri dönüşü (`ogun://auth/callback?ott=...` YA DA
//!    `ogun://auth/callback?error=...`) — apps/web/src/app/api/auth/native/
//!    callback/route.ts tarafından üretilir. BAŞARILI (ott) ya da BAŞARISIZ
//!    (error) her iki durumda da `ogun-oauth-callback` Tauri olayı (event)
//!    pencereye YAYINLANIR; gerçek token değişimini (bkz. güvenlik notu
//!    apps/web route.ts'te) frontend (native-auth-bridge.tsx) authClient
//!    üzerinden yapar. GitHub PR #56 kod incelemesinde bulunan hata: `error`
//!    dalı DAHA ÖNCE hiç ayrıştırılmıyordu — başarısız bir Google girişi
//!    sessizce yok sayılıyor, "Google ile devam et" düğmesi SONSUZA KADAR
//!    "Yönlendiriliyor…" durumunda TAKILI kalıyordu. Şimdi İKİSİ de
//!    `AuthDeepLink::OAuthCallback(Result<String, String>)` ile taşınıyor.
//!
//! 2. Şifre sıfırlama (`ogun://auth/reset-password?token=...`) — kullanıcı
//!    uygulamayı hiç açmamış OLABİLİR (e-postayı masaüstü uygulaması
//!    KAPALIYKEN aldıysa) — bu yüzden pencereyi DOĞRUDAN apps/web'in
//!    KENDİ (değişmemiş) /sifre-sifirla?token=... sayfasına yönlendiririz;
//!    JS tarafında EK bir şey gerekmez.
//!
//! SOĞUK BAŞLANGIÇ / HAZIR OLMA YARIŞI (GitHub PR #56 kod incelemesinde
//! bulunan İKİNCİ hata): iki senaryonun da "henüz işlenemez" durumu FARKLI
//! bir koşula bağlı —
//!   - OAuth geri dönüşü bir Tauri OLAYI (event) yayınlar; frontend'in
//!     `native-auth-bridge.tsx` içindeki `listen(...)` çağrısı henüz
//!     KAYITLI DEĞİLSE (React daha mount OLMADIYSA — dev'de bile pencere
//!     oluşturulmasıyla React'in hydrate olması ARASINDA gerçek bir boşluk
//!     var) olay SESSİZCE kaybolur (Tauri geç abonelere olay TAMPONLAMAZ).
//!   - Şifre sıfırlama ise pencereyi DOĞRUDAN navigate eder — bunun için
//!     React'in hazır olması GEREKMEZ, sadece hedef origin'in (bkz.
//!     navigation.rs AppOrigin — dev ve üretimde pencere kurulmadan önce
//!     ayarlanır) bilinmesi yeterli.
//! Bu yüzden TEK bir `PendingDeepLink` kuyruğu (aşağıda) her iki türü de
//! taşıyabilir, ama her türün "artık işlenebilir" koşulu kendi mantığında
//! (`try_process`) AYRI AYRI kontrol edilir: OAuth → `FrontendReady`
//! (yeni `notify_frontend_ready` komutuyla JS'ten sinyallenir, bkz. lib.rs),
//! ResetPassword → `AppOrigin`.
//!
//! GitHub issue #53 / Prompt 9.3 — ÜÇÜNCÜ bir kullanım senaryosu eklendi:
//! `AppDeepLink` (genel uygulama-içi navigasyon, ör. bildirim tıklaması ya
//! da native menü/tray "Yeni Danışan" gibi eylemler). TASARIM KARARI (bkz.
//! PR açıklaması): bunu `AuthDeepLink`'e üçüncü bir varyant olarak EKLEMEDİK
//! — o tip bilinçli olarak SADECE auth (OAuth/şifre sıfırlama) taşımak
//! üzere tasarlandı (bkz. yukarıdaki dosya başı yorumları, ismi bile
//! "Auth" önekiyle başlıyor) ve `try_process`'teki koşulları (FrontendReady
//! vs AppOrigin) birbirinden TAMAMEN farklı. Bunun yerine KARDEŞ bir tip
//! (`AppDeepLink`) tanımlayıp ikisini ORTAK bir `DeepLink` üst-tipinde
//! (enum) birleştirdik — `PendingDeepLink` kuyruğu ARTIK `DeepLink` taşıyor,
//! yani "soğuk başlangıç kuyruğu + koşul sağlanınca drenaj" deseni ÜÇÜNCÜ
//! senaryo için de AYNEN yeniden kullanılıyor (mimari kural: yeni bir
//! üçüncü mekanizma İCAT ETMEDİK). `AppDeepLink::Navigate`'in koşulu
//! `ResetPassword`'le AYNI (`AppOrigin` biliniyor mu) — ikisi de doğrudan
//! `window.navigate()` ile SONUÇLANIYOR.
//!
//! `AppDeepLink`, HEM gerçek bir `ogun://app/navigate?path=...` URL'i OS
//! tarafından teslim edildiğinde (ör. gelecekte bir e-posta linki) HEM DE
//! Rust'ın KENDİSİ bir navigasyon istediğinde (native menü/tray tıklaması,
//! bkz. `request_navigation` — menu_actions.rs'in TEK çağırdığı fonksiyon)
//! AYNI yoldan (`dispatch`/`try_process`) geçer — böylece "pencere henüz
//! pencere hazır olmadan ÖNCE bir menü tıklaması gelirse ne olur"
//! sorusunun cevabı otomatik olarak DOĞRU: kuyruğa girer, origin bilinir
//! bilinmez drenaj edilir. NOT: bildirim TIKLAMASI bu
//! mekanizmayı KULLANMAZ — bkz. notifications.rs dosya başı notu: tauri-
//! plugin-notification'ın JS `onAction` API'si tıklamayı DOĞRUDAN frontend'e
//! teslim ediyor, Rust'ın bir URL inşa/ayrıştırma round-trip'ine hiç gerek
//! yok (pencere zaten çalışıyor, React zaten mount).

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Url};

use crate::navigation::AppOrigin;

/// `ogun://` deep link'lerinin taşıyabileceği İKİ anlamlı AUTH biçimi (bkz.
/// dosya başı notu — genel navigasyon için bkz. `AppDeepLink`, aşağıda).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthDeepLink {
    /// `ogun://auth/callback?ott=<one-time-token>` (Ok) YA DA
    /// `ogun://auth/callback?error=<kod>` (Err) — bkz. modül notu (1).
    OAuthCallback(Result<String, String>),
    /// `ogun://auth/reset-password?token=<reset-token>` — bkz. modül notu (2).
    ResetPassword { token: String },
}

/// Gelen bir URL'in bizim tanıdığımız `ogun://auth/...` biçimlerinden biri
/// olup olmadığını SAF (Tauri çalışma zamanı GEREKTİRMEYEN) şekilde çözer.
/// Tanımadığı her şey için `None` döner — bilinmeyen/eksik parametreli
/// deep link'ler SESSİZCE yok sayılır (bkz. `handle_urls` çağrı noktası).
pub fn parse_auth_deep_link(url: &Url) -> Option<AuthDeepLink> {
    if url.scheme() != "ogun" || url.host_str() != Some("auth") {
        return None;
    }

    match url.path() {
        "/callback" => {
            // `ott` VARSA başarı, YOKSA `error` aranır (apps/web route.ts
            // ikisinden yalnızca BİRİNİ koyar, hiçbirini KOYMADIĞI durum
            // olmamalı ama savunmacı olarak ikisi de yoksa None dönüyoruz).
            if let Some((_, value)) = url.query_pairs().find(|(key, _)| key.as_ref() == "ott") {
                Some(AuthDeepLink::OAuthCallback(Ok(value.into_owned())))
            } else if let Some((_, value)) =
                url.query_pairs().find(|(key, _)| key.as_ref() == "error")
            {
                Some(AuthDeepLink::OAuthCallback(Err(value.into_owned())))
            } else {
                None
            }
        }
        "/reset-password" => url
            .query_pairs()
            .find(|(key, _)| key.as_ref() == "token")
            .map(|(_, value)| AuthDeepLink::ResetPassword {
                token: value.into_owned(),
            }),
        _ => None,
    }
}

/// GitHub issue #53 / Prompt 9.3 — genel uygulama-içi navigasyon (bkz. dosya
/// başı notu). Şu an TEK varyantı var (`Navigate`) ama gelecekte (ör.
/// "belirli bir randevuyu aç") büyüyebileceği için `AuthDeepLink`'le AYNI
/// enum deseni kullanıldı.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppDeepLink {
    /// `path` apps/web'in KENDİ (değişmemiş) route'larından biri olmalı
    /// (ör. "/danisanlar/yeni", "/randevular") — bu modül bunun GEÇERLİ bir
    /// route olduğunu DOĞRULAMAZ, sorumluluk çağıran tarafta (menu_actions.rs
    /// sabit, elle yazılmış path'ler kullanıyor; gerçek bir `ogun://`
    /// URL'inden gelirse de aynı şekilde apps/web'in kendi 404 sayfası
    /// devreye girer — savunmacı bir davranış, PANİK YOK).
    Navigate { path: String },
}

/// `ogun://app/navigate?path=<url-kodlu-yol>` biçimini çözer — bkz.
/// `AppDeepLink` doc-comment'i.
pub fn parse_app_deep_link(url: &Url) -> Option<AppDeepLink> {
    if url.scheme() != "ogun" || url.host_str() != Some("app") {
        return None;
    }
    match url.path() {
        "/navigate" => url
            .query_pairs()
            .find(|(key, _)| key.as_ref() == "path")
            .map(|(_, value)| AppDeepLink::Navigate {
                path: value.into_owned(),
            }),
        _ => None,
    }
}

/// İki alt-tipi (`AuthDeepLink`, `AppDeepLink`) TEK bir `PendingDeepLink`
/// kuyruğunda taşıyabilmek için ortak üst-tip — bkz. dosya başı "GitHub
/// issue #53" notu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeepLink {
    Auth(AuthDeepLink),
    App(AppDeepLink),
}

/// Gelen bir `ogun://` URL'ini TANIDIĞIMIZ biçimlerden HERHANGİ birine
/// (auth YA DA genel navigasyon) çözer — `handle_urls`'in TEK çağırdığı
/// giriş noktası.
pub fn parse_deep_link(url: &Url) -> Option<DeepLink> {
    parse_auth_deep_link(url)
        .map(DeepLink::Auth)
        .or_else(|| parse_app_deep_link(url).map(DeepLink::App))
}

/// JS tarafına (bkz. native-auth-bridge.tsx `listen('ogun-oauth-callback', ...)`)
/// yayınlanan olayın payload biçimi — hem başarı hem hata durumunu taşır
/// (bkz. dosya başı notu (1)). `status` alanı JS tarafında ayırt edici
/// (discriminant) olarak kullanılıyor.
#[derive(Serialize, Clone)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum OAuthCallbackPayload {
    #[serde(rename = "ok")]
    Ok { one_time_token: String },
    #[serde(rename = "error")]
    Error { message: String },
}

impl From<Result<String, String>> for OAuthCallbackPayload {
    fn from(result: Result<String, String>) -> Self {
        match result {
            Ok(one_time_token) => OAuthCallbackPayload::Ok { one_time_token },
            Err(message) => OAuthCallbackPayload::Error { message },
        }
    }
}

/// Henüz işlenemeyen (bkz. dosya başı "SOĞUK BAŞLANGIÇ" notu) EN SON deep
/// link'i bekletmek için. Sadece BİR tanesi tutulur — pratikte kullanıcı
/// aynı anda hem bir OAuth dönüşü HEM bir sıfırlama linkini tetiklemez;
/// tıklarsa SONUNCUSU kazanır (makul bir basitleştirme, bkz. PR açıklaması).
#[derive(Default)]
pub struct PendingDeepLink(Mutex<Option<DeepLink>>);

impl PendingDeepLink {
    fn set(&self, link: DeepLink) {
        *self.0.lock().expect("PendingDeepLink mutex zehirlendi") = Some(link);
    }

    fn take(&self) -> Option<DeepLink> {
        self.0.lock().expect("PendingDeepLink mutex zehirlendi").take()
    }
}

/// JS'in `native-auth-bridge.tsx` içinde `listen('ogun-oauth-callback', ...)`
/// kaydını TAMAMLADIKTAN sonra çağırdığı `notify_frontend_ready` komutunun
/// (bkz. lib.rs) arkasındaki durum. OAuth geri dönüşü BU bayrak true
/// olmadan asla emit EDİLMEZ (bkz. `try_process`) — aksi halde
/// olay dinleyici kayıtlı olmadan yayınlanıp sessizce kaybolabilir.
#[derive(Default)]
pub struct FrontendReady(Mutex<bool>);

impl FrontendReady {
    fn mark_ready(&self) {
        *self.0.lock().expect("FrontendReady mutex zehirlendi") = true;
    }

    fn is_ready(&self) -> bool {
        *self.0.lock().expect("FrontendReady mutex zehirlendi")
    }
}

/// `tauri-plugin-deep-link`'in yayınladığı `deep-link://new-url` olayından
/// (bkz. lib.rs) VEYA `tauri-plugin-single-instance`'ın "deep-link" özelliği
/// aracılığıyla (bkz. Cargo.toml notu) gelen URL listesini işler — TEK giriş
/// noktası, hem soğuk başlangıç hem de uygulama zaten açıkken gelen ikinci
/// bir deep link için AYNI mantık.
pub fn handle_urls(app: &AppHandle, urls: Vec<Url>) {
    for url in urls {
        match parse_deep_link(&url) {
            Some(link) => dispatch(app, link),
            None => {
                eprintln!("[ogun-desktop] tanınmayan/eksik parametreli ogun:// deep link yok sayıldı: {url}");
            }
        }
    }
}

/// Deep link'i HEMEN işleyebiliyorsak işler; işleyemiyorsak (bkz. dosya
/// başı "SOĞUK BAŞLANGIÇ" notu) `PendingDeepLink`'e koyar.
fn dispatch(app: &AppHandle, link: DeepLink) {
    if !try_process(app, &link) {
        app.state::<PendingDeepLink>().set(link);
    }
}

/// GitHub issue #53 / Prompt 9.3 — native menü/tray tıklamalarının (bkz.
/// menu_actions.rs, TEK çağırdığı fonksiyon budur) apps/web'in bir
/// route'una navigasyon İSTEMESİ için TEK giriş noktası. Gerçek bir
/// `ogun://app/navigate?...` URL'i OS'tan gelseydi İZLEYECEĞİ TAM OLARAK
/// AYNI yoldan (`dispatch` → soğuk başlangıçta `PendingDeepLink`, origin
/// bilinir bilinmez drenaj) geçer — Rust'ın kendi tetiklediği bir eylem
/// için sahte bir URL string'i inşa edip TEKRAR ayrıştırmak yerine
/// doğrudan `AppDeepLink` değerini kuruyoruz (gereksiz round-trip'ten
/// kaçınmak için tek fark budur, DAVRANIŞ AYNI).
pub fn request_navigation(app: &AppHandle, path: impl Into<String>) {
    dispatch(app, DeepLink::App(AppDeepLink::Navigate { path: path.into() }));
}

/// GitHub PR #56 kod incelemesi — hem `notify_frontend_ready` komutundan
/// (frontend artık dinliyor) çağrılır: BEKLEYEN deep link'i alır ve
/// TEKRAR işlemeyi dener. `dispatch`
/// ile PAYLAŞILAN `try_process` sayesinde iki koşuldan HANGİSİ SONRA
/// gerçekleşirse gerçekleşsin (frontend önce hazır olabilir ya da origin
/// önce bilinebilir) doğru şekilde drenaj yapılır.
///
/// `true` DÖNERSE: bekleyen deep link pencereyi DOĞRUDAN bir sayfaya
/// yönlendiren türdendi (ŞİFRE SIFIRLAMA YA DA GitHub issue #53'ün genel
/// `AppDeepLink::Navigate`'i) VE bu navigasyon ZATEN yapıldı. OAuth geri
/// dönüşü bu dönüş değerini hiç ETKİLEMEZ (kök navigasyon kararıyla
/// İLGİSİZ — o ayrı bir Tauri olayı üzerinden işlenir).
pub fn process_pending(app: &AppHandle) -> bool {
    let Some(link) = app.state::<PendingDeepLink>().take() else {
        return false;
    };
    let is_direct_navigation = matches!(
        link,
        DeepLink::Auth(AuthDeepLink::ResetPassword { .. }) | DeepLink::App(AppDeepLink::Navigate { .. })
    );
    if try_process(app, &link) {
        is_direct_navigation
    } else {
        // Bu tetikleyici için henüz koşul sağlanmadı (ör. origin hazır
        // oldu ama bekleyen aslında bir OAuth geri dönüşüydü ve frontend
        // henüz hazır değil) — geri koy, DİĞER tetikleyiciyi bekle.
        app.state::<PendingDeepLink>().set(link);
        false
    }
}

/// `true` dönerse deep link İŞLENDİ (bir daha denemeye gerek yok); `false`
/// dönerse şu an gerekli koşul (frontend hazır / origin biliniyor) HENÜZ
/// sağlanmıyor — çağıran taraf bunu `PendingDeepLink`'e koymalı.
fn try_process(app: &AppHandle, link: &DeepLink) -> bool {
    match link {
        DeepLink::Auth(AuthDeepLink::OAuthCallback(result)) => {
            if !app.state::<FrontendReady>().is_ready() {
                return false;
            }
            let payload = OAuthCallbackPayload::from(result.clone());
            if let Err(err) = app.emit("ogun-oauth-callback", payload) {
                eprintln!("[ogun-desktop] oauth deep link olayı yayınlanamadı: {err}");
            }
            true
        }
        DeepLink::Auth(AuthDeepLink::ResetPassword { token }) => match app.state::<AppOrigin>().current() {
            Some(origin) => {
                navigate_to_reset_password(app, &origin, token);
                true
            }
            None => false,
        },
        // GitHub issue #53 / Prompt 9.3 — koşulu ResetPassword'le AYNI
        // (bkz. dosya başı notu): AppOrigin bilinmeden gerçek bir pencere
        // navigasyonu yapılamaz.
        DeepLink::App(AppDeepLink::Navigate { path }) => match app.state::<AppOrigin>().current() {
            Some(origin) => {
                navigate_to_app_path(app, &origin, path);
                true
            }
            None => false,
        },
    }
}

/// SAF (Tauri çalışma zamanı GEREKTİRMEYEN) URL inşası — kod incelemesi
/// (PR #56) notu: sorgu değerini (token) elle yüzde-kodlamak yerine `url`
/// crate'inin kendi `query_pairs_mut()` API'sini kullanıyoruz; bu, elle
/// yazılmış bir kodlayıcıdan (önceki `urlencode()`, kaldırıldı) daha az
/// risk taşır VE (aşağıdaki testlerde görüldüğü gibi) hâlâ Tauri çalışma
/// zamanı olmadan test edilebilir.
fn build_reset_password_url(origin: &str, token: &str) -> Result<Url, url::ParseError> {
    let mut url = Url::parse(origin)?;
    url.set_path("/sifre-sifirla");
    url.query_pairs_mut().append_pair("token", token);
    Ok(url)
}

/// Gerçek pencere navigasyonunu yapan ortak fonksiyon.
pub fn navigate_to_reset_password(app: &AppHandle, origin: &str, token: &str) {
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("[ogun-desktop] ana pencere bulunamadı, şifre sıfırlama deep link'i işlenemedi");
        return;
    };
    match build_reset_password_url(origin, token) {
        Ok(url) => {
            if let Err(err) = window.navigate(url) {
                eprintln!("[ogun-desktop] şifre sıfırlama sayfasına yönlendirilemedi: {err}");
            }
        }
        Err(err) => eprintln!("[ogun-desktop] uygulama origin'i geçersiz URL: {err}"),
    }
}

/// GitHub issue #53 / Prompt 9.3 — `build_reset_password_url` ile AYNI
/// desen, ama sorgu parametresi YERİNE `path` DOĞRUDAN URL'in yol+sorgu
/// kısmı olarak kullanılıyor (`Url::join`, göreli/mutlak çözümleme
/// kurallarını doğru uygular — `path` "/randevular" gibi mutlak bir yol
/// OLMALI, `menu_actions.rs`'teki sabit path'lerin HEPSİ böyle).
fn build_app_navigate_url(origin: &str, path: &str) -> Result<Url, url::ParseError> {
    let base = Url::parse(origin)?;
    base.join(path)
}

/// Genel uygulama-içi navigasyon için gerçek pencere navigasyonunu yapan
/// fonksiyon — `navigate_to_reset_password` ile AYNI yapı.
pub fn navigate_to_app_path(app: &AppHandle, origin: &str, path: &str) {
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("[ogun-desktop] ana pencere bulunamadı, uygulama-içi navigasyon işlenemedi");
        return;
    };
    match build_app_navigate_url(origin, path) {
        Ok(url) => {
            if let Err(err) = window.navigate(url) {
                eprintln!("[ogun-desktop] '{path}' sayfasına yönlendirilemedi: {err}");
            }
        }
        Err(err) => eprintln!("[ogun-desktop] uygulama origin'i geçersiz URL: {err}"),
    }
}

/// GitHub issue #52 / Prompt 9.2, kod incelemesi (PR #56) — frontend
/// (native-auth-bridge.tsx), `listen('ogun-oauth-callback', ...)` KAYDI
/// TAMAMLANDIKTAN hemen sonra bu komutu çağırır. Bundan ÖNCE yayınlanmış
/// olabilecek bir OAuth geri dönüşü `PendingDeepLink`'te bekliyor olabilir
/// (bkz. dosya başı "SOĞUK BAŞLANGIÇ" notu) — burada hem hazır bayrağı
/// işaretlenir hem de o bekleyen deep link varsa HEMEN drenaj denenir.
#[tauri::command]
pub fn notify_frontend_ready(app: AppHandle) {
    app.state::<FrontendReady>().mark_ready();
    process_pending(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn parses_oauth_callback_success() {
        let parsed = parse_auth_deep_link(&url("ogun://auth/callback?ott=abc123"));
        assert_eq!(parsed, Some(AuthDeepLink::OAuthCallback(Ok("abc123".to_string()))));
    }

    #[test]
    fn parses_oauth_callback_error() {
        let parsed = parse_auth_deep_link(&url("ogun://auth/callback?error=no_session"));
        assert_eq!(
            parsed,
            Some(AuthDeepLink::OAuthCallback(Err("no_session".to_string())))
        );
    }

    #[test]
    fn ott_takes_precedence_over_error_if_somehow_both_present() {
        // apps/web route.ts ikisini birden asla koymaz ama savunmacı
        // ayrıştırma mantığı deterministik olmalı: ott varsa BAŞARI kazanır.
        let parsed = parse_auth_deep_link(&url("ogun://auth/callback?error=x&ott=abc123"));
        assert_eq!(parsed, Some(AuthDeepLink::OAuthCallback(Ok("abc123".to_string()))));
    }

    #[test]
    fn parses_reset_password() {
        let parsed = parse_auth_deep_link(&url("ogun://auth/reset-password?token=xyz789"));
        assert_eq!(
            parsed,
            Some(AuthDeepLink::ResetPassword {
                token: "xyz789".to_string()
            })
        );
    }

    #[test]
    fn ignores_wrong_scheme() {
        assert_eq!(
            parse_auth_deep_link(&url("https://auth/callback?ott=abc123")),
            None
        );
    }

    #[test]
    fn ignores_wrong_host() {
        assert_eq!(
            parse_auth_deep_link(&url("ogun://not-auth/callback?ott=abc123")),
            None
        );
    }

    #[test]
    fn ignores_unknown_path() {
        assert_eq!(parse_auth_deep_link(&url("ogun://auth/unknown")), None);
    }

    #[test]
    fn ignores_callback_without_ott_or_error() {
        assert_eq!(
            parse_auth_deep_link(&url("ogun://auth/callback?foo=bar")),
            None
        );
    }

    #[test]
    fn ignores_reset_password_without_token() {
        assert_eq!(
            parse_auth_deep_link(&url("ogun://auth/reset-password")),
            None
        );
    }

    #[test]
    fn ignores_empty_ott_value() {
        // "ott=" (boş değer) teknik olarak parametre VAR ama ANLAMSIZ —
        // yine de query_pairs bunu boş string olarak döner, biz burada
        // BİLEREK reddetmiyoruz (çağıran taraf — better-auth verify
        // endpoint'i — boş token'ı zaten reddedecektir); bu test sadece
        // parse_auth_deep_link'in ÇÖKMEDİĞİNİ/paniklemediğini doğruluyor.
        assert_eq!(
            parse_auth_deep_link(&url("ogun://auth/callback?ott=")),
            Some(AuthDeepLink::OAuthCallback(Ok(String::new())))
        );
    }

    #[test]
    fn ignores_extra_query_params() {
        let parsed = parse_auth_deep_link(&url("ogun://auth/callback?foo=bar&ott=abc123&baz=qux"));
        assert_eq!(parsed, Some(AuthDeepLink::OAuthCallback(Ok("abc123".to_string()))));
    }

    #[test]
    fn pending_deep_link_take_clears_state() {
        let pending = PendingDeepLink::default();
        assert!(pending.take().is_none());

        pending.set(DeepLink::Auth(AuthDeepLink::ResetPassword {
            token: "abc123".to_string(),
        }));
        assert_eq!(
            pending.take(),
            Some(DeepLink::Auth(AuthDeepLink::ResetPassword {
                token: "abc123".to_string()
            }))
        );
        // İkinci take() BOŞ dönmeli — "al ve temizle" semantiği.
        assert!(pending.take().is_none());
    }

    #[test]
    fn pending_deep_link_last_write_wins() {
        let pending = PendingDeepLink::default();
        pending.set(DeepLink::Auth(AuthDeepLink::OAuthCallback(Ok("first".to_string()))));
        pending.set(DeepLink::Auth(AuthDeepLink::ResetPassword {
            token: "second".to_string(),
        }));
        assert_eq!(
            pending.take(),
            Some(DeepLink::Auth(AuthDeepLink::ResetPassword {
                token: "second".to_string()
            }))
        );
    }

    // --- GitHub issue #53 / Prompt 9.3 — AppDeepLink / DeepLink testleri ---

    #[test]
    fn parses_app_navigate() {
        let parsed = parse_app_deep_link(&url("ogun://app/navigate?path=%2Frandevular"));
        assert_eq!(
            parsed,
            Some(AppDeepLink::Navigate {
                path: "/randevular".to_string()
            })
        );
    }

    #[test]
    fn app_deep_link_ignores_wrong_host() {
        assert_eq!(parse_app_deep_link(&url("ogun://auth/navigate?path=/x")), None);
    }

    #[test]
    fn app_deep_link_ignores_unknown_path() {
        assert_eq!(parse_app_deep_link(&url("ogun://app/unknown?path=/x")), None);
    }

    #[test]
    fn app_deep_link_ignores_missing_path_param() {
        assert_eq!(parse_app_deep_link(&url("ogun://app/navigate?foo=bar")), None);
    }

    #[test]
    fn parse_deep_link_resolves_auth_variant() {
        let parsed = parse_deep_link(&url("ogun://auth/callback?ott=abc123"));
        assert_eq!(
            parsed,
            Some(DeepLink::Auth(AuthDeepLink::OAuthCallback(Ok("abc123".to_string()))))
        );
    }

    #[test]
    fn parse_deep_link_resolves_app_variant() {
        let parsed = parse_deep_link(&url("ogun://app/navigate?path=%2Fdanisanlar%2Fyeni"));
        assert_eq!(
            parsed,
            Some(DeepLink::App(AppDeepLink::Navigate {
                path: "/danisanlar/yeni".to_string()
            }))
        );
    }

    #[test]
    fn parse_deep_link_ignores_unrecognized_url() {
        assert_eq!(parse_deep_link(&url("ogun://unknown-host/x")), None);
    }

    #[test]
    fn build_app_navigate_url_resolves_absolute_path() {
        let built = build_app_navigate_url("http://127.0.0.1:3000", "/danisanlar/yeni").unwrap();
        assert_eq!(built.as_str(), "http://127.0.0.1:3000/danisanlar/yeni");
    }

    #[test]
    fn build_app_navigate_url_preserves_query_string() {
        let built = build_app_navigate_url("http://127.0.0.1:3000", "/randevular?tarih=2026-08-18").unwrap();
        assert_eq!(built.as_str(), "http://127.0.0.1:3000/randevular?tarih=2026-08-18");
    }

    #[test]
    fn build_app_navigate_url_rejects_invalid_origin() {
        assert!(build_app_navigate_url("not-a-valid-origin", "/x").is_err());
    }

    #[test]
    fn frontend_ready_starts_false_and_can_be_marked() {
        let ready = FrontendReady::default();
        assert!(!ready.is_ready());
        ready.mark_ready();
        assert!(ready.is_ready());
    }

    #[test]
    fn build_reset_password_url_appends_path_and_token() {
        let built = build_reset_password_url("http://127.0.0.1:3000", "abc123").unwrap();
        assert_eq!(built.as_str(), "http://127.0.0.1:3000/sifre-sifirla?token=abc123");
    }

    #[test]
    fn build_reset_password_url_percent_encodes_special_characters() {
        // Gerçek reset token'ları alfanümerik (generateId(24)) ama bu
        // fonksiyonun kütüphaneye devrettiği kodlamanın GERÇEKTEN
        // çalıştığını (elle yazılmış eski `urlencode()`'un yerini tuttuğunu)
        // doğrulamak için kasıtlı olarak özel karakterli bir değer veriyoruz.
        let built = build_reset_password_url("http://127.0.0.1:3000", "a&b c#d").unwrap();
        assert_eq!(
            built.as_str(),
            "http://127.0.0.1:3000/sifre-sifirla?token=a%26b+c%23d"
        );
    }

    #[test]
    fn build_reset_password_url_rejects_invalid_origin() {
        assert!(build_reset_password_url("not-a-valid-origin", "abc123").is_err());
    }
}
