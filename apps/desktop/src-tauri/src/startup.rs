//! Windows/macOS/Linux oturum açılışı ve tek örnek başlangıç davranışı.
//!
//! Otomatik başlangıç yalnız cihaz kasasında en az bir kayıtlı hesap varken
//! etkinleştirilir. İşletim sistemi tarafından başlatılan süreç pencereyi önce
//! gizli kurar; web tarafı hafif besin kataloğunu hazırladığında
//! `complete_startup_launch` ile gösterir. İkinci bir masaüstü kısayolu ise
//! single-instance callback'i üzerinden doğrudan mevcut pencereyi öne getirir.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, State};
use tauri_plugin_autostart::ManagerExt;

pub const AUTOSTART_HIDDEN_ARG: &str = "--autostart-hidden";

pub struct StartupLaunchState {
    pending: AtomicBool,
}

impl StartupLaunchState {
    pub fn new(pending: bool) -> Self {
        Self {
            pending: AtomicBool::new(pending),
        }
    }

    pub fn is_pending(&self) -> bool {
        self.pending.load(Ordering::Acquire)
    }
}

pub fn is_autostart_argument<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .any(|argument| argument.as_ref() == AUTOSTART_HIDDEN_ARG)
}

pub fn set_enabled_for_saved_profiles(app: &AppHandle, has_saved_profiles: bool) {
    // Geliştirme ikilisini Windows başlangıcına kaydetmeyelim. Kurulu release
    // uygulamasında bu değer false olur.
    if tauri::is_dev() {
        return;
    }

    let manager = app.autolaunch();
    let currently_enabled = match manager.is_enabled() {
        Ok(value) => value,
        Err(error) => {
            eprintln!("[ogun-desktop] otomatik başlangıç durumu okunamadı: {error}");
            return;
        }
    };

    let result = match (has_saved_profiles, currently_enabled) {
        (true, false) => manager.enable(),
        (false, true) => manager.disable(),
        _ => Ok(()),
    };
    if let Err(error) = result {
        eprintln!("[ogun-desktop] otomatik başlangıç güncellenemedi: {error}");
    }
}

#[tauri::command]
pub fn is_autostart_launch(state: State<'_, StartupLaunchState>) -> bool {
    state.is_pending()
}

#[tauri::command]
pub fn complete_startup_launch(app: AppHandle, state: State<'_, StartupLaunchState>) {
    if state.pending.swap(false, Ordering::AcqRel) {
        crate::window_ops::focus_main_window(&app);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_only_the_dedicated_autostart_argument() {
        assert!(is_autostart_argument(["ogun-desktop.exe", AUTOSTART_HIDDEN_ARG]));
        assert!(!is_autostart_argument(["ogun-desktop.exe", "--other"]));
    }

    #[test]
    fn startup_state_is_pending_only_when_requested() {
        assert!(StartupLaunchState::new(true).is_pending());
        assert!(!StartupLaunchState::new(false).is_pending());
    }
}
