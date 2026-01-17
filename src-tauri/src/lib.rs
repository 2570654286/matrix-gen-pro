// 引入 commands 模块
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // HTTP 插件（用于网络请求）
        .plugin(tauri_plugin_http::init())
        // 自动更新插件
        .plugin(tauri_plugin_updater::Builder::new().build()) 
        // Shell 插件（用于打开链接）
        .plugin(tauri_plugin_shell::init())
        // 对话框插件（用于文件选择）
        .plugin(tauri_plugin_dialog::init())
        // 注册所有命令
        .invoke_handler(tauri::generate_handler![
            commands::proxy_http_request,
            commands::upload_file,
            // commands::upload_video_to_oss, // 已迁移到 Supabase Storage
            commands::write_temp_file_binary,
            commands::write_output_file,
            commands::check_for_updates,
            commands::install_update,
            commands::relaunch_app,
            commands::read_file_base64,
            commands::start_file_server,
            commands::save_character_image,
            commands::save_character_image_from_base64,
            commands::load_plugins_raw,
            commands::create_log_monitor_window,
            commands::get_output_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
