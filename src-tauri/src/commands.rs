use base64;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{command, Manager, State};
use tauri_plugin_updater::UpdaterExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use chrono::Utc;
use hmac::{Hmac, Mac};
use sha1::Sha1;

// 定义前端传过来的数据结构
#[derive(Debug, Deserialize)]
pub struct RequestOptions {
    method: String,
    url: String,
    headers: Option<HashMap<String, String>>,
    body: Option<Value>,
    token: Option<String>,
}

// 定义返回给前端的数据结构
#[derive(Debug, Serialize)]
pub struct ApiResponse {
    status: u16,
    data: Value,
}

// 文件上传选项
#[derive(Debug, Deserialize)]
pub struct UploadOptions {
    pub file_path: String,
    pub upload_url: String,
    pub field_name: String,
    pub response_format: Option<String>, // "url" 或 "json"
    pub proxy_url: Option<String>,       // 代理地址
}

// 文件上传响应
#[derive(Debug, Serialize)]
pub struct UploadResponse {
    pub success: bool,
    pub url: Option<String>,
    pub error: Option<String>,
}

// 更新检查响应
#[derive(Debug, Serialize)]
pub struct UpdateCheckResponse {
    pub should_update: bool,
    pub manifest: Option<UpdateManifest>,
}

#[derive(Debug, Serialize)]
pub struct UpdateManifest {
    pub version: String,
    pub body: String,
    pub date: String,
}

// 核心指令：代理 HTTP 请求
#[command]
pub async fn proxy_http_request(options: RequestOptions) -> Result<ApiResponse, String> {
    // 创建客户端，设置 8 分钟超时
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(480)) // 8 分钟请求超时
        .connect_timeout(std::time::Duration::from_secs(300)) // 5 分钟连接超时
        .build()
        .map_err(|e| e.to_string())?;

    // 构建请求
    let mut builder = match options.method.as_str() {
        "GET" => client.get(&options.url),
        "POST" => client.post(&options.url),
        "PUT" => client.put(&options.url),
        "DELETE" => client.delete(&options.url),
        _ => return Err(format!("不支持的请求方法: {}", options.method)),
    };

    // Check for multipart flag and add headers
    let is_multipart = if let Some(ref headers) = options.headers {
        headers
            .get("x-use-multipart")
            .or(headers.get("X-Use-Multipart"))
            .map(|v| v == "true")
            .unwrap_or(false)
    } else {
        false
    };

    // Add headers, skipping the multipart flag
    if let Some(ref headers) = options.headers {
        for (k, v) in headers.clone() {
            if !k.to_lowercase().starts_with("x-use-multipart") {
                builder = builder.header(k, v);
            }
        }
    }

    // 添加 Token (如果存在)
    if let Some(token) = options.token {
        builder = builder.header("Authorization", format!("Bearer {}", token));
    }

    // 添加 Body (如果存在且不是 GET)
    if options.method != "GET" {
        if let Some(body) = options.body {
            if is_multipart {
                // Handle multipart/form-data
                if let serde_json::Value::Object(map) = body {
                    let mut form = reqwest::multipart::Form::new();
                    for (key, value) in map {
                        if let serde_json::Value::String(s) = value {
                            form = form.text(key, s);
                        } else {
                            // For non-string values, convert to string
                            form = form.text(key, value.to_string());
                        }
                    }
                    builder = builder.multipart(form);
                } else {
                    // Fallback to JSON if not object
                    builder = builder.json(&body);
                }
            } else {
                // Default to JSON
                builder = builder.json(&body);
            }
        }
    }

    // 发送请求 (await)
    let response = builder.send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();

    // 先尝试获取文本，然后再尝试 JSON 解析
    let response_text = response.text().await.unwrap_or_default();

    // 尝试解析 JSON
    let data: Value = match serde_json::from_str(&response_text) {
        Ok(json) => json,
        Err(_) => {
            println!("[API] 非 JSON 响应: {}", response_text);
            // 返回一个带有原始文本的 JSON 对象
            serde_json::json!({ "raw_response": response_text, "status": status })
        }
    };

    Ok(ApiResponse { status, data })
}

// 检查更新指令 - Tauri v2 API
#[command]
pub async fn check_for_updates(app: tauri::AppHandle) -> Result<UpdateCheckResponse, String> {
    // 使用 Tauri v2 内置的 updater API
    let updater = app
        .updater()
        .map_err(|e| format!("获取更新器失败: {}", e))?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("检查更新失败: {}", e))?;

    match update {
        Some(update) => {
            // date 是 Option<OffsetDateTime>
            let date_str = update
                .date
                .map(|d| d.to_string())
                .unwrap_or_else(|| String::from("unknown"));
            Ok(UpdateCheckResponse {
                should_update: true,
                manifest: Some(UpdateManifest {
                    version: update.version,
                    body: update.body.unwrap_or_default(),
                    date: date_str,
                }),
            })
        }
        None => Ok(UpdateCheckResponse {
            should_update: false,
            manifest: None,
        }),
    }
}

