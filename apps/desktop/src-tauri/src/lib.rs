//! Öğün masaüstü kabuğu — GitHub issue #51 / Prompt 9.1.
//!
//! Bu crate apps/web'in kodunu İÇERMEZ ve DEĞİŞTİRMEZ (mimari kural, bkz.
//! faz-9-masaustu-kabugu.md): sadece onu saran, kendi penceresi, pencere
//! durumu kalıcılığı ve dış link davranışı olan native bir kabuk.
//!
//! - Geliştirmede pencere doğrudan `http://localhost:3000`'e (apps/web'in
//!   `next dev` sunucusu — kök `pnpm dev`, turbo aracılığıyla bunu apps/web
//!   ile PARALEL başlatır) işaret eder. Hot reload apps/web'in kendi dev
//!   sunucusundan geldiği için burada YAPACAK bir şey yok.
//! - Üretimde pencere önce paketlenmiş bir splash sayfası (bkz. ../splash/)
//!   gösterir, sidecar.rs Node sidecar sürecini (apps/web'in standalone
//!   çıktısı) başlatıp hazır olduğunda pencereyi ona yönlendirir.

mod navigation;
mod sidecar;

use navigation::AppOrigin;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

/// apps/web'in `next dev` sunucusunun varsayılan adresi.
const DEV_URL: &str = "http://localhost:3000";

pub fn run() {
    tauri::Builder::default()
        // GÖREV 2 — pencere boyutu/konumu/maximize durumu kalıcılığı.
        // Kullanıcı her açtığında sıfırlanmaması için tek satır yeterli:
        // eklenti pencere oluşturulduğunda otomatik geri yükler, kapanışta
        // otomatik kaydeder (bkz. tauri-plugin-window-state dokümantasyonu).
        .plugin(tauri_plugin_window_state::Builder::new().build())
        // GÖREV 1 — üretimde Node sidecar sürecini başlatmak için.
        .plugin(tauri_plugin_shell::init())
        // GÖREV 3 — dış http(s) linkleri sistem tarayıcısında açmak için.
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let is_dev = tauri::is_dev();

            // GÖREV 3'ün karar mantığı (navigation.rs) kendi origin'imizi
            // bilmeye ihtiyaç duyar: dev'de sabit, üretimde sidecar hazır
            // olunca BİR KEZ ayarlanır (bkz. sidecar.rs). Pencereyi
            // oluşturmadan ÖNCE yönetime alınmalı — ilk navigasyon olayı
            // (splash/dev sayfasının kendisi) daha pencere `build()`
            // dönmeden tetiklenebilir.
            app.manage(AppOrigin::new(if is_dev {
                Some(DEV_URL.to_string())
            } else {
                None
            }));

            let initial_url = if is_dev {
                WebviewUrl::External(DEV_URL.parse().expect("DEV_URL geçerli bir URL olmalı"))
            } else {
                // apps/desktop/splash/index.html (bkz. tauri.conf.json
                // build.frontendDist) — sidecar hazır olana kadar gösterilen
                // basit "başlatılıyor" ekranı. GERÇEK uygulama içeriği bu
                // DEĞİL; sidecar.rs, Node sidecar süreci hazır olur olmaz
                // pencereyi onun adresine yönlendirir (statik export YOK,
                // bkz. sidecar.rs'teki modül dokümantasyonu).
                WebviewUrl::App("index.html".into())
            };

            let setup_handle = app.handle().clone();
            let window = WebviewWindowBuilder::new(app, "main", initial_url)
                .title("Öğün")
                // GÖREV 2 — varsayılan 1280x800, minimum 1024x680.
                .inner_size(1280.0, 800.0)
                .min_inner_size(1024.0, 680.0)
                // GÖREV 3 — pencere içi TAM SAYFA navigasyon denemelerini
                // yakalar (bkz. navigation.rs'teki modül notu: Next.js
                // App Router'ın istemci-taraflı gezinmesi buradan hiç
                // geçmez, sadece gerçek <a href> / window.location
                // denemeleri).
                .on_navigation(move |url| {
                    let origin = setup_handle.state::<AppOrigin>();
                    if navigation::should_open_externally(url, &origin) {
                        if let Err(err) = setup_handle.opener().open_url(url.as_str(), None::<&str>)
                        {
                            eprintln!("[ogun-desktop] sistem tarayıcısı açılamadı: {err}");
                        }
                        // Pencere içi navigasyonu İPTAL et — link sistem
                        // tarayıcısında açıldı, uygulama penceresi olduğu
                        // sayfada kalmalı.
                        false
                    } else {
                        true
                    }
                })
                .build()?;

            if !is_dev {
                sidecar::spawn_and_redirect(app.handle().clone(), window);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Öğün masaüstü uygulaması başlatılırken hata oluştu");
}
