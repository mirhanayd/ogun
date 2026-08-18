//! GitHub issue #53 / Prompt 9.3 — native menü çubuğu (menu.rs) VE tray
//! sağ-tık menüsü (tray.rs) AYNI eylem kümesini kısmen paylaşıyor (ör.
//! "Yeni danışan" hem Dosya menüsünde hem tray'de var, "Çıkış" hem
//! Windows'ta Dosya menüsünde hem macOS uygulama menüsünde hem tray'de).
//! Bu modül o paylaşılan eylemleri TEK bir yerde tanımlar — menu.rs ve
//! tray.rs SADECE aşağıdaki `ACTION_*` id sabitlerini kullanarak menü
//! öğesi kurar, tıklama olduğunda İKİSİ de `handle(app, event.id())`'i
//! çağırır. deep_link.rs/navigation.rs'teki "saf ayrıştırma, ayrı yan
//! etki" deseniyle AYNI: `parse_menu_action` SAF'tır (Tauri çalışma zamanı
//! GEREKTİRMEZ, bkz. testler), gerçek yan etki `dispatch` içinde ayrı.

use tauri::menu::MenuId;
use tauri::{AppHandle, Emitter};
use tauri_plugin_dialog::DialogExt;

use crate::{deep_link, window_ops};

// Menü/tray öğe id'leri TEK burada tanımlı — menu.rs ve tray.rs sadece bu
// sabitleri kullanır, `parse_menu_action`'daki eşleşmeyle YAZIM HATASI
// riski olmadan senkron kalır (derleyici string literal'lerini KARŞILAŞTIRMAZ
// ama testler `parses_all_known_action_ids` ile bunu doğrular).
pub const ACTION_NEW_CLIENT: &str = "ogun-action:new-client";
pub const ACTION_NEW_PLAN: &str = "ogun-action:new-plan";
pub const ACTION_OPEN_SETTINGS: &str = "ogun-action:open-settings";
pub const ACTION_QUIT: &str = "ogun-action:quit";
pub const ACTION_ZOOM_IN: &str = "ogun-action:zoom-in";
pub const ACTION_ZOOM_OUT: &str = "ogun-action:zoom-out";
pub const ACTION_ZOOM_RESET: &str = "ogun-action:zoom-reset";
pub const ACTION_THEME_LIGHT: &str = "ogun-action:theme-light";
pub const ACTION_THEME_DARK: &str = "ogun-action:theme-dark";
pub const ACTION_THEME_SYSTEM: &str = "ogun-action:theme-system";
pub const ACTION_SHOW_SHORTCUTS: &str = "ogun-action:show-shortcuts";
pub const ACTION_SEND_FEEDBACK: &str = "ogun-action:send-feedback";
pub const ACTION_VERSION_INFO: &str = "ogun-action:version-info";
pub const ACTION_TODAY_APPOINTMENTS: &str = "ogun-action:today-appointments";
pub const ACTION_OPEN_APP: &str = "ogun-action:open-app";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MenuAction {
    NewClient,
    NewPlan,
    OpenSettings,
    Quit,
    ZoomIn,
    ZoomOut,
    ZoomReset,
    ThemeLight,
    ThemeDark,
    ThemeSystem,
    ShowShortcuts,
    SendFeedback,
    VersionInfo,
    TodayAppointments,
    OpenApp,
}

