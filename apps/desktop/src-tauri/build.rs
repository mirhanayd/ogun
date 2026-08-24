fn main() {
    // The packaged app serves its UI from a loopback Next.js sidecar. Tauri
    // treats that page as remote content, so every custom command must have an
    // explicit generated permission before a remote capability can grant it.
    let app_manifest = tauri_build::AppManifest::new().commands(&[
        "store_session_token",
        "load_session_token",
        "clear_session_token",
        "list_offline_profiles",
        "upsert_offline_profile",
        "remove_active_offline_profile",
        "configure_offline_pin",
        "unlock_offline_profile",
        "lock_offline_profile",
        "get_unlocked_offline_workspace",
        "save_offline_workspace",
        "save_offline_plan_draft",
        "queue_offline_mutation",
        "load_pending_offline_mutations",
        "acknowledge_offline_mutations",
        "desktop_network_available",
        "show_offline_workspace",
        "notify_frontend_ready",
        "show_native_notification",
        "control_main_window",
        "focus_main_window_command",
        "get_minimize_to_tray_setting",
        "set_minimize_to_tray_setting",
        "update_tray_today_appointments_summary",
        "is_autostart_launch",
        "complete_startup_launch",
    ]);

    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(app_manifest))
        .expect("Tauri build yapılandırması üretilemedi")
}
