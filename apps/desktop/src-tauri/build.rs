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
        "desktop_db_info",
        "initialize_local_scope",
        "replace_local_entities",
        "replace_local_workspace",
        "list_local_entities",
        "apply_local_mutation",
        "load_local_outbox",
        "acknowledge_local_outbox",
        "fail_local_outbox_mutation",
        "local_food_catalog_info",
        "replace_local_food_catalog",
        "search_local_foods",
        "get_local_food_entries",
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