// 安装更新指令 - Tauri v2 API
#[command]
pub async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    // 下载并安装更新
    let updater = app
        .updater()
        .map_err(|e| format!("获取更新器失败: {}", e))?;
    let result = updater
        .check()
        .await
        .map_err(|e| format!("检查更新失败: {}", e))?;

    if let Some(update) = result {
        // 下载并安装更新，传入进度回调和重启回调
        update
            .download_and_install(
                |_downloaded, _total| {
                    // 进度回调，可以在这里更新 UI
                },
                || {
                    // 更新完成后重启应用
                    std::process::exit(0);
                },
            )
            .await
            .map_err(|e| format!("安装更新失败: {}", e))?;
    }

    Ok(())
}

// 重启应用指令
#[command]
pub async fn relaunch_app() {
    std::process::exit(0);
}

// 读取文件为 base64（用于前端上传）
#[derive(Debug, Deserialize)]
pub struct ReadFileBase64Options {
    pub path: String,
}

#[command]
pub async fn read_file_base64(options: ReadFileBase64Options) -> Result<String, String> {
    let content = std::fs::read(&options.path).map_err(|e| format!("无法读取文件: {}", e))?;

    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        content,
    ))
}

// 启动本地 HTTP 服务器提供文件访问
#[command]
pub async fn start_file_server(path: String, port: u16) -> Result<String, String> {
    use tokio::net::TcpListener;

    let addr = format!("127.0.0.1:{}", port);

    // 创建一个简单的 HTTP 服务器
    let listener = TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("无法启动服务器: {}", e))?;

    println!("[FileServer] 已在 {} 启动文件服务器", addr);

    // 在后台任务中处理请求
    let path_clone = path.clone();
    tokio::spawn(async move {
        loop {
            if let Ok((mut stream, addr)) = listener.accept().await {
                println!("[FileServer] 收到来自 {} 的请求", addr);

                let file_path = path_clone.clone();
                tokio::spawn(async move {
                    let mut buffer = [0u8; 1024];
                    if let Ok(n) = stream.read(&mut buffer).await {
                        if n > 0 {
                            let request = String::from_utf8_lossy(&buffer[..n]);
                            println!(
                                "[FileServer] 请求内容: {}",
                                request.lines().next().unwrap_or("")
                            );

                            // 读取文件并返回
                            if let Ok(content) = std::fs::read(&file_path) {
                                let header = format!(
                                    "HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\n\r\n",
                                    content.len()
                                );

                                if let Ok(_) = stream.write_all(header.as_bytes()).await {
                                    let _ = stream.write_all(&content).await;
                                }
                            } else {
                                let response = "HTTP/1.1 404 Not Found\r\n\r\n";
                                let _ = stream.write_all(response.as_bytes()).await;
                            }
                        }
                    }
                });
            }
        }
    });

    Ok(format!("http://127.0.0.1:{}", port))
}

