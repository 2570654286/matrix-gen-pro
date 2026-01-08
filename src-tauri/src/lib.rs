// 引入 commands 模块
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::proxy_http_request,
            commands::upload_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
