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
//! - Üretimde pencere doğrudan `https://ogun-web.vercel.app` adresini açar.
//!   Sunucu secret'ları ve veritabanı bağlantı bilgileri installer'a konmaz;
//!   masaüstü paketi yalnızca güvenli bir native istemci kabuğudur.
//! - GitHub issue #52 — `ogun://` deep link'leri (bkz. deep_link.rs) ve
//!   native oturum kalıcılığı (bkz. secure_storage.rs) burada bir araya
//!   getirilir.

mod deep_link;
mod menu;
mod menu_actions;
mod local_db;
mod navigation;
mod notifications;
mod offline_vault;
mod online_preload;
mod secure_storage;
mod settings;
mod startup;
mod tray;
mod updater;
mod vault;
mod window_controls;
mod window_ops;

use deep_link::{FrontendReady, PendingDeepLink};
use navigation::AppOrigin;
use tauri::{Listener, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_opener::OpenerExt;

/// apps/web'in `next dev` sunucusunun varsayılan adresi.
const DEV_ORIGIN: &str = "http://127.0.0.1:1420";
const PRODUCTION_ORIGIN: &str = "http://tauri.localhost";

pub fn run() {
    tauri::Builder::default()
        // GitHub issue #52 / Prompt 9.2, GÖREV 1 — bu eklenti EN BAŞTA
        // kayıtlı olmalı (Tauri'nin kendi önerdiği sıralama): Windows/
        // Linux'ta uygulama ZATEN açıkken ikinci bir "ogun://..."
        // tıklaması normalde YENİ bir süreç başlatır — bu eklenti onu
        // erkenden YAKALAYIP kapatır ve argümanlarını (deep-link özelliği
        // sayesinde, bkz. Cargo.toml) ÇALIŞAN sürece iletir. macOS bunu
        // OS düzeyinde zaten native halleder, burada devreye GİRMEZ.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // "deep-link" özelliği (Cargo.toml), ikinci süreç argümanlarını
            // OTOMATİK olarak tauri-plugin-deep-link'in
            // handle_cli_arguments'ına iletir ve (eşleşen bir URL varsa)
            // "deep-link://new-url" olayını KENDİSİ yayınlar — aşağıdaki
            // TEK dinleyici (bkz. .setup() içindeki app.listen) bunu soğuk
            // başlangıçtan gelenle AYNI şekilde işler. Normal masaüstü
            // kısayoluna ikinci kez basılmışsa deep link bulunmaz; yine de
            // kullanıcının beklediği davranış mevcut pencerenin açılmasıdır.
            window_ops::focus_main_window(app);
        }))
        // GÖREV 2 — pencere boyutu/konumu/maximize durumu kalıcılığı.
        // Kullanıcı her açtığında sıfırlanmaması için tek satır yeterli:
        // eklenti pencere oluşturulduğunda otomatik geri yükler, kapanışta
        // otomatik kaydeder (bkz. tauri-plugin-window-state dokümantasyonu).
        .plugin(tauri_plugin_window_state::Builder::new().build())
        // GÖREV 3 — dış http(s) linkleri sistem tarayıcısında açmak için.
        .plugin(tauri_plugin_opener::init())
        // GitHub issue #53 / Prompt 9.3, GÖREV 3 — native OS bildirimleri
        // (bkz. notifications.rs).
        .plugin(tauri_plugin_notification::init())
        // GÖREV 4 — native "Farklı Kaydet" / dosya seçici diyalogları.
        // JS tarafı (@tauri-apps/plugin-dialog) doğrudan bu eklentinin
        // kendi komutlarını çağırır — apps/desktop'ta AYRICA bir sarmalayıcı
        // Rust komutu YOK (bkz. capabilities/default.json izin notu).
        .plugin(tauri_plugin_dialog::init())
        // GÖREV 4 — dialog'un seçtiği/kaydettiği yoldan GERÇEK byte
        // okuma/yazma (JS tarafı @tauri-apps/plugin-fs). Aynı şekilde
        // apps/desktop'ta sarmalayıcı bir komut YOK.
        .plugin(tauri_plugin_fs::init())
        // GitHub issue #54 / Prompt 9.4, GÖREV 3 — otomatik güncelleme
        // (bkz. updater.rs dosya başı notu). Eklenti HER ZAMAN kaydedilir
        // (diğer tüm eklentilerle AYNI desen) — ama gerçek bir güncelleme
        // KONTROLÜ sadece `OGUN_UPDATE_MANIFEST_URL`/`OGUN_UPDATE_PUBKEY`
        // derleme zamanında tanımlıysa tetiklenir (bkz. aşağıdaki
        // `updater::check_for_updates_on_startup` çağrısı ve updater.rs'in
        // `build_updater` fonksiyonu) — bu ikisi tanımsızken eklentinin
        // KAYITLI olması zararsızdır, sadece hiç kullanılmaz. Resmi çoklu
        // platform örneği bu eklentiyi `#[cfg(desktop)]` ile SADECE
        // masaüstünde kaydeder (mobil hedefte YOK) — bu paket hiç mobil
        // hedeflemediğinden (bkz. Cargo.toml [[bin]]) o koşul GEREKSİZ.
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            offline_vault::list_offline_profiles,
            offline_vault::upsert_offline_profile,
            offline_vault::remove_active_offline_profile,
            offline_vault::configure_offline_pin,
            offline_vault::unlock_offline_profile,
            offline_vault::lock_offline_profile,
            offline_vault::get_unlocked_offline_workspace,
            offline_vault::save_offline_workspace,
            offline_vault::save_offline_plan_draft,
            offline_vault::queue_offline_mutation,
            offline_vault::load_pending_offline_mutations,
            offline_vault::acknowledge_offline_mutations,
            offline_vault::save_offline_food_catalog,
            offline_vault::search_offline_food_catalog,
            offline_vault::get_offline_food_entries,
            offline_vault::desktop_network_available,
            offline_vault::show_offline_workspace,
            local_db::desktop_db_info,
            local_db::initialize_local_scope,
            local_db::replace_local_entities,
            local_db::replace_local_workspace,
            local_db::list_local_entities,
            local_db::apply_local_mutation,
            local_db::load_local_outbox,
            local_db::acknowledge_local_outbox,
            local_db::fail_local_outbox_mutation,
            local_db::local_food_catalog_info,
            local_db::replace_local_food_catalog,
            local_db::search_local_foods,
            local_db::get_local_food_entries,
            deep_link::notify_frontend_ready,
            // GitHub issue #53 / Prompt 9.3 — dar kapsamlı, tek-amaçlı
            // komutlar (bkz. Cargo.toml/PR'daki genel prensip: sadece
            // GERÇEKTEN gereken kadar IPC yüzeyi aç, secure_storage.rs'teki
            // ile AYNI disiplin).
            notifications::show_native_notification,
            window_controls::control_main_window,
            window_ops::focus_main_window_command,
            settings::get_minimize_to_tray_setting,
            settings::set_minimize_to_tray_setting,
            tray::update_tray_today_appointments_summary,
            startup::is_autostart_launch,
            startup::complete_startup_launch,
            // Kullanıcı raporu: "ilk açtığımda 4-5 saniyelik full beyaz ekran
            // geliyor" — splash görünürken çevrimiçi uygulamayı gizli pencerede
            // ön yükleyip hazır olunca geçen akış (bkz. online_preload.rs).
            online_preload::open_online_app,
        ])
        .setup(|app| {
            let is_dev = tauri::is_dev();
            let autostart_requested = startup::is_autostart_argument(std::env::args());
            // PERFORMANS (kullanıcı raporu: "ilk açılış beyaz ekranda
            // kalıyor"): has_saved_profiles kasa snapshot'ını açar — eski kod
            // bunu PENCERE OLUŞTURULMADAN her başlangıçta senkron yapıyordu,
            // yani Argon2 + snapshot çözümü pencere daha var olmadan gecikme
            // ekliyordu. Otomatik başlangıçta (pencere zaten gizli olacak)
            // sonuç hâlâ gerekli; normal açılışta ise pencere GÖSTERİLDİKTEN
            // sonra arka planda hesaplanır.
            let has_saved_profiles = if autostart_requested {
                offline_vault::has_saved_profiles(app.handle())
            } else {
                false
            };
            let start_hidden = autostart_requested && has_saved_profiles;

            // GÖREV 3'ün karar mantığı (navigation.rs) kendi origin'imizi
            // bilmeye ihtiyaç duyar: dev'de localhost, üretimde sabit ve
            // güvenilir web origin'i kullanılır. Pencereyi
            // oluşturmadan ÖNCE yönetime alınmalı — ilk navigasyon olayı
            // (splash/dev sayfasının kendisi) daha pencere `build()`
            // dönmeden tetiklenebilir.
            let app_origin = if is_dev {
                DEV_ORIGIN
            } else {
                PRODUCTION_ORIGIN
            };
            app.manage(AppOrigin::new(Some(app_origin.to_string())));

            // GitHub issue #52 / Prompt 9.2 — henüz işlenemeyen (origin ya
            // da frontend hazır değilken gelen) TEK bir deep link'i bekletir
            // (bkz. deep_link.rs dosya başı "SOĞUK BAŞLANGIÇ" notu).
            app.manage(PendingDeepLink::default());
            // Kod incelemesi (PR #56) — frontend'in `ogun-oauth-callback`
            // olayını DİNLEMEYE BAŞLADIĞINI (bkz. native-auth-bridge.tsx
            // `notify_frontend_ready` çağrısı) işaretler; bundan ÖNCE
            // yayınlanan bir OAuth olayı dinleyicisiz kalıp KAYBOLABİLİRDİ.
            app.manage(FrontendReady::default());
            app.manage(offline_vault::OfflineVaultState::default());
            // GitHub issue #53 / Prompt 9.3 — GÖREV 1 (Görünüm > Yakınlaştır/
            // Uzaklaştır zoom seviyesi) ve GÖREV 2 (tray'e küçültme tercihi,
            // bkz. settings.rs dosya başı "TASARIM KARARI" notu) durumu.
            // Pencere/menü/tray HENÜZ kurulmadı ama ikisi de bu state'e
            // ihtiyaç duyacak — önce yönetime alınmalı (navigation.rs'teki
            // AppOrigin ile AYNI sıralama gerekçesi).
            app.manage(window_ops::ZoomLevel::default());
            app.manage(settings::SettingsState::load(app.handle()));
            app.manage(startup::StartupLaunchState::new(start_hidden));
            if autostart_requested {
                startup::set_enabled_for_saved_profiles(app.handle(), has_saved_profiles);
            } else {
                // Normal açılış: otomatik başlangıç kaydının güncel durumu
                // (kayıtlı hesap var mı) pencere gösterildikten sonra
                // hesaplanır — bkz. yukarıdaki PERFORMANS notu.
                let deferred_handle = app.handle().clone();
                std::thread::spawn(move || {
                    let has_profiles = offline_vault::has_saved_profiles(&deferred_handle);
                    startup::set_enabled_for_saved_profiles(&deferred_handle, has_profiles);
                });
            }
            // Splash'in çevrimiçi geçişi için tek uçuş durumu (bkz.
            // online_preload.rs).
            app.manage(online_preload::OnlinePreloadState::default());

            // GÖREV 1 — native menü çubuğu. GÖREV 2 — tray simgesi. İkisi de
            // "main" penceresinin VAR OLMASINI gerektirmez (bkz. menu.rs/
            // tray.rs dosya başı notları) — tıklama olayları penceriyi
            // SADECE tetiklendiklerinde ararlar.
            menu::build_and_set(app)?;
            tray::build(app)?;

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
                        eprintln!(
                            "[ogun-desktop] deep-link://new-url olayı ayrıştırılamadı: {err}"
                        );
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

            // Development and production both boot the packaged Ogun renderer.
            // Connectivity may change its repositories, never this WebView URL.
            let initial_url = if is_dev {
                WebviewUrl::External(
                    DEV_ORIGIN
                        .parse()
                        .expect("desktop UI development URL must be valid"),
                )
            } else {
                WebviewUrl::App("index.html".into())
            };

            let setup_handle = app.handle().clone();
            let window = WebviewWindowBuilder::new(app, "main", initial_url)
                .title("Öğün")
                // Kullanıcı raporu: "ilk açtığımda full beyaz ekran geliyor."
                // WebView2 ilk boyamaya kadar (ve uzak sayfa yüklenene kadar)
                // penceresini BEYAZ gösterir; başlık çubuğunun koyu yeşili
                // (#09271d) arka plan olarak verildiğinde bu boşluklar beyaz
                // flaş yerine marka rengiyle dolar.
                .background_color(tauri::window::Color(9, 39, 29, 255))
                // GÖREV 2 — varsayılan 1280x800, minimum 1024x680.
                .inner_size(1280.0, 800.0)
                .min_inner_size(1024.0, 680.0)
                // Uygulama kendi, Docker Desktop benzeri başlık çubuğunu
                // apps/web içinde çiziyor; işletim sistemi başlığını kapatıp
                // çift başlık oluşmasını önlüyoruz.
                .decorations(false)
                .visible(!start_hidden)
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

            // GitHub issue #53 / Prompt 9.3, GÖREV 2 — "Pencere kapatılınca
            // uygulama tamamen kapanmasın, tray'de kalsın (X butonu = simge
            // durumuna küçült, gerçek çıkış menüden) ... ayarlarda
            // kapatılabilir yap." `CloseRequested` olayını (kullanıcı X'e
            // bastığında) engelleyip, ayar AÇIKSA gerçek kapatmayı İPTAL
            // edip pencereyi sadece GİZLİYORUZ (`hide()` — `unminimize()`
            // ile window_ops::focus_main_window() tarafından geri
            // getirilebilir, bkz. tray "Uygulamayı aç"). Ayar KAPALIYSA
            // (kullanıcı klasik "X = tamamen kapat" davranışını seçtiyse)
            // olayı HİÇ engellemiyoruz — normal Tauri kapatma akışı devam
            // eder. Gerçek çıkış (tray/menü "Çıkış") BU engelleyiciden HİÇ
            // geçmez: `app.exit(0)` (bkz. menu_actions.rs) doğrudan süreci
            // sonlandırır, bir "close requested" penceri OLAYI değildir.
            {
                let settings_handle = app.handle().clone();
                let window_to_hide = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        let minimize_to_tray = settings_handle
                            .state::<settings::SettingsState>()
                            .get()
                            .minimize_to_tray_on_close;
                        if minimize_to_tray {
                            api.prevent_close();
                            if let Err(err) = window_to_hide.hide() {
                                eprintln!("[ogun-desktop] pencere tepsiye küçültülemedi: {err}");
                            }
                        }
                    }
                });
            }

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
                // GitHub issue #54 / Prompt 9.4, GÖREV 3 — sadece üretimde
                // (dev'de zaten gerçek bir sürüm/manifest YOK) ve pencere
                // ARTIK var (mandatory/optional diyaloğun bir ebeveyni
                // olabilsin diye, pencere oluşturmayla AYNI sıralama
                // gerekçesi). SESSİZCE çalışır — bkz. updater.rs.
                updater::check_for_updates_on_startup(app.handle().clone());
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Öğün masaüstü uygulaması başlatılırken hata oluştu");
}