// 文件上传指令 - 支持多种图床和代理
#[command]
pub async fn upload_file(options: UploadOptions) -> Result<UploadResponse, String> {
    // 检查文件是否存在
    let file_path = options.file_path.clone();
    let metadata = std::fs::metadata(&file_path).map_err(|e| format!("无法读取文件: {}", e))?;

    if !metadata.is_file() {
        return Ok(UploadResponse {
            success: false,
            url: None,
            error: Some("指定的路径不是文件".to_string()),
        });
    }

    // 读取文件内容
    let file_content = std::fs::read(&file_path).map_err(|e| format!("无法读取文件: {}", e))?;

    // 获取文件名
    let file_name: String = std::path::Path::new(&file_path)
        .file_name()
        .and_then(|n| n.to_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "file.mp4".to_string());

    // 获取文件扩展名来确定 MIME 类型
    let mime_type = match std::path::Path::new(&file_name)
        .extension()
        .and_then(|e| e.to_str())
    {
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        Some("avi") => "video/x-msvideo",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        _ => "application/octet-stream",
    };

    // 创建 HTTP 客户端_builder
    let mut client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(480)) // 8 分钟请求超时
        .connect_timeout(std::time::Duration::from_secs(300)); // 5 分钟连接超时

    // 配置代理
    if let Some(proxy_url) = &options.proxy_url {
        if !proxy_url.is_empty() {
            println!("[Upload] 使用代理: {}", proxy_url);
            client_builder = client_builder
                .proxy(reqwest::Proxy::all(proxy_url).map_err(|e| format!("代理配置失败: {}", e))?);
        }
    } else {
        // 尝试从环境变量读取代理
        if let Ok(http_proxy) = std::env::var("HTTP_PROXY") {
            if !http_proxy.is_empty() {
                println!("[Upload] 使用 HTTP_PROXY: {}", http_proxy);
                client_builder = client_builder.proxy(
                    reqwest::Proxy::all(&http_proxy).map_err(|e| format!("代理配置失败: {}", e))?,
                );
            }
        } else if let Ok(https_proxy) = std::env::var("HTTPS_PROXY") {
            if !https_proxy.is_empty() {
                println!("[Upload] 使用 HTTPS_PROXY: {}", https_proxy);
                client_builder = client_builder.proxy(
                    reqwest::Proxy::all(&https_proxy)
                        .map_err(|e| format!("代理配置失败: {}", e))?,
                );
            }
        }
    }

    let client = client_builder.build().map_err(|e| e.to_string())?;

    let max_retries = 3;
    let mut last_error = String::new();

    // 根据上传 URL 判断图床类型
    let response_format = options.response_format.as_deref().unwrap_or("url");

    for attempt in 1..=max_retries {
        // 构建 multipart 请求
        let part = reqwest::multipart::Part::bytes(file_content.clone())
            .file_name(file_name.clone())
            .mime_str(mime_type)
            .map_err(|e| e.to_string())?;

        let multipart_form = reqwest::multipart::Form::new()
            .text("reqtype", "fileupload")
            .part(options.field_name.clone(), part);

        match client
            .post(&options.upload_url)
            .multipart(multipart_form)
            .send()
            .await
        {
            Ok(response) => {
                let status = response.status();

                if status.is_success() {
                    match response_format {
                        "json" => {
                            // JSON 响应格式
                            let json: Value = response.json().await.map_err(|e| e.to_string())?;
                            // 尝试从常见的 JSON 字段提取 URL
                            let url = json
                                .get("url")
                                .or(json.get("data"))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());

                            if let Some(url) = url {
                                return Ok(UploadResponse {
                                    success: true,
                                    url: Some(url),
                                    error: None,
                                });
                            } else {
                                return Ok(UploadResponse {
                                    success: false,
                                    url: None,
                                    error: Some(format!("JSON 响应中未找到 URL: {}", json)),
                                });
                            }
                        }
                        _ => {
                            // 直接返回 URL 文本
                            let response_text = response.text().await.map_err(|e| e.to_string())?;
                            if response_text.starts_with("https://")
                                || response_text.starts_with("http://")
                            {
                                return Ok(UploadResponse {
                                    success: true,
                                    url: Some(response_text.trim().to_string()),
                                    error: None,
                                });
                            } else {
                                return Ok(UploadResponse {
                                    success: false,
                                    url: None,
                                    error: Some(response_text),
                                });
                            }
                        }
                    }
                } else {
                    let response_text = response.text().await.unwrap_or_default();
                    last_error = format!("上传失败 ({}): {}", status, response_text);
                }
            }
            Err(e) => {
                last_error = format!("上传请求失败 (尝试 {}/{}): {}", attempt, max_retries, e);
                if attempt < max_retries {
                    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                }
            }
        }
    }

    Ok(UploadResponse {
        success: false,
        url: None,
        error: Some(last_error),
    })
}

// 写入输出文件（用于视频和图像生成结果）
// 注意：由于配置为 currentUser 安装模式，应用安装在 C:\Users\Name\AppData\Local\Programs\MatrixGenPro\
// std::env::current_exe() 将指向该路径，您可以安全地写入相对于此路径的文件
#[derive(Debug, Deserialize)]
pub struct WriteOutputFileOptions {
    pub file_name: String,
    pub data: String,
    pub media_type: String, // "video" 或 "image"
}

