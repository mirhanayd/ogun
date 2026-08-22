//! GitHub issue #53 / Prompt 9.3, GÖREV 3 — native OS bildirimleri.
//!
//! MİMARİ KARAR — "hangi taraf bildirime DEĞER bir durum olduğuna karar
//! verir" (bkz. PR açıklaması, faz-9-masaustu-kabugu.md görev talimatı):
//! Rust'ın kendi başına sunucudan (Postgres, better-auth oturumu, clinic
//! scope) periyodik olarak randevu/paket verisi ÇEKMESİ yerine — ki bu,
//! apps/web'in packages/db/src/queries/notifications.ts + apps/web/src/lib/
//! notifications/summary.ts + withAuth/withAudit yığınını Rust'ta TEKRAR
//! yazmak demek olurdu — apps/web'in KENDİSİ (production sunucusunda ÇALIŞAN,
//! panel sayfasının kullandığı AYNI `getPanelNotificationFeed` server
//! action'ını çağıran bir istemci köprüsü, bkz. apps/web/src/components/
//! native-notification-bridge.tsx) periyodik olarak bu veriyi okur, DAHA
//! ÖNCE görülmemiş bildirim-değeri bir durum tespit ederse BU komutu
//! (`show_native_notification`) çağırır. Rust'ın rolü SADECE "OS'a göster"
//! — eşik/karar mantığı TAMAMEN apps/web'de kalır (mimari kural #3 ile
//! TUTARLI: apps/web kaynak-of-truth, Tauri kabuk sadece ADAPTE eder).
//!
//! BİLDİRİME TIKLAMA YÖNLENDİRMESİ bu komuttan GEÇMEZ: tauri-plugin-
//! notification'ın JS API'si (`onAction`, bkz. @tauri-apps/plugin-
//! notification) tıklamayı DOĞRUDAN frontend'e bir olay olarak teslim
//! ediyor (bkz. apps/web/src/components/native-notification-click-
//! bridge.tsx). Bu, deep_link.rs'in `ogun://` şemasını inşa edip
//! ayrıştırıp `PendingDeepLink` kuyruğuna KOYMASINDAN daha DOĞRUDAN bir
//! yol: pencere zaten (tray'e küçültülmüş olsa bile, bkz. window_ops.rs)
//! ÇALIŞIYOR, React ZATEN mount — tam bir URL şeması round-trip'i GEREKSİZ
//! dolaylılık olurdu. Bunun yerine bildirimin `extra` veri yüküne HEDEF
//! YOLU (path) koyuyoruz; JS tarafı `onAction` içinde onu okuyup
//! `focus_main_window_command` (bkz. window_ops.rs) ile pencereyi öne
//! getirip client-side (React Router, tam sayfa yenileme YOK) navigate
//! ediyor.
//!
//! Bildirim İZNİ isteme (`isPermissionGranted`/`requestPermission`) VE
//! reddedilirse uygulama-içi panelin ETKİLENMEMESİ TAMAMEN JS tarafında
//! (bkz. native-notification-bridge.tsx) — bu plugin'in JS API'si zaten
//! Rust'a hiç ihtiyaç duymadan bu iki fonksiyonu sağlıyor, burada AYRICA
//! bir Rust komutu YOK (gereksiz dolaylılık, bkz. Cargo.toml'daki genel
//! prensip: sadece GERÇEKTEN gereken kadar yüzey aç).

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

/// apps/web'in native-notification-bridge.tsx'inin çağırdığı TEK native
/// bildirim komutu. `path` VERİLİRSE (ör. "/danisanlar/abc123") bildirimin
/// "extra" veri yüküne eklenir — JS tarafındaki `onAction` dinleyicisi
/// bunu okuyup tıklamada oraya navigate eder (bkz. dosya başı notu).
///
/// DOĞRULAMA NOTU (bkz. PR açıklaması / README): bu sandbox'ta Rust
/// DERLENEMEDİĞİ için `NotificationBuilder::extra()`'nın burada varsayılan
/// tek-anahtarlı kullanım şekli derleyiciyle DOĞRULANAMADI — API'nin
/// varlığı docs.rs üzerinden teyit edildi (bkz. Cargo.toml yorumu), ama
/// TAM imza bire bir derlenerek kanıtlanmadı; ilk gerçek derlemede
/// (Windows/macOS geliştirme makinesi) küçük bir imza düzeltmesi
/// gerekebilir.
#[tauri::command]
pub fn show_native_notification(app: AppHandle, title: String, body: String, path: Option<String>) -> Result<(), String> {
    let mut builder = app.notification().builder().title(title).body(body);
    if let Some(path) = path {
        builder = builder.extra("path", path);
    }
    builder
        .show()
        .map_err(|err| format!("native bildirim gösterilemedi: {err}"))
}
