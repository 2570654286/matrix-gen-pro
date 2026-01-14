use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::command;
use tauri_plugin_updater::UpdaterExt;
use base64;
use tokio::io::{AsyncWriteExt, AsyncReadExt};

use hmac::{Hmac, Mac};
use sha1::Sha1;
use chrono::Utc;

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
    pub proxy_url: Option<String>, // 代理地址
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
        .timeout(std::time::Duration::from_secs(480))  // 8 分钟超时
        .connect_timeout(std::time::Duration::from_secs(60))  // 1 分钟连接超时
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

    // 添加 Headers
    if let Some(headers) = options.headers {
        for (k, v) in headers {
            builder = builder.header(k, v);
        }
    }

    // 添加 Token (如果存在)
    if let Some(token) = options.token {
        builder = builder.header("Authorization", format!("Bearer {}", token));
    }

    // 添加 Body (如果存在且不是 GET)
    if options.method != "GET" {
        if let Some(body) = options.body {
            builder = builder.json(&body);
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
    let updater = app.updater().map_err(|e| format!("获取更新器失败: {}", e))?;
    let update = updater.check().await
        .map_err(|e| format!("检查更新失败: {}", e))?;
    
    match update {
        Some(update) => {
            // date 是 Option<OffsetDateTime>
            let date_str = update.date
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
    let updater = app.updater().map_err(|e| format!("获取更新器失败: {}", e))?;
    let result = updater.check().await
        .map_err(|e| format!("检查更新失败: {}", e))?;
    
    if let Some(update) = result {
        // 下载并安装更新，传入进度回调和重启回调
        update.download_and_install(
            |_downloaded, _total| {
                // 进度回调，可以在这里更新 UI
            },
            || {
                // 更新完成后重启应用
                std::process::exit(0);
            },
        ).await
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
#[command]
pub async fn read_file_base64(path: String) -> Result<String, String> {
    let content = std::fs::read(&path)
        .map_err(|e| format!("无法读取文件: {}", e))?;
    
    Ok(base64::Engine::encode(&base64::engine::general_purpose::STANDARD, content))
}

// 启动本地 HTTP 服务器提供文件访问
#[command]
pub async fn start_file_server(path: String, port: u16) -> Result<String, String> {
    use tokio::net::TcpListener;
    
    let addr = format!("127.0.0.1:{}", port);
    
    // 创建一个简单的 HTTP 服务器
    let listener = TcpListener::bind(&addr).await
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
                            println!("[FileServer] 请求内容: {}", request.lines().next().unwrap_or(""));
                            
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
    let metadata = std::fs::metadata(&file_path)
        .map_err(|e| format!("无法读取文件: {}", e))?;

    if !metadata.is_file() {
        return Ok(UploadResponse {
            success: false,
            url: None,
            error: Some("指定的路径不是文件".to_string()),
        });
    }

    // 读取文件内容
    let file_content = std::fs::read(&file_path)
        .map_err(|e| format!("无法读取文件: {}", e))?;

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
        .timeout(std::time::Duration::from_secs(120));
    
    // 配置代理
    if let Some(proxy_url) = &options.proxy_url {
        if !proxy_url.is_empty() {
            println!("[Upload] 使用代理: {}", proxy_url);
            client_builder = client_builder.proxy(reqwest::Proxy::all(proxy_url)
                .map_err(|e| format!("代理配置失败: {}", e))?);
        }
    } else {
        // 尝试从环境变量读取代理
        if let Ok(http_proxy) = std::env::var("HTTP_PROXY") {
            if !http_proxy.is_empty() {
                println!("[Upload] 使用 HTTP_PROXY: {}", http_proxy);
                client_builder = client_builder.proxy(reqwest::Proxy::all(&http_proxy)
                    .map_err(|e| format!("代理配置失败: {}", e))?);
            }
        } else if let Ok(https_proxy) = std::env::var("HTTPS_PROXY") {
            if !https_proxy.is_empty() {
                println!("[Upload] 使用 HTTPS_PROXY: {}", https_proxy);
                client_builder = client_builder.proxy(reqwest::Proxy::all(&https_proxy)
                    .map_err(|e| format!("代理配置失败: {}", e))?);
            }
        }
    }
    
    let client = client_builder.build()
        .map_err(|e| e.to_string())?;
    
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
                            let url = json.get("url")
                                .or(json.get("data"))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                            
                            if let Some(url) = url {
                                return Ok(UploadResponse { success: true, url: Some(url), error: None });
                            } else {
                                return Ok(UploadResponse { 
                                    success: false, 
                                    url: None, 
                                    error: Some(format!("JSON 响应中未找到 URL: {}", json)) 
                                });
                            }
                        },
                        _ => {
                            // 直接返回 URL 文本
                            let response_text = response.text().await.map_err(|e| e.to_string())?;
                            if response_text.starts_with("https://") || response_text.starts_with("http://") {
                                return Ok(UploadResponse { 
                                    success: true, 
                                    url: Some(response_text.trim().to_string()), 
                                    error: None 
                                });
                            } else {
                                return Ok(UploadResponse { 
                                    success: false, 
                                    url: None, 
                                    error: Some(response_text) 
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

// 写入临时文件（用于 ffmpeg.wasm 生成的视频）
#[command]
pub async fn write_temp_file_binary(file_name: String, data: String) -> Result<String, String> {
    let cache_dir = std::env::temp_dir().join("matrix-gen");
    
    // 确保目录存在
    if let Err(e) = std::fs::create_dir_all(&cache_dir) {
        println!("[TempFile] 创建目录失败: {}", e);
        return Err(format!("无法创建缓存目录: {}", e));
    }
    
    let file_path = cache_dir.join(&file_name);
    let file_path_str = file_path.to_string_lossy().to_string();
    
    println!("[TempFile] 准备写入文件: {}, 数据长度: {}", file_path_str, data.len());
    
    // 解码 base64
    let decoded_data = match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &data) {
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
    let file_size = std::fs::metadata(&file_path)
        .map(|m| m.len())
        .unwrap_or(0);
    
    println!("[TempFile] 临时文件创建成功: {}, 大小: {} bytes", file_path_str, file_size);
    
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
pub async fn save_character_image(options: SaveCharacterImageOptions) -> Result<SaveCharacterImageResponse, String> {
    let source_path = options.source_path;
    let character_id = options.character_id;

    println!("[CharacterImage] 保存角色图片: {} -> {}", source_path, character_id);

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
            println!("[CharacterImage] 图片保存成功: {} ({} bytes)", relative_path, bytes);
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
pub async fn save_character_image_from_base64(options: SaveCharacterImageFromBase64Options) -> Result<SaveCharacterImageResponse, String> {
    let base64_data = options.base64_data;
    let character_id = options.character_id;
    let mime_type = options.mime_type;

    println!("[CharacterImage] 保存 base64 图片: {} ({} bytes)", character_id, base64_data.len());

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
    let image_data = match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &base64_data) {
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
            println!("[CharacterImage] 图片保存成功: {} ({} bytes)", relative_path, image_data.len());
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

// 阿里云 OSS 上传功能已迁移到 Supabase Storage，前端直接使用 Supabase SDK