#[command]
pub async fn write_output_file(
    app: tauri::AppHandle,
    options: WriteOutputFileOptions,
) -> Result<String, String> {
    let WriteOutputFileOptions {
        file_name,
        data,
        media_type,
    } = options;

    // 使用系统标准目录，避免触发Tauri热重载
    let output_dir = match app.path().video_dir() {
        Ok(video_dir) => {
            println!("[OutputFile] 使用系统视频目录: {:?}", video_dir);
            video_dir.join("MatrixGen_Output")
        }
        Err(e) => {
            println!(
                "[OutputFile] 获取系统视频目录失败: {}, 使用临时目录作为fallback",
                e
            );
            std::env::temp_dir().join("MatrixGen_Output")
        }
    };

    // 确保目录存在
    if let Err(e) = std::fs::create_dir_all(&output_dir) {
        println!("[OutputFile] 创建目录失败: {}", e);
        return Err(format!("无法创建输出目录: {}", e));
    }

    let file_path = output_dir.join(&file_name);
    let file_path_str = file_path.to_string_lossy().to_string();

    println!(
        "[OutputFile] 准备写入文件: {}, 数据长度: {}",
        file_path_str,
        data.len()
    );

    // 返回绝对路径供前端使用convertFileSrc转换
    let absolute_path = file_path
        .canonicalize()
        .unwrap_or(file_path.clone())
        .to_string_lossy()
        .to_string();

    // 解码 base64
    let decoded_data =
        match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &data) {
            Ok(d) => d,
            Err(e) => {
                println!("[OutputFile] base64 解码失败: {}", e);
                return Err(format!("base64 解码失败: {}", e));
            }
        };

    println!("[OutputFile] 解码后数据长度: {}", decoded_data.len());

    // 写入文件
    if let Err(e) = std::fs::write(&file_path, &decoded_data) {
        println!("[OutputFile] 写入文件失败: {}", e);
        return Err(format!("无法写入文件: {}", e));
    }

    // 验证文件是否存在
    if !file_path.exists() {
        println!("[OutputFile] 文件写入后不存在: {}", file_path_str);
        return Err("文件写入后不存在".to_string());
    }

    // 获取文件大小
    let file_size = std::fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0);

    println!(
        "[OutputFile] 输出文件创建成功: {}, 大小: {} bytes",
        absolute_path, file_size
    );

    Ok(absolute_path)
}

// 保留旧的临时文件函数以保持兼容性
#[command]
pub async fn write_temp_file_binary(file_name: String, data: String) -> Result<String, String> {
    let cache_dir = std::env::temp_dir().join("matrix-gen").join("temp");

    // 确保目录存在
    if let Err(e) = std::fs::create_dir_all(&cache_dir) {
        println!("[TempFile] 创建目录失败: {}", e);
        return Err(format!("无法创建缓存目录: {}", e));
    }

    let file_path = cache_dir.join(&file_name);
    let file_path_str = file_path.to_string_lossy().to_string();

    println!(
        "[TempFile] 准备写入文件: {}, 数据长度: {}",
        file_path_str,
        data.len()
    );

    // 解码 base64
    let decoded_data =
        match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &data) {
            Ok(d) => d,
            Err(e) => {
                println!("[TempFile] base64 解码失败: {}", e);
                return Err(format!("base64 解码失败: {}", e));
            }
        };

    println!("[TempFile] 解码后数据长度: {}", decoded_data.len());

    // 写入文件
    if let Err(e) = std::fs::write(&file_path, &decoded_data) {
        println!("[TempFile] 写入文件失败: {}", e);
        return Err(format!("无法写入文件: {}", e));
    }

    // 验证文件是否存在
    if !file_path.exists() {
        println!("[TempFile] 文件写入后不存在: {}", file_path_str);
        return Err("文件写入后不存在".to_string());
    }

    // 获取文件大小
    let file_size = std::fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0);

    println!(
        "[TempFile] 临时文件创建成功: {}, 大小: {} bytes",
        file_path_str, file_size
    );

    Ok(file_path_str)
}

// 角色图片保存选项
#[derive(Debug, Deserialize)]
pub struct SaveCharacterImageOptions {
    pub source_path: String,
    pub character_id: String,
}

// 角色图片保存响应
#[derive(Debug, Serialize)]
pub struct SaveCharacterImageResponse {
    pub success: bool,
    pub path: Option<String>,
    pub error: Option<String>,
}

