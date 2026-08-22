//! GitHub issue #53 / Prompt 9.3, GÖREV 1 — native menü çubuğu (Türkçe).
//!
//! PLATFORM FARKI (issue metni: "macOS'te uygulama menüsü ... Windows'ta
//! standart pencere menüsü — platform farkını tauri::Menu ile yönet"):
//! Tauri'nin `Menu` tipi ZATEN platforma göre farklı YERLERDE render edilir
//! ("bir pencere menü çubuğu Windows/Linux'ta, GLOBAL bir menü çubuğu
//! macOS'ta" — bkz. `Menu` doc-comment'i) — TEK bir `app.set_menu(menu)`
//! çağrısı YETERLİ, platforma göre iki AYRI çağrı YAPMIYORUZ. Tek gerçek
//! FARK: macOS kullanıcıları uygulama adını taşıyan bir "app menu"nün
//! (İlk sırada, About/Preferences/Services/Hide/Quit) VAR OLMASINI
//! BEKLER — bu SADECE macOS'a `#[cfg(target_os = "macos")]` ile
//! EKLENİYOR (bkz. `build_macos_app_menu`), Windows/Linux'ta hiç yok.
//! Dosya/Düzen/Görünüm/Yardım menüleri HER platformda AYNI (macOS'ta
//! Ayarlar/Çıkış hem Dosya'da hem app menüsünde YİNELENİYOR — bu KASITLI
//! bir basitleştirme, birçok gerçek macOS uygulaması da böyle davranır;
//! iki AYRI Dosya menüsü yapısı tutmanın karmaşıklığına değmediğine karar
//! verildi, bkz. PR açıklaması).
//!
//! TEMA ALT MENÜSÜ (Açık/Koyu/Sistem) BİLEREK `CheckMenuItem` (işaretli/
//! radyo görünümlü) DEĞİL, düz `MenuItem` — bir işaretli öğe grubunun
//! "şu an hangisi seçili" durumunu SENKRON tutmak (item handle'larını
//! app state olarak saklamak, her tema değişiminde hepsini güncellemek)
//! gerçek bir tasarım sistemi/tema anahtarı Faz 10'a kadar YOK iken
//! (bkz. apps/web/src/app/providers.tsx'e eklenen minimal ThemeProvider
//! köprüsü) gereksiz karmaşıklık — Faz 10'da GERÇEK bir tema TOGGLE'ı
//! geldiğinde bu menü de CheckMenuItem'a yükseltilebilir.

use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::App;

use crate::menu_actions::*;

