//! Windows/macOS/Linux oturum açılışı ve tek örnek başlangıç davranışı.
//!
//! Otomatik başlangıç yalnız cihaz kasasında en az bir kayıtlı hesap varken
//! etkinleştirilir. İşletim sistemi tarafından başlatılan süreç pencereyi önce
//! gizli kurar; web tarafı hafif besin kataloğunu hazırladığında
//! `complete_startup_launch` ile gösterir. İkinci bir masaüstü kısayolu ise
//! single-instance callback'i üzerinden doğrudan mevcut pencereyi öne getirir.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, State};

#[cfg(windows)]
use winreg::{
    enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE},
    RegKey,
};

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

pub fn set_enabled_for_saved_profiles(_app: &AppHandle, has_saved_profiles: bool) {
    // Geliştirme ikilisini Windows başlangıcına kaydetmeyelim. Kurulu release
    // uygulamasında bu değer false olur.
    if tauri::is_dev() {
        return;
    }

    let result = set_platform_autostart(has_saved_profiles);
    if let Err(error) = result {
        eprintln!("[ogun-desktop] otomatik başlangıç güncellenemedi: {error}");
    }
}

#[cfg(windows)]
fn set_platform_autostart(enabled: bool) -> Result<(), String> {
    const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const VALUE_NAME: &str = "Öğün";

    let current_exe = std::env::current_exe()
        .map_err(|error| format!("uygulama yolu çözülemedi: {error}"))?;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (run_key, _) = hkcu
        .create_subkey_with_flags(RUN_KEY, KEY_READ | KEY_WRITE)
        .map_err(|error| format!("Windows başlangıç anahtarı açılamadı: {error}"))?;

    if enabled {
        let command = format!("\"{}\" {}", current_exe.display(), AUTOSTART_HIDDEN_ARG);
        let existing = run_key.get_value::<String, _>(VALUE_NAME).ok();
        if existing.as_deref() != Some(command.as_str()) {
            run_key
                .set_value(VALUE_NAME, &command)
                .map_err(|error| format!("Windows başlangıç kaydı yazılamadı: {error}"))?;
        }
    } else if let Err(error) = run_key.delete_value(VALUE_NAME) {
        if error.kind() != std::io::ErrorKind::NotFound {
            return Err(format!("Windows başlangıç kaydı kaldırılamadı: {error}"));
        }
    }

    Ok(())
}

#[cfg(not(windows))]
fn set_platform_autostart(_enabled: bool) -> Result<(), String> {
    // İlk yayın hedefi Windows. Diğer masaüstü platformlarında bu işlev,
    // platforma özgü güvenilir başlangıç entegrasyonu eklenene kadar no-op.
    Ok(())
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