// 保存角色图片到应用数据目录
#[command]
pub async fn save_character_image(
    options: SaveCharacterImageOptions,
) -> Result<SaveCharacterImageResponse, String> {
    let source_path = options.source_path;
    let character_id = options.character_id;

    println!(
        "[CharacterImage] 保存角色图片: {} -> {}",
        source_path, character_id
    );

    // 获取应用数据目录
    let data_dir = match std::env::current_dir() {
        Ok(dir) => {
            // 如果在开发环境，使用项目目录下的 data 目录
            let data_dir = dir.join("data").join("characters").join(&character_id);
            data_dir
        }
        Err(e) => {
            println!("[CharacterImage] 获取目录失败: {}", e);
            return Err(format!("获取目录失败: {}", e));
        }
    };

    // 创建目录
    if let Err(e) = std::fs::create_dir_all(&data_dir) {
        println!("[CharacterImage] 创建目录失败: {}", e);
        return Err(format!("创建目录失败: {}", e));
    }

    // 获取源文件名
    let file_name = std::path::Path::new(&source_path)
        .file_name()
        .and_then(|n| n.to_str().map(|s| s.to_string()))
        .unwrap_or_else(|| format!("{}.jpg", character_id));

    // 目标路径
    let target_path = data_dir.join(&file_name);
    let relative_path = format!("data/characters/{}/{}", character_id, file_name);

    // 复制文件
    match std::fs::copy(&source_path, &target_path) {
        Ok(bytes) => {
            println!(
                "[CharacterImage] 图片保存成功: {} ({} bytes)",
                relative_path, bytes
            );
            Ok(SaveCharacterImageResponse {
                success: true,
                path: Some(relative_path),
                error: None,
            })
        }
        Err(e) => {
            println!("[CharacterImage] 复制文件失败: {}", e);
            Ok(SaveCharacterImageResponse {
                success: false,
                path: None,
                error: Some(format!("复制文件失败: {}", e)),
            })
        }
    }
}

// 保存 base64 数据为角色图片
#[derive(Debug, Deserialize)]
pub struct SaveCharacterImageFromBase64Options {
    pub base64_data: String,
    pub character_id: String,
    pub mime_type: String,
}

#[command]
pub async fn save_character_image_from_base64(
    options: SaveCharacterImageFromBase64Options,
) -> Result<SaveCharacterImageResponse, String> {
    let base64_data = options.base64_data;
    let character_id = options.character_id;
    let mime_type = options.mime_type;

    println!(
        "[CharacterImage] 保存 base64 图片: {} ({} bytes)",
        character_id,
        base64_data.len()
    );

    // 保存到项目根目录的 characters 文件夹
    let data_dir = match std::env::current_dir() {
        Ok(dir) => {
            let data_dir = dir.join("characters").join(&character_id);
            data_dir
        }
        Err(e) => {
            println!("[CharacterImage] 获取目录失败: {}", e);
            return Err(format!("获取目录失败: {}", e));
        }
    };

    // 创建目录
    if let Err(e) = std::fs::create_dir_all(&data_dir) {
        println!("[CharacterImage] 创建目录失败: {}", e);
        return Err(format!("创建目录失败: {}", e));
    }

    // 解码 base64
    let image_data =
        match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &base64_data) {
            Ok(data) => data,
            Err(e) => {
                println!("[CharacterImage] base64 解码失败: {}", e);
                return Err(format!("base64 解码失败: {}", e));
            }
        };

    // 获取文件扩展名
    let extension = match mime_type.as_str() {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/jpg" => "jpg",
        "image/webp" => "webp",
        _ => "png",
    };

    let file_name = format!("character_preview_{}.{}", character_id, extension);
    let target_path = data_dir.join(&file_name);
    let relative_path = format!("characters/{}/{}", character_id, file_name);

    // 写入文件
    match std::fs::write(&target_path, &image_data) {
        Ok(_) => {
            println!(
                "[CharacterImage] 图片保存成功: {} ({} bytes)",
                relative_path,
                image_data.len()
            );
            Ok(SaveCharacterImageResponse {
                success: true,
                path: Some(relative_path),
                error: None,
            })
        }
        Err(e) => {
            println!("[CharacterImage] 写入文件失败: {}", e);
            Ok(SaveCharacterImageResponse {
                success: false,
                path: None,
                error: Some(format!("写入文件失败: {}", e)),
            })
        }
    }
}

