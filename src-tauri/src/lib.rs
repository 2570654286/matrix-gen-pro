// 引入 commands 模块
mod commands;

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};

fn extract_default_plugin(app: &tauri::App) -> Result<(), String> {
    // 1. Resolve source path (bundled resource or development path)
    let exe_path =
        std::env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;

    let exe_dir = exe_path
        .parent()
        .ok_or("Failed to get executable directory")?;

    // Check if in development mode (target/debug exists)
    let is_dev_mode = exe_dir
        .parent()
        .and_then(|p| p.parent())
        .map_or(false, |project_root| {
            project_root.join("src-tauri").exists() && project_root.join("src").exists()
        });

    let resource_path = if is_dev_mode {
        // Development mode: copy from source
        let project_root = exe_dir.parent().and_then(|p| p.parent()).unwrap();
        project_root
            .join("src-tauri")
            .join("resources")
            .join("default-provider.js")
    } else {
        // Production mode: resolve from bundled resources
        app.path()
            .resolve(
                "resources/default-provider.js",
                tauri::path::BaseDirectory::Resource,
            )
            .map_err(|e| format!("Failed to resolve resource path: {}", e))?
    };

    // Also ensure the source file exists in dev mode
    if is_dev_mode && !resource_path.exists() {
        println!("[PluginExtract] Source file doesn't exist yet in dev mode, skipping copy");
        return Ok(());
    }

    // 2. Resolve target path (user plugins folder)
    let plugins_dir = if is_dev_mode {
        // Development mode: use project root plugins folder
        let project_root = exe_dir.parent().and_then(|p| p.parent()).unwrap();
        project_root.join("plugins")
    } else {
        // Production mode: use executable directory plugins folder
        exe_dir.join("plugins")
    };

    // Ensure plugins dir exists
    if !plugins_dir.exists() {
        fs::create_dir_all(&plugins_dir)
            .map_err(|e| format!("Failed to create plugins directory: {}", e))?;
    }

    let target_path = plugins_dir.join("default-provider.js");

    // 3. Copy/Overwrite logic (always overwrite for official plugin)
    println!("[PluginExtract] Copying from: {:?}", resource_path);
    println!("[PluginExtract] Copying to: {:?}", target_path);

    if resource_path.exists() {
        fs::copy(&resource_path, &target_path)
            .map_err(|e| format!("Failed to copy default plugin: {}", e))?;
        println!("[PluginExtract] Default plugin extracted successfully");
    } else {
        println!(
            "[PluginExtract] Source plugin file not found: {:?}",
            resource_path
        );
        // Don't return error in dev mode if file doesn't exist yet
        if !is_dev_mode {
            return Err(format!("Plugin resource not found: {:?}", resource_path));
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        // HTTP 插件（用于网络请求）
        .plugin(tauri_plugin_http::init())
        // 自动更新插件
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Shell 插件（用于打开链接）
        .plugin(tauri_plugin_shell::init())
        // 对话框插件（用于文件选择）
        .plugin(tauri_plugin_dialog::init())
        // 管理状态（防止并发生成）
        .manage(Mutex::new(false)) // generation_lock: Mutex<bool>
        // 注册所有命令
        .invoke_handler(tauri::generate_handler![
            commands::proxy_http_request,
            commands::download_file,
            commands::upload_file,
            // commands::upload_video_to_oss, // 已迁移到 Supabase Storage
            commands::write_temp_file_binary,
            commands::write_output_file,
            commands::open_output_folder,
            commands::check_for_updates,
            commands::install_update,
            commands::relaunch_app,
            commands::read_file_base64,
            commands::start_file_server,
            commands::save_character_image,
            commands::save_character_image_from_base64,
            commands::load_plugins_raw,
            commands::create_log_monitor_window,
            commands::get_output_path,
            commands::show_in_folder,
            commands::check_generation_lock,
            commands::release_generation_lock,
            commands::execute_powershell_command,
            commands::rename_video_file,
            commands::cache_image
        ])
        .setup(|app| {
            // 在应用启动时清理临时文件
            if let Err(e) = crate::commands::cleanup_temp_files() {
                println!("[Setup] Temp file cleanup failed: {}", e);
            }

            // 自动提取默认插件到用户插件文件夹
            println!("[Setup] Extracting default provider plugin...");
            if let Err(e) = extract_default_plugin(app) {
                println!("[Setup] Failed to extract default plugin: {}", e);
            } else {
                println!("[Setup] Default plugin extracted successfully");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
