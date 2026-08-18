//! GitHub issue #53 / Prompt 9.3 — pencere yardımcı fonksiyonları.
//!
//! GÖREV 1 (Görünüm menüsü) "Yakınlaştır/Uzaklaştır" için ve tray/bildirim
//! tıklamasının "Uygulamayı aç"/"öne getir" ihtiyacı için ortak, küçük
//! yardımcılar — `menu_actions.rs` (menü + tray tıklamaları) VE
//! `notifications.rs` (bildirim tıklaması, JS tarafından çağrılan
//! `focus_main_window_command` komutu üzerinden) BUNLARI paylaşıyor.

use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const MIN_ZOOM: f64 = 0.5;
const MAX_ZOOM: f64 = 2.0;
const DEFAULT_ZOOM: f64 = 1.0;
const ZOOM_STEP: f64 = 0.1;

/// `WebviewWindow::set_zoom` MUTLAK bir çarpan alır (bkz. Tauri API'si) —
/// "bir adım yakınlaştır" için göreli bir API YOK, bu yüzden şu anki
/// seviyeyi KENDİMİZ, uygulama durumu olarak takip ediyoruz.
pub struct ZoomLevel(Mutex<f64>);

impl Default for ZoomLevel {
    fn default() -> Self {
        Self(Mutex::new(DEFAULT_ZOOM))
    }
}

/// SAF — Tauri çalışma zamanı gerektirmez, bkz. testler.
pub fn clamp_zoom(value: f64) -> f64 {
    value.clamp(MIN_ZOOM, MAX_ZOOM)
}

pub fn adjust_zoom(app: &AppHandle, delta: f64) {
    let state = app.state::<ZoomLevel>();
    let new_level = {
        let mut level = state.0.lock().expect("ZoomLevel mutex zehirlendi");
        *level = clamp_zoom(*level + delta);
        *level
    };
    apply_zoom(app, new_level);
}

pub fn zoom_in(app: &AppHandle) {
    adjust_zoom(app, ZOOM_STEP);
}

pub fn zoom_out(app: &AppHandle) {
    adjust_zoom(app, -ZOOM_STEP);
}

pub fn reset_zoom(app: &AppHandle) {
    let state = app.state::<ZoomLevel>();
    {
        let mut level = state.0.lock().expect("ZoomLevel mutex zehirlendi");
        *level = DEFAULT_ZOOM;
    }
    apply_zoom(app, DEFAULT_ZOOM);
}

fn apply_zoom(app: &AppHandle, level: f64) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if let Err(err) = window.set_zoom(level) {
        eprintln!("[ogun-desktop] zoom uygulanamadı: {err}");
    }
}

/// Tray "Uygulamayı aç" (bkz. menu_actions.rs) VE bildirim tıklaması (bkz.
/// notifications.rs dosya başı notu, `focus_main_window_command` üzerinden
/// JS'ten çağrılır) için paylaşılan yardımcı — pencere GİZLİYKEN (tray'e
/// küçültülmüşken, bkz. lib.rs'teki pencere kapatma engelleyicisi) bile
/// güvenilir şekilde öne getirir.
pub fn focus_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("[ogun-desktop] ana pencere bulunamadı, öne getirilemedi");
        return;
    };
    if let Err(err) = window.show() {
        eprintln!("[ogun-desktop] pencere gösterilemedi: {err}");
    }
    // Simge durumuna küçültülmüşse de geri getir — `show()` sadece
    // tray'e GİZLENMİŞ (hide()) pencereyi geri getirir, OS'un kendi
    // "minimize" durumunu ETKİLEMEZ.
    let _ = window.unminimize();
    if let Err(err) = window.set_focus() {
        eprintln!("[ogun-desktop] pencere odaklanamadı: {err}");
    }
}

/// GitHub issue #53 / Prompt 9.3, GÖREV 3 — bildirime tıklandığında
/// (bkz. notifications.rs dosya başı notu) frontend'in çağırdığı komut:
/// pencere tray'e küçültülmüş/arka planda olsa bile öne getirir. Gerçek
/// navigasyon AYRI olarak JS tarafında (client-side router) yapılır —
/// bu komut SADECE pencereyi görünür/odaklı hale getirir.
#[tauri::command]
pub fn focus_main_window_command(app: AppHandle) {
    focus_main_window(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_zoom_within_bounds() {
        assert_eq!(clamp_zoom(3.0), MAX_ZOOM);
        assert_eq!(clamp_zoom(0.1), MIN_ZOOM);
        assert_eq!(clamp_zoom(1.2), 1.2);
    }

    #[test]
    fn clamp_zoom_is_identity_within_bounds() {
        assert_eq!(clamp_zoom(DEFAULT_ZOOM), DEFAULT_ZOOM);
    }
}
