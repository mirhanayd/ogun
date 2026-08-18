//! GitHub issue #53 / Prompt 9.3, GÖREV 2 — görev çubuğu/menü çubuğu
//! simgesi (tray).
//!
//! "Bugünün randevuları (özet)" öğesinin metni STATİK başlar ("Bugünün
//! randevuları") ve apps/web'in native-notification-bridge.tsx'i (zaten
//! panel verisini periyodik okuyan aynı köprü, bkz. notifications.rs
//! dosya başı notu) `update_tray_today_appointments_summary` komutunu
//! çağırdıkça "Bugünün randevuları (N)" olarak GÜNCELLENİR — sayıyı
//! Rust'ın kendisi HESAPLAMAZ (mimari kural #3 ile TUTARLI: iş mantığı
//! apps/web'de kalır).
//!
//! Pencere kapatma davranışı (GÖREV 2'nin "X = simge durumuna küçült"
//! kısmı) BURADA değil, lib.rs'teki `on_window_event` engelleyicisinde —
//! bu modül SADECE tray simgesini/menüsünü kurar.

use tauri::menu::{MenuBuilder, MenuItem, MenuItemBuilder};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{App, AppHandle, Manager};

use crate::menu_actions::*;

/// `TrayIcon` VE dinamik olarak güncellenen "Bugünün randevuları" öğesinin
/// handle'ı — `app.manage(...)` ile YÖNETİLİR (bkz. `build`): `TrayIcon`'un
/// (Drop olduğunda tray simgesini SİLEBİLECEĞİ varsayımıyla, bkz. Tauri'nin
/// genel RAII deseni) CANLI tutulması GEREKİYOR, sadece build() çağırıp
/// sonucu ATMAK riskli olurdu.
pub struct TrayState {
    #[allow(dead_code)] // sadece CANLI tutmak (Drop olmasın) için saklanıyor
    icon: TrayIcon<tauri::Wry>,
    today_appointments_item: MenuItem<tauri::Wry>,
}

pub fn build(app: &App) -> tauri::Result<()> {
    let today_appointments_item = MenuItemBuilder::with_id(ACTION_TODAY_APPOINTMENTS, "Bugünün Randevuları").build(app)?;
    let new_client_item = MenuItemBuilder::with_id(ACTION_NEW_CLIENT, "Yeni Danışan").build(app)?;
    let open_app_item = MenuItemBuilder::with_id(ACTION_OPEN_APP, "Uygulamayı Aç").build(app)?;
    let quit_item = MenuItemBuilder::with_id(ACTION_QUIT, "Çıkış").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&today_appointments_item)
        .separator()
        .item(&new_client_item)
        .item(&open_app_item)
        .separator()
        .item(&quit_item)
        .build()?;

    // Uygulamanın kendi paketlenmiş simgesi (bkz. tauri.conf.json
    // `bundle.icon` / `app.trayIcon`) — AYRI bir tray-özel dosya İCAT
    // ETMEDİK, marka simgesiyle TUTARLI.
    let icon = app
        .default_window_icon()
        .cloned()
        .expect("varsayılan pencere simgesi tauri.conf.json'da tanımlı olmalı (bkz. bundle.icon)");

    let tray = TrayIconBuilder::with_id("ogun-tray")
        .icon(icon)
        .menu(&menu)
        .tooltip("Öğün")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            crate::menu_actions::handle(app, event.id());
        })
        .build(app)?;

    app.manage(TrayState {
        icon: tray,
        today_appointments_item,
    });

    Ok(())
}

/// apps/web'in native-notification-bridge.tsx'inin periyodik olarak
/// çağırdığı komut (bkz. dosya başı notu) — tray menüsündeki "Bugünün
/// Randevuları" öğesinin metnini GÜNCELLER.
#[tauri::command]
pub fn update_tray_today_appointments_summary(app: AppHandle, count: u32) -> Result<(), String> {
    let state = app.state::<TrayState>();
    let text = if count > 0 {
        format!("Bugünün Randevuları ({count})")
    } else {
        "Bugünün Randevuları".to_string()
    };
    state
        .today_appointments_item
        .set_text(text)
        .map_err(|err| format!("tray menü metni güncellenemedi: {err}"))
}
