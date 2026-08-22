fn main() {
    // The packaged app serves its UI from a loopback Next.js sidecar. Tauri
    // treats that page as remote content, so every custom command must have an
    // explicit generated permission before a remote capability can grant it.
    let app_manifest = tauri_build::AppManifest::new().commands(&[
        "store_session_token",
        "load_session_token",
        "clear_session_token",
        "notify_frontend_ready",
        "show_native_notification",
        "control_main_window",
        "focus_main_window_command",
        "get_minimize_to_tray_setting",
        "set_minimize_to_tray_setting",
        "update_tray_today_appointments_summary",
    ]);

    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(app_manifest))
        .expect("Tauri build yapılandırması üretilemedi")
}
