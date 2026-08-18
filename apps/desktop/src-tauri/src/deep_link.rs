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
//! 1. OAuth geri dönüşü (`ogun://auth/callback?ott=...`) — apps/web/src/app/
//!    api/auth/native/callback/route.ts tarafından üretilir. Uygulama bu
//!    URL'i aldığında (deep link geldiğinde uygulama HER ZAMAN zaten
//!    çalışıyordur — OAuth'u başlatan pencerenin ta kendisi sistem
//!    tarayıcısını AÇTI, bkz. lib.rs), bu yüzden doğrudan `ogun-oauth-callback`
//!    Tauri olayını (event) pencereye YAYINLARIZ (emit); gerçek token
//!    değişimini (bkz. güvenlik notu apps/web route.ts'te) frontend
//!    (native-auth-bridge.tsx) authClient üzerinden yapar.
//!
//! 2. Şifre sıfırlama (`ogun://auth/reset-password?token=...`) — kullanıcı
//!    uygulamayı hiç açmamış OLABİLİR (e-postayı masaüstü uygulaması
//!    KAPALIYKEN aldıysa) — bu yüzden pencereyi DOĞRUDAN apps/web'in
//!    KENDİ (değişmemiş) /sifre-sifirla?token=... sayfasına yönlendiririz;
//!    JS tarafında EK bir şey gerekmez. Üretimde sidecar henüz hazır
//!    değilse (bkz. sidecar.rs) bu token `PendingResetPasswordToken` içinde
//!    bekletilir ve sidecar hazır olur olmaz uygulanır.

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Url};

use crate::navigation::AppOrigin;

/// `ogun://` deep link'lerinin taşıyabileceği İKİ anlamlı biçim.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthDeepLink {
    /// `ogun://auth/callback?ott=<one-time-token>` — bkz. modül notu (1).
    OAuthCallback { one_time_token: String },
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
        "/callback" => url
            .query_pairs()
            .find(|(key, _)| key.as_ref() == "ott")
            .map(|(_, value)| AuthDeepLink::OAuthCallback {
                one_time_token: value.into_owned(),
            }),
        "/reset-password" => url
            .query_pairs()
            .find(|(key, _)| key.as_ref() == "token")
            .map(|(_, value)| AuthDeepLink::ResetPassword {
                token: value.into_owned(),
            }),
        _ => None,
    }
}

/// JS tarafına (bkz. native-auth-bridge.tsx `listen('ogun-oauth-callback', ...)`)
/// yayınlanan olayın payload biçimi. `one_time_token` alan adı JS'te
/// `oneTimeToken` olarak görünsün diye camelCase'e çevriliyor (serde
/// `rename_all`) — apps/web'in geri kalanı (auth.ts vb.) da camelCase
/// kullanıyor, tutarlı.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OAuthCallbackPayload {
    pub one_time_token: String,
}

/// Üretimde sidecar henüz hazır değilken (bkz. sidecar.rs) gelen bir şifre
/// sıfırlama deep link'ini bekletmek için — SADECE bu senaryo bekletmeye
/// ihtiyaç duyar (OAuth geri dönüşü her zaman uygulama ZATEN açıkken/
/// kendi origin'i hazırken gerçekleşir, bkz. modül notu (1)). Sadece BİR
/// token tutulur — pratikte kullanıcı aynı anda birden fazla sıfırlama
/// linkine tıklamaz; tıklarsa SONUNCUSU kazanır (makul bir basitleştirme).
#[derive(Default)]
pub struct PendingResetPasswordToken(Mutex<Option<String>>);

impl PendingResetPasswordToken {
    fn set(&self, token: String) {
        *self.0.lock().expect("PendingResetPasswordToken mutex zehirlendi") = Some(token);
    }

    /// Bekleyen token'ı (varsa) alır ve İÇİNİ boşaltır — bir daha aynı
    /// deep link'e iki kez yönlendirme YAPILMASIN diye "al ve temizle"
    /// (take) semantiği. Bkz. sidecar.rs — sidecar hazır olduğunda çağrılır.
    pub fn take(&self) -> Option<String> {
        self.0
            .lock()
            .expect("PendingResetPasswordToken mutex zehirlendi")
            .take()
    }
}

