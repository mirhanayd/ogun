//! Öğün masaüstü kabuğu — GitHub issue #51 / Prompt 9.1, #52 / Prompt 9.2.
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
//! - GitHub issue #52 — `ogun://` deep link'leri (bkz. deep_link.rs) ve
//!   native oturum kalıcılığı (bkz. secure_storage.rs) burada bir araya
//!   getirilir.

mod deep_link;
mod navigation;
mod secure_storage;
mod sidecar;

use deep_link::{FrontendReady, PendingDeepLink};
use navigation::AppOrigin;
use tauri::{Listener, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

/// apps/web'in `next dev` sunucusunun varsayılan adresi.
const DEV_URL: &str = "http://localhost:3000";

pub fn run() {
    tauri::Builder::default()
        // GitHub issue #52 / Prompt 9.2, GÖREV 1 — bu eklenti EN BAŞTA
        // kayıtlı olmalı (Tauri'nin kendi önerdiği sıralama): Windows/
        // Linux'ta uygulama ZATEN açıkken ikinci bir "ogun://..."
        // tıklaması normalde YENİ bir süreç başlatır — bu eklenti onu
        // erkenden YAKALAYIP kapatır ve argümanlarını (deep-link özelliği
        // sayesinde, bkz. Cargo.toml) ÇALIŞAN sürece iletir. macOS bunu
        // OS düzeyinde zaten native halleder, burada devreye GİRMEZ.
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {
            // "deep-link" özelliği (Cargo.toml), ikinci süreç argümanlarını
            // OTOMATİK olarak tauri-plugin-deep-link'in
            // handle_cli_arguments'ına iletir ve (eşleşen bir URL varsa)
            // "deep-link://new-url" olayını KENDİSİ yayınlar — aşağıdaki
            // TEK dinleyici (bkz. .setup() içindeki app.listen) bunu soğuk
            // başlangıçtan gelenle AYNI şekilde işler. Burada EK bir şey
            // yapmaya gerek YOK.
        }))
        // GÖREV 2 — pencere boyutu/konumu/maximize durumu kalıcılığı.
        // Kullanıcı her açtığında sıfırlanmaması için tek satır yeterli:
        // eklenti pencere oluşturulduğunda otomatik geri yükler, kapanışta
        // otomatik kaydeder (bkz. tauri-plugin-window-state dokümantasyonu).
        .plugin(tauri_plugin_window_state::Builder::new().build())
        // GÖREV 1 — üretimde Node sidecar sürecini başlatmak için.
        .plugin(tauri_plugin_shell::init())
        // GÖREV 3 — dış http(s) linkleri sistem tarayıcısında açmak için.
        .plugin(tauri_plugin_opener::init())
        // GitHub issue #52 / Prompt 9.2, GÖREV 1 — ogun:// şemasını yakalar
        // (bkz. deep_link.rs modül notu — navigation.rs'teki on_navigation'dan
        // TAMAMEN FARKLI bir mekanizma).
        .plugin(tauri_plugin_deep_link::init())
        // GitHub issue #52 / Prompt 9.2, GÖREV 3 — güvenli oturum token
        // depolaması (bkz. secure_storage.rs dosya başı notu: stronghold
        // BURADA bir Tauri eklentisi olarak DEĞİL, düz bir Rust kütüphanesi
        // olarak kullanılıyor — bu yüzden burada `tauri_plugin_stronghold::
        // Builder(...)` YOK, sadece kendi 3 dar kapsamlı komutumuz var).
        .invoke_handler(tauri::generate_handler![
            secure_storage::store_session_token,
            secure_storage::load_session_token,
            secure_storage::clear_session_token,
            deep_link::notify_frontend_ready,
        ])
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

            // GitHub issue #52 / Prompt 9.2 — henüz işlenemeyen (origin ya
            // da frontend hazır değilken gelen) TEK bir deep link'i bekletir
            // (bkz. deep_link.rs dosya başı "SOĞUK BAŞLANGIÇ" notu).
            app.manage(PendingDeepLink::default());
            // Kod incelemesi (PR #56) — frontend'in `ogun-oauth-callback`
            // olayını DİNLEMEYE BAŞLADIĞINI (bkz. native-auth-bridge.tsx
            // `notify_frontend_ready` çağrısı) işaretler; bundan ÖNCE
            // yayınlanan bir OAuth olayı dinleyicisiz kalıp KAYBOLABİLİRDİ.
            app.manage(FrontendReady::default());

            // GitHub issue #52 / Prompt 9.2, GÖREV 1 — TEK deep link
            // dinleyicisi: hem soğuk başlangıçta (bkz. tauri-plugin-
            // deep-link'in kendi init_deep_link'i, std::env::args()'ı
            // kontrol eder) hem de uygulama zaten açıkken (bkz. yukarıdaki
            // single_instance eklentisi) AYNI "deep-link://new-url" olayı
            // yayınlanır — burada TEK bir yerde işliyoruz (bkz. deep_link.rs
            // handle_urls).
            let deep_link_handle = app.handle().clone();
            app.listen("deep-link://new-url", move |event| {
                let urls: Vec<Url> = match serde_json::from_str::<Vec<String>>(event.payload()) {
                    Ok(raw) => raw.iter().filter_map(|s| Url::parse(s).ok()).collect(),
                    Err(err) => {
                        eprintln!("[ogun-desktop] deep-link://new-url olayı ayrıştırılamadı: {err}");
                        return;
                    }
                };
                deep_link::handle_urls(&deep_link_handle, urls);
            });

            // GitHub issue #52 / Prompt 9.2 — Windows/Linux'ta özel URL
            // şeması kaydı, PAKETLİ kurulum programı (NSIS/MSI) tarafından
            // otomatik yapılabilir (bkz. faz-9-masaustu-kabugu.md Prompt
            // 9.4 — henüz YAPILMADI, bu issue'nun kapsamı DIŞINDA), bu
            // yüzden şimdilik burada, uygulama AÇILDIĞINDA (idempotent —
            // zaten kayıtlıysa zararsız) kaydediyoruz. macOS bunu Info.plist
            // üzerinden derleme zamanında halleder, `register_all()` orada
            // `UnsupportedPlatform` döner (görmezden geliniyor).
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(err) = app.deep_link().register_all() {
                    eprintln!("[ogun-desktop] ogun:// şeması kaydedilemedi: {err}");
                }
            }

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

            // GitHub issue #52 / Prompt 9.2 — ÖNEMLİ SIRALAMA NOTU:
            // tauri-plugin-deep-link'in KENDİ eklenti setup'ı (yukarıdaki
            // `.plugin(tauri_plugin_deep_link::init())`, Windows/Linux'ta
            // std::env::args()'ı kontrol edip "deep-link://new-url" olayını
            // YAYINLAR) bu uygulama-seviyesi `.setup()` kapanışından —
            // dolayısıyla yukarıdaki `app.listen(...)` KAYDINDAN — ÖNCE
            // çalışır (eklentiler, app.setup()'tan ÖNCE ilklendirilir). Bu
            // yüzden SOĞUK başlangıçta gelen bir deep link'in olayını
            // KAÇIRMIŞ olabiliriz — pluginin TAM OLARAK BUNUN İÇİN
            // dokümante ettiği `get_current()` ile (bkz. o metodun kendi
            // doc-comment'i: "Use this on app load to check whether your
            // app was started via a deep link") burada AYRICA kontrol
            // ediyoruz. Pencere ARTIK var (bir üstteki `.build()?`) — bu
            // yüzden bu kontrol PENCERE OLUŞTURULMADAN önce DEĞİL, hemen
            // SONRA yapılıyor (navigate_to_reset_password "main" penceresini
            // bulabilsin diye). Bu noktada frontend HENÜZ hazır değildir
            // (React mount olmadı) — bir OAuth geri dönüşü bulunursa
            // `dispatch`/`try_process` (bkz. deep_link.rs) bunu otomatik
            // olarak `PendingDeepLink`'e koyar, `notify_frontend_ready`
            // çağrıldığında drenaj edilir.
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Ok(Some(urls)) = app.deep_link().get_current() {
                    deep_link::handle_urls(app.handle(), urls);
                }
            }

            if !is_dev {
                sidecar::spawn_and_redirect(app.handle().clone(), window);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Öğün masaüstü uygulaması başlatılırken hata oluştu");
}