// 加载外部插件文件
#[command]
pub async fn load_plugins_raw(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    // 获取可执行文件所在目录
    let exe_path = std::env::current_exe().map_err(|e| format!("无法获取可执行文件路径: {}", e))?;
    let exe_dir = exe_path.parent().ok_or("无法获取可执行文件所在目录")?;

    // 插件目录路径：先按 Resource 或 fallback 得到初始路径
    // exe_dir 在开发模式下为 …/src-tauri/target/debug，往上一级再上一级再上一级 = 项目根
    let project_root = exe_dir
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent());

    let mut plugins_dir = match app.path().resolve("plugins/", tauri::path::BaseDirectory::Resource) {
        Ok(resource_path) => {
            println!("[PluginLoader] Resource 解析到: {:?}", resource_path);
            resource_path
        }
        Err(e) => {
            println!("[PluginLoader] Resource 解析失败: {}, 使用 fallback", e);
            let is_dev = project_root.map_or(false, |r| {
                r.join("src-tauri").exists() && r.join("src").exists()
            });
            if is_dev {
                let root = project_root.unwrap();
                let st = root.join("src-tauri").join("plugins");
                if st.exists() {
                    st
                } else {
                    std::env::current_dir()
                        .map_err(|e| format!("无法获取当前目录: {}", e))?
                        .join("plugins")
                }
            } else {
                exe_dir.join("plugins")
            }
        }
    };

    // 开发模式覆盖：Resource 在 dev 下常指向 target/debug/plugins，该目录可能缺 zhichuang 等
    // 若存在 项目根/src-tauri/plugins，则直接使用源码目录，确保加载到全部插件
    if let Some(root) = project_root {
        let src_tauri_plugins = root.join("src-tauri").join("plugins");
        if src_tauri_plugins.exists() {
            println!("[PluginLoader] 开发模式：使用源码 src-tauri/plugins（含 zhichuang 等）");
            plugins_dir = src_tauri_plugins;
        }
    }

    println!("[PluginLoader] 插件目录路径: {}", plugins_dir.display());

    // 创建插件目录（如果不存在）
    if !plugins_dir.exists() {
        std::fs::create_dir_all(&plugins_dir).map_err(|e| format!("无法创建插件目录: {}", e))?;
        println!("[PluginLoader] 创建了插件目录: {}", plugins_dir.display());
    }

    // 读取插件目录中的所有 .js 文件
    let mut plugin_contents = Vec::new();
    let entries =
        std::fs::read_dir(&plugins_dir).map_err(|e| format!("无法读取插件目录: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录条目失败: {}", e))?;
        let path = entry.path();

        // 检查是否为 .js 文件
        if path.is_file() && path.extension().and_then(|ext| ext.to_str()) == Some("js") {
            println!("[PluginLoader] 发现插件文件: {}", path.display());
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("读取插件文件 {} 失败: {}", path.display(), e))?;
            plugin_contents.push(content);
        }
    }

    println!(
        "[PluginLoader] 共加载了 {} 个插件文件",
        plugin_contents.len()
    );
    Ok(plugin_contents)
}

// 获取输出目录路径
#[command]
pub fn get_output_path() -> Result<String, String> {
    let current_dir = std::env::current_dir().map_err(|e| format!("获取当前目录失败: {}", e))?;

    // Normalize path separators for cross-platform compatibility
    let output_path = current_dir.to_string_lossy().to_string().replace('\\', "/");
    Ok(output_path)
}

// 创建日志监视器窗口
#[command]
pub async fn create_log_monitor_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::webview::WebviewWindowBuilder;

    // 检查窗口是否已经存在
    if let Some(window) = app.get_webview_window("log-monitor") {
        // 窗口已存在，确保显示并聚焦到前台
        window
            .unminimize()
            .map_err(|e| format!("Failed to unminimize log monitor window: {}", e))?;
        window
            .show()
            .map_err(|e| format!("Failed to show log monitor window: {}", e))?;
        window
            .set_focus()
            .map_err(|e| format!("Failed to focus log monitor window: {}", e))?;
        println!("[LogMonitor] 窗口已存在，已显示到前台");
        return Ok(());
    }

    // 窗口不存在，创建新窗口
    let window = WebviewWindowBuilder::new(
        &app,
        "log-monitor",
        tauri::WebviewUrl::App("/log-monitor".into()),
    )
    .title("MatrixGen Pro - Console")
    .inner_size(800.0, 600.0)
    .resizable(true)
    .always_on_top(false)
    .position(100.0, 100.0)
    .decorations(true)
    .transparent(false)
    .build()
    .map_err(|e| format!("Failed to create log monitor window: {}", e))?;

    println!("[LogMonitor] 创建了新的日志监视器窗口");
    Ok(())
}

// 阿里云 OSS 上传功能已迁移到 Supabase Storage，前端直接使用 Supabase SDK

// 清理目录的辅助函数
fn cleanup_directory(
    dir: &std::path::Path,
    deleted_count: &mut u64,
    total_size: &mut u64,
) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }

    for entry in std::fs::read_dir(dir).map_err(|e| format!("Unable to read directory: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            // 递归清理子目录
            cleanup_directory(&path, deleted_count, total_size)?;
            // 删除空目录
            if let Err(e) = std::fs::remove_dir(&path) {
                println!(
                    "[Cleanup] Failed to remove directory {}: {}",
                    path.display(),
                    e
                );
            } else {
                *deleted_count += 1;
            }
        } else {
            // 删除文件
            if let Ok(metadata) = std::fs::metadata(&path) {
                *total_size += metadata.len();
            }
            if let Err(e) = std::fs::remove_file(&path) {
                println!("[Cleanup] Failed to remove file {}: {}", path.display(), e);
            } else {
                *deleted_count += 1;
            }
        }
    }

    Ok(())
}

