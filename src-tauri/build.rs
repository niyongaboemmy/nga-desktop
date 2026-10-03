fn main() {
    // Every app command needs an explicit permission (granted to the local
    // shell webview only in capabilities/shell.json). Remote NGA pages get none.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "shell_info",
            "open_app",
            "set_insets",
            "set_covered",
            "reload_active",
            "go_back",
            "go_forward",
            "print_active",
            "open_active_in_browser",
            "show_downloads",
            "sign_out",
            "reset_profile",
            "notices_list",
            "notices_summary",
            "notices_open",
            "notices_read_all",
            "notices_clear",
            "navigate_app",
            "set_window_theme",
            "popup_menu",
            "os_permission",
            "os_permission_request",
            "os_open_settings",
            "os_test_banner",
            "focus_session",
            // Granted to the NGA web pages at runtime (lib.rs grant_bridge), not to the shell.
            "web_notify",
            "web_badge",
            "web_print",
            "web_theme",
        ]),
    ))
    .expect("failed to run tauri-build");
    println!("cargo:rerun-if-env-changed=NGA_ENV");
    println!("cargo:rerun-if-env-changed=NGA_UPDATER_PUBKEY");
}
