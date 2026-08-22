//! Custom titlebar window controls.
//!
//! The web UI is shared with the browser build, but the frameless Tauri window
//! needs operating-system window actions. Keeping those actions behind one
//! narrow command avoids relying on webview window ACL calls for the buttons
//! and drag surface.

use tauri::WebviewWindow;

#[tauri::command]
pub fn control_main_window(window: WebviewWindow, action: String) -> Result<bool, String> {
    match action.as_str() {
        "isMaximized" => {}
        "startDragging" => window
            .start_dragging()
            .map_err(|err| format!("pencere sürükleme başlatılamadı: {err}"))?,
        "minimize" => window
            .minimize()
            .map_err(|err| format!("pencere küçültülemedi: {err}"))?,
        "toggleMaximize" => {
            let maximized = window
                .is_maximized()
                .map_err(|err| format!("pencere durumu okunamadı: {err}"))?;
            if maximized {
                window
                    .unmaximize()
                    .map_err(|err| format!("pencere önceki boyutuna döndürülemedi: {err}"))?;
            } else {
                window
                    .maximize()
                    .map_err(|err| format!("pencere büyütülemedi: {err}"))?;
            }
        }
        "close" => {
            window
                .close()
                .map_err(|err| format!("pencere kapatılamadı: {err}"))?;
            return Ok(false);
        }
        _ => return Err(format!("bilinmeyen pencere eylemi: {action}")),
    }

    window
        .is_maximized()
        .map_err(|err| format!("pencere durumu okunamadı: {err}"))
}