// 清理临时文件的函数
pub fn cleanup_temp_files() -> Result<(), String> {
    println!("[Cleanup] Starting temp file cleanup...");

    // 获取临时目录
    let temp_dir = std::env::temp_dir().join("matrix-gen");

    // 如果临时目录不存在，直接返回
    if !temp_dir.exists() {
        println!("[Cleanup] Temp directory doesn't exist, skipping cleanup");
        return Ok(());
    }

    let mut deleted_count = 0;
    let mut total_size = 0u64;

    // 清理主临时目录
    cleanup_directory(&temp_dir, &mut deleted_count, &mut total_size)?;

    // 清理专用 temp 子目录（如果存在）
    let temp_subdir = temp_dir.join("temp");
    if temp_subdir.exists() {
        cleanup_directory(&temp_subdir, &mut deleted_count, &mut total_size)?;
    }

    println!(
        "[Cleanup] Cleanup completed: removed {} items, total size {} bytes",
        deleted_count, total_size
    );
    Ok(())
}

// 在文件管理器中打开文件夹并选中文件
#[command]
pub async fn show_in_folder(path: String) -> Result<(), String> {
    // Log the attempt
    println!("[Rust] Attempting to open path: {}", path);

    #[cfg(target_os = "windows")]
    {
        // Windows trick: "explorer /select, path" opens the folder AND highlights the file
        // If it's just a folder, just "explorer path"
        let path_obj = std::path::Path::new(&path);
        if path_obj.is_file() {
            std::process::Command::new("explorer")
                .args(["/select,", &path]) // Comma is important for /select
                .spawn()
                .map_err(|e| format!("Failed to open file in explorer: {}", e))?;
        } else {
            std::process::Command::new("explorer")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open folder in explorer: {}", e))?;
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Fallback for Mac/Linux (just open it)
        open::that(&path).map_err(|e| format!("Failed to open path: {}", e))?;
    }

    Ok(())
}

// 检查生成锁（允许并发生成）
#[command]
pub fn check_generation_lock(_state: State<'_, Mutex<bool>>) -> Result<bool, String> {
    // 允许并发，总是返回 true
    Ok(true)
}

// 释放生成锁（无操作，因为没有锁定）
#[command]
pub fn release_generation_lock(_state: State<'_, Mutex<bool>>) -> Result<(), String> {
    // 无操作，允许并发
    Ok(())
}

// 下载文件到本地临时目录
#[command]
pub async fn download_file(url: String, file_name: String) -> Result<String, String> {
    let cache_dir = std::env::temp_dir().join("matrix-gen").join("temp");

    // 确保目录存在
    if let Err(e) = std::fs::create_dir_all(&cache_dir) {
        println!("[Download] 创建缓存目录失败: {}", e);
        return Err(format!("无法创建缓存目录: {}", e));
    }

    let file_path = cache_dir.join(&file_name);
    let file_path_str = file_path.to_string_lossy().to_string();

    println!("[Download] 开始下载到临时文件: {}", file_path_str);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(480)) // 8 分钟请求超时
        .connect_timeout(std::time::Duration::from_secs(300)) // 5 分钟连接超时
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to download file: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    let content = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    std::fs::write(&file_path, &content).map_err(|e| format!("Failed to write file: {}", e))?;

    println!(
        "[Download] 文件下载成功: {} ({} bytes)",
        file_path_str,
        content.len()
    );

    Ok(file_path_str)
}

