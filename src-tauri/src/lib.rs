// 引入 commands 模块
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 👇👇👇 必须加上这一行！这就是缺失的“点火器” 👇👇👇
        .plugin(tauri_plugin_updater::Builder::new().build()) 
        // 👆👆👆 没有这一行，JSON 里的配置全是废纸 👆👆👆
        
        .plugin(tauri_plugin_shell::init()) // 你原有的 shell 插件
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