/// `tauri-plugin-deep-link`'in yayınladığı `deep-link://new-url` olayından
/// (bkz. lib.rs) VEYA `tauri-plugin-single-instance`'ın "deep-link" özelliği
/// aracılığıyla (bkz. Cargo.toml notu) gelen URL listesini işler — TEK giriş
/// noktası, hem soğuk başlangıç hem de uygulama zaten açıkken gelen ikinci
/// bir deep link için AYNI mantık.
pub fn handle_urls(app: &AppHandle, urls: Vec<Url>) {
    for url in urls {
        match parse_auth_deep_link(&url) {
            Some(AuthDeepLink::OAuthCallback { one_time_token }) => {
                if let Err(err) = app.emit("ogun-oauth-callback", OAuthCallbackPayload { one_time_token }) {
                    eprintln!("[ogun-desktop] oauth deep link olayı yayınlanamadı: {err}");
                }
            }
            Some(AuthDeepLink::ResetPassword { token }) => route_reset_password(app, token),
            None => {
                eprintln!("[ogun-desktop] tanınmayan/eksik parametreli ogun:// deep link yok sayıldı: {url}");
            }
        }
    }
}

/// bkz. modül notu (2) — origin (dev'de sabit, üretimde sidecar hazır
/// olunca ayarlanır) BİLİNİYORSA pencereyi doğrudan apps/web'in DEĞİŞMEMİŞ
/// /sifre-sifirla sayfasına yönlendirir; bilinmiyorsa (üretim, sidecar
/// henüz ayağa kalkmadı) token'ı `PendingResetPasswordToken`'a koyar —
/// sidecar.rs, pencereyi sidecar origin'ine yönlendirirken bunu DRENAJ eder.
fn route_reset_password(app: &AppHandle, token: String) {
    match app.state::<AppOrigin>().current() {
        Some(origin) => navigate_to_reset_password(app, &origin, &token),
        None => app.state::<PendingResetPasswordToken>().set(token),
    }
}

/// sidecar.rs'in de (origin hazır olduğunda) çağırdığı, gerçek pencere
/// navigasyonunu yapan ortak fonksiyon.
pub fn navigate_to_reset_password(app: &AppHandle, origin: &str, token: &str) {
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("[ogun-desktop] ana pencere bulunamadı, şifre sıfırlama deep link'i işlenemedi");
        return;
    };
    let target = format!("{origin}/sifre-sifirla?token={}", urlencode(token));
    match Url::parse(&target) {
        Ok(url) => {
            if let Err(err) = window.navigate(url) {
                eprintln!("[ogun-desktop] şifre sıfırlama sayfasına yönlendirilemedi: {err}");
            }
        }
        Err(err) => eprintln!("[ogun-desktop] şifre sıfırlama URL'i geçersiz: {err}"),
    }
}

/// `url` crate'inin serbest bir `percent_encode` yardımcı fonksiyonunu
/// AYRICA bağımlılık olarak eklemek yerine — reset token'ları
/// `generateId(24)` ile üretilir (better-auth, bkz. password.mjs), yani
/// zaten yalnızca alfanümerik karakterlerden oluşur; yine de KAZARA özel
/// karakter (`&`, `#`, boşluk vb.) İÇEREN bir token URL'i BOZMASIN diye
/// minimal, bağımlılıksız bir query-value encode'u burada elle yapıyoruz.
fn urlencode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn parses_oauth_callback() {
        let parsed = parse_auth_deep_link(&url("ogun://auth/callback?ott=abc123"));
        assert_eq!(
            parsed,
            Some(AuthDeepLink::OAuthCallback {
                one_time_token: "abc123".to_string()
            })
        );
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
    fn ignores_callback_without_ott() {
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
            Some(AuthDeepLink::OAuthCallback {
                one_time_token: String::new()
            })
        );
    }

    #[test]
    fn ignores_extra_query_params() {
        let parsed = parse_auth_deep_link(&url("ogun://auth/callback?foo=bar&ott=abc123&baz=qux"));
        assert_eq!(
            parsed,
            Some(AuthDeepLink::OAuthCallback {
                one_time_token: "abc123".to_string()
            })
        );
    }

    #[test]
    fn pending_reset_password_token_take_clears_state() {
        let pending = PendingResetPasswordToken::default();
        assert!(pending.take().is_none());

        pending.set("abc123".to_string());
        assert_eq!(pending.take(), Some("abc123".to_string()));
        // İkinci take() BOŞ dönmeli — "al ve temizle" semantiği.
        assert!(pending.take().is_none());
    }

    #[test]
    fn urlencode_leaves_alphanumeric_untouched() {
        assert_eq!(urlencode("abcXYZ012-_.~"), "abcXYZ012-_.~");
    }

    #[test]
    fn urlencode_escapes_special_characters() {
        assert_eq!(urlencode("a&b c#d"), "a%26b%20c%23d");
    }
}
