#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;

use tauri::generate_handler;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .invoke_handler(generate_handler![
            commands::execute_command,
            commands::get_current_directory,
            commands::change_directory
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let _window = app.get_webview_window("main").unwrap();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}