/// lib.rs'in `.setup()` kapanışından çağrılır — pencere henüz kurulmamış
/// olabilir, sorun DEĞİL: menü öğeleri sadece TIKLANDIĞINDA (bkz.
/// menu_actions.rs) "main" penceresini arar, o ana kadar pencere zaten
/// var olacaktır.
pub fn build_and_set(app: &App) -> tauri::Result<()> {
    let dosya = SubmenuBuilder::new(app, "Dosya")
        .item(&MenuItemBuilder::with_id(ACTION_NEW_CLIENT, "Yeni Danışan").accelerator("CmdOrCtrl+N").build(app)?)
        .item(&MenuItemBuilder::with_id(ACTION_NEW_PLAN, "Yeni Plan").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id(ACTION_OPEN_SETTINGS, "Ayarlar").accelerator("CmdOrCtrl+,").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id(ACTION_QUIT, "Çıkış").accelerator("CmdOrCtrl+Q").build(app)?)
        .build()?;

    // GÖREV 1 "Düzen: Kes/Kopyala/Yapıştır/Tümünü Seç (metin alanları için
    // standart)" — bunlar `PredefinedMenuItem`: OS'un/webview'in KENDİ
    // native metin düzenleme davranışını tetikler (odaklı bir <input>/
    // <textarea> üzerinde), apps/web'e HİÇBİR şey EKLEMEMİZ gerekmez.
    let duzen = SubmenuBuilder::new(app, "Düzen")
        .item(&PredefinedMenuItem::cut(app, Some("Kes"))?)
        .item(&PredefinedMenuItem::copy(app, Some("Kopyala"))?)
        .item(&PredefinedMenuItem::paste(app, Some("Yapıştır"))?)
        .item(&PredefinedMenuItem::select_all(app, Some("Tümünü Seç"))?)
        .build()?;

    let tema = SubmenuBuilder::new(app, "Tema")
        .item(&MenuItemBuilder::with_id(ACTION_THEME_LIGHT, "Açık").build(app)?)
        .item(&MenuItemBuilder::with_id(ACTION_THEME_DARK, "Koyu").build(app)?)
        .item(&MenuItemBuilder::with_id(ACTION_THEME_SYSTEM, "Sistem").build(app)?)
        .build()?;

    let gorunum = SubmenuBuilder::new(app, "Görünüm")
        .item(&MenuItemBuilder::with_id(ACTION_ZOOM_IN, "Yakınlaştır").accelerator("CmdOrCtrl+Plus").build(app)?)
        .item(&MenuItemBuilder::with_id(ACTION_ZOOM_OUT, "Uzaklaştır").accelerator("CmdOrCtrl+-").build(app)?)
        .item(
            &MenuItemBuilder::with_id(ACTION_ZOOM_RESET, "Yakınlaştırmayı Sıfırla")
                .accelerator("CmdOrCtrl+0")
                .build(app)?,
        )
        .separator()
        // `PredefinedMenuItem::fullscreen` OS-native tam ekran geçişini
        // (ve OS'un kendi doğru varsayılan kısayolunu) kullanır — kendi
        // `set_fullscreen(!is_fullscreen())` mantığımızı YAZMAYA gerek yok.
        .item(&PredefinedMenuItem::fullscreen(app, Some("Tam Ekran"))?)
        .separator()
        .item(&tema)
        .build()?;

    let yardim = SubmenuBuilder::new(app, "Yardım")
        .item(&MenuItemBuilder::with_id(ACTION_SHOW_SHORTCUTS, "Klavye Kısayolları").build(app)?)
        .item(&MenuItemBuilder::with_id(ACTION_SEND_FEEDBACK, "Geri Bildirim Gönder").build(app)?)
        .separator()
        // GitHub issue #54 / Prompt 9.4, GÖREV 3 — açılıştaki sessiz
        // kontrolün (bkz. lib.rs, updater.rs) YANI SIRA kullanıcının
        // istediği an manuel tetikleyebileceği bir yüzey.
        .item(&MenuItemBuilder::with_id(ACTION_CHECK_FOR_UPDATES, "Güncellemeleri Kontrol Et").build(app)?)
        .item(&MenuItemBuilder::with_id(ACTION_VERSION_INFO, "Sürüm Bilgisi").build(app)?)
        .build()?;

    let builder = MenuBuilder::new(app);

    #[cfg(target_os = "macos")]
    let builder = builder.item(&build_macos_app_menu(app)?);

    let menu = builder.item(&dosya).item(&duzen).item(&gorunum).item(&yardim).build()?;

    app.set_menu(menu)?;

    app.on_menu_event(|app, event| {
        crate::menu_actions::handle(app, event.id());
    });

    Ok(())
}

/// macOS'a özgü ilk menü ("Öğün Hakkında, Tercihler ⌘," — bkz. dosya başı
/// notu). `Ayarlar` eylemini burada `Tercihler…` etiketiyle YENİDEN
/// kullanıyoruz — id AYNI (`ACTION_OPEN_SETTINGS`), tek bir handler kolu.
#[cfg(target_os = "macos")]
fn build_macos_app_menu(app: &App) -> tauri::Result<tauri::menu::Submenu<tauri::Wry>> {
    SubmenuBuilder::new(app, "Öğün")
        .item(&PredefinedMenuItem::about(app, Some("Öğün Hakkında"), None)?)
        .separator()
        .item(
            &MenuItemBuilder::with_id(ACTION_OPEN_SETTINGS, "Tercihler…")
                .accelerator("Cmd+,")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::services(app, Some("Servisler"))?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some("Öğün'ü Gizle"))?)
        .item(&PredefinedMenuItem::hide_others(app, Some("Diğerlerini Gizle"))?)
        .item(&PredefinedMenuItem::show_all(app, Some("Tümünü Göster"))?)
        .separator()
        .item(
            &MenuItemBuilder::with_id(ACTION_QUIT, "Öğün'den Çık")
                .accelerator("Cmd+Q")
                .build(app)?,
        )
        .build()
}
