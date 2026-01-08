use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tauri::command;

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
}

// 文件上传响应
#[derive(Debug, Serialize)]
pub struct UploadResponse {
    pub success: bool,
    pub url: Option<String>,
    pub error: Option<String>,
}

// 核心指令：代理 HTTP 请求
#[command]
pub async fn proxy_http_request(options: RequestOptions) -> Result<ApiResponse, String> {
    let client = reqwest::Client::new();

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

    // 解析返回的 JSON
    let data: Value = response.json().await.map_err(|e| e.to_string())?;

    Ok(ApiResponse { status, data })
}

// Catbox 文件上传指令
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

    // 获取文件名 (复制一份)
    let file_name: String = std::path::Path::new(&file_path)
        .file_name()
        .and_then(|n| n.to_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "file.mp4".to_string());

    // 发送上传请求到 Catbox
    let client = reqwest::Client::new();
    
    // 构建 multipart 请求
    let part = reqwest::multipart::Part::bytes(file_content)
        .file_name(file_name.clone())
        .mime_str("video/mp4")
        .map_err(|e| e.to_string())?;
    
    let multipart_form = reqwest::multipart::Form::new()
        .text("reqtype", "fileupload")
        .part(options.field_name, part);

    let response = client
        .post(&options.upload_url)
        .multipart(multipart_form)
        .send()
        .await
        .map_err(|e| format!("上传请求失败: {}", e))?;

    let status = response.status();
    let response_text = response.text().await.map_err(|e| e.to_string())?;

    if status.is_success() {
        // Catbox 成功返回的是 URL
        if response_text.starts_with("https://") || response_text.starts_with("http://") {
            Ok(UploadResponse {
                success: true,
                url: Some(response_text),
                error: None,
            })
        } else {
            Ok(UploadResponse {
                success: false,
                url: None,
                error: Some(response_text),
            })
        }
    } else {
        Ok(UploadResponse {
            success: false,
            url: None,
            error: Some(format!("上传失败 ({}): {}", status, response_text)),
        })
    }
}