// 执行 PowerShell 命令（用于声音通知）
#[command]
pub async fn execute_powershell_command(command: String) -> Result<(), String> {
    use std::process::Command;

    let output = Command::new("powershell")
        .arg("-c")
        .arg(&command)
        .output()
        .map_err(|e| format!("Failed to execute PowerShell command: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("PowerShell command failed: {}", stderr))
    }
}

// 打开输出文件夹
#[command]
pub fn open_output_folder(app: tauri::AppHandle) -> Result<(), String> {
    // 获取输出目录路径（与write_output_file使用相同的逻辑）
    let output_dir = match app.path().video_dir() {
        Ok(video_dir) => {
            println!("[OpenFolder] 使用系统视频目录: {:?}", video_dir);
            video_dir.join("MatrixGen_Output")
        }
        Err(e) => {
            println!(
                "[OpenFolder] 获取系统视频目录失败: {}, 使用临时目录作为fallback",
                e
            );
            std::env::temp_dir().join("MatrixGen_Output")
        }
    };

    // 确保目录存在
    if let Err(e) = std::fs::create_dir_all(&output_dir) {
        println!("[OpenFolder] 创建目录失败: {}", e);
        return Err(format!("无法创建输出目录: {}", e));
    }

    let output_path = output_dir.to_string_lossy().to_string();
    println!("[OpenFolder] 打开输出文件夹: {}", output_path);

    // 在文件管理器中打开文件夹
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&output_path)
            .spawn()
            .map_err(|e| format!("Failed to open folder in explorer: {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        open::that(&output_path).map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    Ok(())
}

// 缓存远程图像到本地（用于绕过WebView跟踪预防）
#[derive(Debug, Deserialize)]
pub struct CacheImageOptions {
    pub url: String,
    pub file_name: String,
}

#[derive(Debug, Serialize)]
pub struct CacheImageResponse {
    pub success: bool,
    pub local_path: Option<String>,
    pub error: Option<String>,
}

#[command]
pub async fn cache_image(options: CacheImageOptions) -> Result<CacheImageResponse, String> {
    let CacheImageOptions { url, file_name } = options;

    println!("[CacheImage] 开始缓存图像: {} -> {}", url, file_name);

    let cache_dir = std::env::temp_dir().join("matrix-gen").join("images");

    // 确保目录存在
    if let Err(e) = std::fs::create_dir_all(&cache_dir) {
        println!("[CacheImage] 创建缓存目录失败: {}", e);
        return Err(format!("无法创建缓存目录: {}", e));
    }

    let file_path = cache_dir.join(&file_name);
    let file_path_str = file_path.to_string_lossy().to_string();

    println!("[CacheImage] 目标路径: {}", file_path_str);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120)) // 2分钟超时足够下载图像
        .connect_timeout(std::time::Duration::from_secs(60)) // 1分钟连接超时
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to download image: {}", e))?;

    if !response.status().is_success() {
        return Ok(CacheImageResponse {
            success: false,
            local_path: None,
            error: Some(format!("Download failed with status: {}", response.status())),
        });
    }

    let content = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    std::fs::write(&file_path, &content).map_err(|e| format!("Failed to write image file: {}", e))?;

    println!(
        "[CacheImage] 图像缓存成功: {} ({} bytes)",
        file_path_str,
        content.len()
    );

    Ok(CacheImageResponse {
        success: true,
        local_path: Some(file_path_str),
        error: None,
    })
}

// 重命名视频文件
#[command]
pub fn rename_video_file(old_path: String, new_base_name: String) -> Result<String, String> {
    println!("[RenameVideo] 重命名文件: {} -> {}", old_path, new_base_name);

    let old_path_obj = std::path::Path::new(&old_path);

    // 获取父目录
    let parent_dir = old_path_obj.parent().ok_or("无法获取父目录")?;

    // 获取原始扩展名
    let extension = old_path_obj
        .extension()
        .and_then(|ext| ext.to_str())
        .ok_or("无法获取文件扩展名")?;

    // 清理输入：如果用户输入了扩展名，移除它
    let clean_name = if new_base_name.to_lowercase().ends_with(&format!(".{}", extension.to_lowercase())) {
        &new_base_name[..new_base_name.len() - extension.len() - 1] // -1 for the dot
    } else {
        &new_base_name
    };

    // 构造新文件名（确保不重复扩展名）
    let new_file_name = format!("{}.{}", clean_name, extension);

    // 构造新路径
    let new_full_path = parent_dir.join(new_file_name);

    // 检查新文件名是否已存在（排除当前文件本身）
    if new_full_path.exists() {
        // 规范化路径进行比较，确保正确判断是否为同一文件
        let old_path_canonical = old_path_obj.canonicalize().unwrap_or_else(|_| old_path_obj.to_path_buf());
        let new_path_canonical = new_full_path.canonicalize().unwrap_or_else(|_| new_full_path.clone());
        
        // 如果规范化后的路径不同，说明是另一个文件，报错
        if old_path_canonical != new_path_canonical {
            println!("[RenameVideo] 文件名已存在: {}", new_full_path.to_string_lossy());
            return Err(format!("文件名重复，请换一个名字"));
        }
    }

    // 执行重命名
    std::fs::rename(&old_path, &new_full_path)
        .map_err(|e| format!("重命名失败: {}", e))?;

    let new_path_str = new_full_path.to_string_lossy().to_string();
    println!("[RenameVideo] 重命名成功: {}", new_path_str);

    Ok(new_path_str)
}