/// Bir menü/tray öğesi id'sini (bkz. yukarıdaki `ACTION_*` sabitleri)
/// bilinen bir `MenuAction`'a çözer. SAF — Tauri çalışma zamanı gerektirmez.
/// Tanımadığı id'ler için `None` döner — bu bir HATA değildir: OS'un
/// kendiliğinden yönettiği `PredefinedMenuItem`'lar (Kes/Kopyala/Yapıştır/
/// Tümünü Seç, Tam Ekran, macOS Hizmetler/Gizle/vb.) KENDİ id'lerini
/// muda/OS üretir, bizim eylem kümemizde hiç YER ALMAZLAR — buraya hiç
/// gelmemeleri BEKLENEN davranış.
pub fn parse_menu_action(id: &str) -> Option<MenuAction> {
    Some(match id {
        ACTION_NEW_CLIENT => MenuAction::NewClient,
        ACTION_NEW_PLAN => MenuAction::NewPlan,
        ACTION_OPEN_SETTINGS => MenuAction::OpenSettings,
        ACTION_QUIT => MenuAction::Quit,
        ACTION_ZOOM_IN => MenuAction::ZoomIn,
        ACTION_ZOOM_OUT => MenuAction::ZoomOut,
        ACTION_ZOOM_RESET => MenuAction::ZoomReset,
        ACTION_THEME_LIGHT => MenuAction::ThemeLight,
        ACTION_THEME_DARK => MenuAction::ThemeDark,
        ACTION_THEME_SYSTEM => MenuAction::ThemeSystem,
        ACTION_SHOW_SHORTCUTS => MenuAction::ShowShortcuts,
        ACTION_SEND_FEEDBACK => MenuAction::SendFeedback,
        ACTION_VERSION_INFO => MenuAction::VersionInfo,
        ACTION_TODAY_APPOINTMENTS => MenuAction::TodayAppointments,
        ACTION_OPEN_APP => MenuAction::OpenApp,
        _ => return None,
    })
}

/// `MenuEvent`/tray menü olayının id'sini çözüp varsa ilgili yan etkiyi
/// UYGULAR. menu.rs'in `app.on_menu_event` VE tray.rs'in
/// `TrayIconBuilder::on_menu_event` kayıtlarının İKİSİ de AYNI bu
/// fonksiyonu çağırır — davranış İKİ kaynak için de TEK yerde tanımlı.
pub fn handle(app: &AppHandle, id: &MenuId) {
    let Some(action) = parse_menu_action(id.as_ref()) else {
        return;
    };
    dispatch(app, action);
}

fn dispatch(app: &AppHandle, action: MenuAction) {
    match action {
        // Navigasyon eylemleri — TAMAMI deep_link.rs'in `request_navigation`
        // üzerinden AYNI kuyruk/drenaj mekanizmasını kullanır (bkz. o
        // dosyanın "GitHub issue #53" notu).
        MenuAction::NewClient => deep_link::request_navigation(app, "/danisanlar/yeni"),
        // "Yeni Plan": bir plan HER ZAMAN bir danışana bağlıdır (bkz.
        // apps/web/src/app/(app)/planlar/page.tsx dosya başı notu) — global
        // bir "plan oluştur" route'u YOK. En doğru hedef, o sayfanın
        // KENDİSİNİN de yönlendirdiği /planlar hub'ı (şablon kütüphanesi +
        // "danışan bazlı oluşturulur" açıklaması).
        MenuAction::NewPlan => deep_link::request_navigation(app, "/planlar"),
        MenuAction::OpenSettings => deep_link::request_navigation(app, "/ayarlar"),
        MenuAction::TodayAppointments => deep_link::request_navigation(app, "/randevular"),
        MenuAction::OpenApp => window_ops::focus_main_window(app),
        MenuAction::Quit => app.exit(0),
        MenuAction::ZoomIn => window_ops::zoom_in(app),
        MenuAction::ZoomOut => window_ops::zoom_out(app),
        MenuAction::ZoomReset => window_ops::reset_zoom(app),
        // Tema — apps/web'e next-themes ÜZERİNDEN (zaten bağımlılık olarak
        // vardı, sadece BAĞLANMAMIŞTI, bkz. providers.tsx/PR açıklaması)
        // bir olay yayınlıyoruz; gerçek uygulama JS tarafında.
        MenuAction::ThemeLight => emit_theme(app, "light"),
        MenuAction::ThemeDark => emit_theme(app, "dark"),
        MenuAction::ThemeSystem => emit_theme(app, "system"),
        // Klavye kısayolları / geri bildirim — apps/web'de ZATEN VAR OLAN
        // diyalogları (bkz. keyboard-shortcuts-help.tsx, feedback-button.tsx)
        // AÇAN olaylar; yeni bir UI İCAT ETMİYORUZ, sadece dışarıdan
        // açılabilir hale getiriyoruz.
        MenuAction::ShowShortcuts => emit_simple(app, "ogun-menu-open-shortcuts"),
        MenuAction::SendFeedback => emit_simple(app, "ogun-menu-open-feedback"),
        // Sürüm bilgisi — apps/web'e HİÇ dokunmadan, tamamen native bir
        // diyalogla (tauri-plugin-dialog) gösterilir.
        MenuAction::VersionInfo => show_version_info(app),
    }
}

fn emit_theme(app: &AppHandle, theme: &str) {
    if let Err(err) = app.emit("ogun-menu-set-theme", theme) {
        eprintln!("[ogun-desktop] tema olayı yayınlanamadı: {err}");
    }
}

fn emit_simple(app: &AppHandle, event: &str) {
    if let Err(err) = app.emit(event, ()) {
        eprintln!("[ogun-desktop] '{event}' olayı yayınlanamadı: {err}");
    }
}

fn show_version_info(app: &AppHandle) {
    let version = app.package_info().version.to_string();
    app.dialog()
        .message(format!("Öğün masaüstü uygulaması\nSürüm {version}"))
        .title("Sürüm bilgisi")
        .kind(tauri_plugin_dialog::MessageDialogKind::Info)
        .show(|_| {});
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_all_known_action_ids() {
        let cases = [
            (ACTION_NEW_CLIENT, MenuAction::NewClient),
            (ACTION_NEW_PLAN, MenuAction::NewPlan),
            (ACTION_OPEN_SETTINGS, MenuAction::OpenSettings),
            (ACTION_QUIT, MenuAction::Quit),
            (ACTION_ZOOM_IN, MenuAction::ZoomIn),
            (ACTION_ZOOM_OUT, MenuAction::ZoomOut),
            (ACTION_ZOOM_RESET, MenuAction::ZoomReset),
            (ACTION_THEME_LIGHT, MenuAction::ThemeLight),
            (ACTION_THEME_DARK, MenuAction::ThemeDark),
            (ACTION_THEME_SYSTEM, MenuAction::ThemeSystem),
            (ACTION_SHOW_SHORTCUTS, MenuAction::ShowShortcuts),
            (ACTION_SEND_FEEDBACK, MenuAction::SendFeedback),
            (ACTION_VERSION_INFO, MenuAction::VersionInfo),
            (ACTION_TODAY_APPOINTMENTS, MenuAction::TodayAppointments),
            (ACTION_OPEN_APP, MenuAction::OpenApp),
        ];
        for (id, expected) in cases {
            assert_eq!(parse_menu_action(id), Some(expected), "id: {id}");
        }
    }

    #[test]
    fn ignores_unknown_action_id() {
        assert_eq!(parse_menu_action("some-other-menu-item"), None);
    }

    #[test]
    fn ignores_os_generated_predefined_item_ids() {
        // PredefinedMenuItem'lar (Kes/Kopyala/Yapıştır/Tümünü Seç, Tam Ekran)
        // KENDİ id'lerini OS/muda kütüphanesi üretir, bizim eylem kümemizde
        // DEĞİLDİR — bkz. `parse_menu_action` doc-comment'i.
        assert_eq!(parse_menu_action("MudaMenuItem12345"), None);
    }

    #[test]
    fn action_ids_are_all_distinct() {
        let ids = [
            ACTION_NEW_CLIENT,
            ACTION_NEW_PLAN,
            ACTION_OPEN_SETTINGS,
            ACTION_QUIT,
            ACTION_ZOOM_IN,
            ACTION_ZOOM_OUT,
            ACTION_ZOOM_RESET,
            ACTION_THEME_LIGHT,
            ACTION_THEME_DARK,
            ACTION_THEME_SYSTEM,
            ACTION_SHOW_SHORTCUTS,
            ACTION_SEND_FEEDBACK,
            ACTION_VERSION_INFO,
            ACTION_TODAY_APPOINTMENTS,
            ACTION_OPEN_APP,
        ];
        for (i, a) in ids.iter().enumerate() {
            for (j, b) in ids.iter().enumerate() {
                if i != j {
                    assert_ne!(a, b, "id çakışması: {a}");
                }
            }
        }
    }
}
