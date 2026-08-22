use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::oneshot;
use std::collections::HashMap;
use std::io::{BufRead, Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

mod database;

type SharedMutex<T> = tokio::sync::Mutex<T>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSegment {
    pub id: i32,
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    pub video_id: String,
    pub title: String,
    pub channel: Option<String>,
    pub duration: Option<f64>,
    pub language: Option<String>,
    pub source: String,
    pub segments: Vec<TranscriptSegment>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WorkerMessage {
    #[serde(rename = "progress")]
    Progress {
        stage: String,
        progress: f64,
        #[serde(default)]
        extra: Option<serde_json::Value>,
    },
    #[serde(rename = "result")]
    Result {
        data: serde_json::Value,
    },
    #[serde(rename = "error")]
    Error {
        message: String,
    },
}

pub struct WorkerState {
    pub child: Option<Child>,
    pub cancel_tx: Option<oneshot::Sender<()>>,
}

impl Default for WorkerState {
    fn default() -> Self {
        Self {
            child: None,
            cancel_tx: None,
        }
    }
}

#[tauri::command]
async fn test_worker(app: AppHandle) -> Result<String, String> {
    let worker_path = get_worker_path(&app)?;
    let python_path = get_python_path(&app);
    
    let mut child = Command::new(&python_path)
        .arg(&worker_path)
        .arg("--mode")
        .arg("test")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start worker: {}", e))?;

    let mut stdin = child.stdin.take().ok_or("Failed to open stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("[worker stderr] {}", line);
        }
    });

    let msg = serde_json::json!({
        "action": "test",
        "message": "hello"
    });

    stdin
        .write_all(format!("{}\n", msg).as_bytes())
        .await
        .map_err(|e| format!("Failed to write to stdin: {}", e))?;
    stdin
        .shutdown()
        .await
        .map_err(|e| format!("Failed to close stdin: {}", e))?;

    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    loop {
        if let Some(line) = lines
            .next_line()
            .await
            .map_err(|e| format!("Failed to read output: {}", e))?
        {
            let msg: WorkerMessage =
                serde_json::from_str(&line).map_err(|e| format!("Invalid response: {}", e))?;
            match msg {
                WorkerMessage::Result { data } => {
                    child.wait().await.ok();
                    return Ok(data["message"]
                        .as_str()
                        .unwrap_or("Worker responded")
                        .to_string());
                }
                WorkerMessage::Error { message } => {
                    child.wait().await.ok();
                    return Err(message);
                }
                WorkerMessage::Progress { .. } => {
                    continue;
                }
            }
        } else {
            break;
        }
    }

    child.wait().await.ok();
    Err("No response from worker".to_string())
}

#[tauri::command]
async fn get_video_info(app: AppHandle, url: String) -> Result<serde_json::Value, String> {
    let worker_path = get_worker_path(&app)?;
    let python_path = get_python_path(&app);

    let mut child = Command::new(&python_path)
        .arg(&worker_path)
        .arg("--mode")
        .arg("worker")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start worker: {}", e))?;

    let mut stdin = child.stdin.take().ok_or("Failed to open stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("[worker stderr] {}", line);
        }
    });

    let msg = serde_json::json!({
        "action": "get_video_info",
        "url": url,
    });

    stdin
        .write_all(format!("{}\n", msg).as_bytes())
        .await
        .map_err(|e| format!("Failed to write to stdin: {}", e))?;
    stdin
        .shutdown()
        .await
        .map_err(|e| format!("Failed to close stdin: {}", e))?;

    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    loop {
        if let Some(line) = lines
            .next_line()
            .await
            .map_err(|e| format!("Failed to read output: {}", e))?
        {
            let msg: WorkerMessage =
                serde_json::from_str(&line).map_err(|e| format!("Invalid response: {}", e))?;
            match msg {
                WorkerMessage::Result { data } => {
                    child.wait().await.ok();
                    return Ok(data);
                }
                WorkerMessage::Error { message } => {
                    child.wait().await.ok();
                    return Err(message);
                }
                WorkerMessage::Progress { .. } => {
                    continue;
                }
            }
        } else {
            break;
        }
    }

    child.wait().await.ok();
    Err("No response from worker".to_string())
}

#[tauri::command]
async fn get_captions(
    app: AppHandle,
    url: String,
    language: Option<String>,
) -> Result<serde_json::Value, String> {
    let worker_path = get_worker_path(&app)?;
    let python_path = get_python_path(&app);

    let mut child = Command::new(&python_path)
        .arg(&worker_path)
        .arg("--mode")
        .arg("worker")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start worker: {}", e))?;

    let mut stdin = child.stdin.take().ok_or("Failed to open stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("[worker stderr] {}", line);
        }
    });

    let msg = serde_json::json!({
        "action": "get_captions",
        "url": url,
        "language": language.unwrap_or_else(|| "auto".to_string()),
    });

    stdin
        .write_all(format!("{}\n", msg).as_bytes())
        .await
        .map_err(|e| format!("Failed to write to stdin: {}", e))?;
    stdin
        .shutdown()
        .await
        .map_err(|e| format!("Failed to close stdin: {}", e))?;

    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    loop {
        if let Some(line) = lines
            .next_line()
            .await
            .map_err(|e| format!("Failed to read output: {}", e))?
        {
            let msg: WorkerMessage =
                serde_json::from_str(&line).map_err(|e| format!("Invalid response: {}", e))?;
            match msg {
                WorkerMessage::Result { data } => {
                    child.wait().await.ok();
                    return Ok(data);
                }
                WorkerMessage::Error { message } => {
                    child.wait().await.ok();
                    return Err(message);
                }
                WorkerMessage::Progress { .. } => {
                    continue;
                }
            }
        } else {
            break;
        }
    }

    child.wait().await.ok();
    Err("No response from worker".to_string())
}

fn extract_video_id(url: &str) -> Option<String> {
    if let Some(pos) = url.find("v=") {
        let start = pos + 2;
        let end = url[start..].find('&').map(|i| start + i).unwrap_or(url.len());
        let id = &url[start..end];
        if !id.is_empty() {
            return Some(id.to_string());
        }
    }
    if let Some(pos) = url.find("youtu.be/") {
        let start = pos + 9;
        let end = url[start..].find('?').map(|i| start + i).unwrap_or(url.len());
        let id = &url[start..end];
        if !id.is_empty() {
            return Some(id.to_string());
        }
    }
    None
}

#[tauri::command]
async fn transcribe(
    app: AppHandle,
    url: String,
    model: Option<String>,
    language: Option<String>,
    job_id: Option<String>,
) -> Result<(), String> {
    eprintln!("[transcribe] CALLED url={}", url);

    let worker_path = get_worker_path(&app).map_err(|e| {
        eprintln!("[transcribe] worker not found: {}", e);
        e
    })?;
    let python_path = get_python_path(&app);
    eprintln!("[transcribe] worker={}, python={}", worker_path, python_path);

    let mut child = Command::new(&python_path)
        .arg(&worker_path)
        .arg("--mode")
        .arg("worker")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            eprintln!("[transcribe] Failed to start worker: {}", e);
            format!("Failed to start worker: {}", e)
        })?;

    eprintln!("[transcribe] Worker started");

    let mut stdin = child.stdin.take().ok_or("Failed to open stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();

    {
        let state = app.state::<SharedMutex<WorkerState>>();
        let mut st = state.lock().await;
        if let Some(ref mut prev_child) = st.child {
            eprintln!("[transcribe] killing previous worker");
            prev_child.kill().await.ok();
        }
        st.child = Some(child);
        st.cancel_tx = Some(cancel_tx);
    }

    let msg = serde_json::json!({
        "action": "transcribe",
        "url": url,
        "model": model.unwrap_or_else(|| "small".to_string()),
        "language": language.unwrap_or_else(|| "auto".to_string()),
        "jobId": job_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
    });

    stdin
        .write_all(format!("{}\n", msg).as_bytes())
        .await
        .map_err(|e| format!("Failed to write to stdin: {}", e))?;
    stdin
        .shutdown()
        .await
        .map_err(|e| format!("Failed to close stdin: {}", e))?;
    eprintln!("[transcribe] Message sent to worker");

    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();
    eprintln!("[transcribe] stdout reader created");

    let app_clone = app.clone();
    tokio::spawn(async move {
        let mut lines = tokio::io::BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("[worker stderr] {}", line);
        }
        eprintln!("[transcribe] stderr reader finished");
    });

    eprintln!("[transcribe] entering read loop");
    loop {
        tokio::select! {
            _ = &mut cancel_rx => {
                let state = app.state::<SharedMutex<WorkerState>>();
                let mut state = state.lock().await;
                if let Some(ref mut child) = state.child {
                    child.kill().await.ok();
                }
                state.child = None;
                state.cancel_tx = None;
                app.emit("transcription-cancelled", ()).ok();
                return Ok(());
            }
            line = tokio::time::timeout(std::time::Duration::from_secs(60), lines.next_line()) => {
                match line {
                    Ok(Ok(Some(line))) => {
                        eprintln!("[worker stdout] {}", line);
                        match serde_json::from_str::<WorkerMessage>(&line) {
                            Ok(msg) => {
                                match &msg {
                                    WorkerMessage::Progress { stage, progress, extra } => {
                                        let mut payload = serde_json::json!({
                                            "stage": stage,
                                            "progress": progress
                                        });
                                        if let Some(e) = extra {
                                            payload["extra"] = e.clone();
                                        }
                                        app_clone.emit("transcription-progress", payload).ok();
                                    }
                                    WorkerMessage::Result { data } => {
                                        let video_id = extract_video_id(&url)
                                            .unwrap_or_default();

                                        let inner = data.get("data").cloned().unwrap_or(data.clone());

                                        let transcript = serde_json::json!({
                                            "videoId": video_id,
                                            "title": inner.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                                            "source": "whisper",
                                            "language": inner.get("language").and_then(|v| v.as_str()).unwrap_or(""),
                                            "segments": inner.get("segments").cloned().unwrap_or(serde_json::json!([])),
                                            "text": inner.get("text").and_then(|v| v.as_str()).unwrap_or(""),
                                        });

                                        app_clone.emit("transcription-result", transcript).ok();
                                        return Ok(());
                                    }
                                    WorkerMessage::Error { message } => {
                                        app_clone.emit("transcription-error", message.clone()).ok();
                                        return Ok(());
                                    }
                                }
                            }
                            Err(e) => {
                                eprintln!("Failed to parse worker message: {} - raw: {}", e, line);
                            }
                        }
                    }
                    Ok(Ok(None)) => {
                        eprintln!("[worker] stdout closed, worker exited");
                        break;
                    }
                    Ok(Err(e)) => {
                        return Err(format!("Error reading worker output: {}", e));
                    }
                    Err(_timeout) => {
                        eprintln!("[worker] No output for 60s, worker may be stuck");
                    }
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
async fn cancel_transcription(app: AppHandle) -> Result<(), String> {
    let state = app.state::<SharedMutex<WorkerState>>();
    let mut state = state.lock().await;

    if let Some(tx) = state.cancel_tx.take() {
        tx.send(()).ok();
    }

    if let Some(ref mut child) = state.child {
        child.kill().await.ok();
    }

    state.child = None;
    app.emit("transcription-cancelled", ()).ok();
    Ok(())
}

#[tauri::command]
async fn get_settings(app: AppHandle) -> Result<serde_json::Value, String> {
    let settings_path = get_settings_path(&app)?;

    if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        let settings: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings: {}", e))?;
        Ok(settings)
    } else {
        Ok(serde_json::json!({
            "model": "small",
            "language": "auto"
        }))
    }
}

#[tauri::command]
async fn save_settings(app: AppHandle, settings: serde_json::Value) -> Result<(), String> {
    let settings_path = get_settings_path(&app)?;

    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create settings directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&settings_path, content)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn check_model_downloaded(app: AppHandle, model: String) -> Result<bool, String> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir
            .join("worker/models/whisper-cpp")
            .join(format!("ggml-{}.bin", model));
        if bundled.exists() {
            return Ok(true);
        }
    }
    let user = if cfg!(target_os = "windows") {
        let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(base)
            .join("YouTube Transcript/models/whisper-cpp")
    } else {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home)
            .join("Library/Application Support/YouTube Transcript/models/whisper-cpp")
    };
    Ok(user.join(format!("ggml-{}.bin", model)).exists())
}

#[tauri::command]
async fn export_transcript(
    app: AppHandle,
    transcript: Transcript,
    format: String,
) -> Result<String, String> {
    let content = match format.as_str() {
        "txt" => export_as_txt(&transcript),
        "srt" => export_as_srt(&transcript),
        "json" => serde_json::to_string_pretty(&transcript)
            .map_err(|e| format!("Failed to serialize: {}", e))?,
        _ => return Err(format!("Unsupported format: {}", format)),
    };

    let window = app.get_webview_window("main").ok_or("No main window")?;

    let safe_title: String = transcript.title
        .chars()
        .map(|c| if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') { '_' } else { c })
        .collect();
    let safe_title = safe_title.trim().trim_matches('.').to_string();
    let safe_title = if safe_title.is_empty() { "transcript".to_string() } else { safe_title };

    let dialog = rfd::AsyncFileDialog::new()
        .set_title("Save Transcript")
        .set_parent(&window)
        .set_file_name(&format!(
            "{}.{}",
            safe_title,
            if format == "json" { "json" } else { &format }
        ))
        .save_file()
        .await;

    if let Some(file) = dialog {
        std::fs::write(file.path(), content).map_err(|e| format!("Failed to write file: {}", e))?;
        Ok("Exported successfully".to_string())
    } else {
        Err("Export cancelled".to_string())
    }
}

fn export_as_txt(transcript: &Transcript) -> String {
    let mut result = format!("{}\n\n", transcript.title);
    for seg in &transcript.segments {
        let timestamp = format_timestamp(seg.start);
        result.push_str(&format!("{}\n{}\n\n", timestamp, seg.text));
    }
    result
}

fn export_as_srt(transcript: &Transcript) -> String {
    let mut result = String::new();
    for (i, seg) in transcript.segments.iter().enumerate() {
        let start = format_srt_time(seg.start);
        let end = format_srt_time(seg.end);
        result.push_str(&format!("{}\n{} --> {}\n{}\n\n", i + 1, start, end, seg.text));
    }
    result
}

fn format_timestamp(seconds: f64) -> String {
    let mins = seconds as u32 / 60;
    let secs = seconds as u32 % 60;
    format!("{:02}:{:02}", mins, secs)
}

fn format_srt_time(seconds: f64) -> String {
    let total_ms = (seconds * 1000.0) as u64;
    let hours = total_ms / 3600000;
    let mins = (total_ms % 3600000) / 60000;
    let secs = (total_ms % 60000) / 1000;
    let ms = total_ms % 1000;
    format!("{:02}:{:02}:{:02},{:03}", hours, mins, secs, ms)
}

fn get_worker_path(app: &AppHandle) -> Result<String, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    let worker_path = resource_dir.join("worker/main.py");
    if worker_path.exists() {
        return Ok(worker_path.to_string_lossy().to_string());
    }

    if let Ok(cwd) = std::env::current_dir() {
        let dev_path = cwd.join("worker/main.py");
        if dev_path.exists() {
            return Ok(dev_path.to_string_lossy().to_string());
        }

        let parent_path = cwd.parent().unwrap_or(&cwd).join("worker/main.py");
        if parent_path.exists() {
            return Ok(parent_path.to_string_lossy().to_string());
        }
    }

    Err("Worker not found".to_string())
}

fn get_python_path(app: &AppHandle) -> String {
    let venv_rel = if cfg!(target_os = "windows") {
        "worker/.venv/Scripts/python.exe"
    } else {
        "worker/.venv/bin/python3"
    };

    let resource_dir = app.path().resource_dir().ok();
    if let Some(dir) = resource_dir {
        let venv_python = dir.join(venv_rel);
        if venv_python.exists() {
            return venv_python.to_string_lossy().to_string();
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        let venv_python = cwd.join(venv_rel);
        if venv_python.exists() {
            return venv_python.to_string_lossy().to_string();
        }

        let parent_python = cwd.parent().unwrap_or(&cwd).join(venv_rel);
        if parent_python.exists() {
            return parent_python.to_string_lossy().to_string();
        }
    }

    "python3".to_string()
}

fn get_settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let config_dir = app
        .path()
        .config_dir()
        .map_err(|e| format!("Failed to get config dir: {}", e))?;

    Ok(config_dir.join("settings.json"))
}

fn get_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let config_dir = app
        .path()
        .config_dir()
        .map_err(|e| format!("Failed to get config dir: {}", e))?;

    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;

    Ok(config_dir)
}

struct DatabaseState {
    db: database::Database,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TranscriptionJob {
    stage: String,
    progress: f64,
    result: Option<serde_json::Value>,
    error: Option<String>,
    cancelled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    extra: Option<serde_json::Value>,
}

fn start_http_server(app_handle: AppHandle) {
    let jobs: Arc<Mutex<HashMap<String, TranscriptionJob>>> = Arc::new(Mutex::new(HashMap::new()));

    std::thread::spawn(move || {
        let listener = match TcpListener::bind("127.0.0.1:18923") {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[http] Failed to bind port 18923: {}", e);
                return;
            }
        };

        listener.set_nonblocking(true).ok();
        eprintln!("[http] Server started on http://127.0.0.1:18923");

        loop {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let app = app_handle.clone();
                    let jobs = jobs.clone();
                    std::thread::spawn(move || {
                        handle_tcp_connection(&mut stream, &app, &jobs);
                    });
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(10));
                    continue;
                }
                Err(e) => {
                    eprintln!("[http] Accept error: {}", e);
                }
            }
        }
    });
}

fn handle_tcp_connection(
    stream: &mut std::net::TcpStream,
    app_handle: &AppHandle,
    jobs: &Arc<Mutex<HashMap<String, TranscriptionJob>>>,
) {
    let mut reader = std::io::BufReader::new(stream.try_clone().unwrap());
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() {
        return;
    }

    let parts: Vec<&str> = request_line.trim().split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }

    let method = parts[0];
    let path = parts[1];

    let mut content_length = 0;
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).is_err() {
            return;
        }
        let header = header.trim().to_string();
        if header.is_empty() {
            break;
        }
        if header.to_lowercase().starts_with("content-length:") {
            content_length = header.split(':').nth(1).unwrap_or("0").trim().parse::<usize>().unwrap_or(0);
        }
    }

    let mut body_bytes = vec![0u8; content_length];
    if content_length > 0 {
        if reader.read_exact(&mut body_bytes).is_err() {
            return;
        }
    }
    let body_str = String::from_utf8_lossy(&body_bytes).to_string();

    let response = handle_http_request(path, method, &body_str, app_handle, jobs);

    let status_text = match response.status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        404 => "Not Found",
        _ => "OK",
    };

    let http_response = format!(
        "HTTP/1.1 {} {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
         Access-Control-Allow-Headers: Content-Type\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         \r\n\
         {}",
        response.status,
        status_text,
        response.body.len(),
        response.body,
    );

    stream.write_all(http_response.as_bytes()).ok();
    stream.flush().ok();
}

struct HttpResponse {
    status: u16,
    body: String,
}

fn handle_http_request(
    url: &str,
    method: &str,
    body: &str,
    app_handle: &AppHandle,
    jobs: &Arc<Mutex<HashMap<String, TranscriptionJob>>>,
) -> HttpResponse {
    if method == "OPTIONS" {
        return HttpResponse { status: 204, body: String::new() };
    }

    if url == "/api/health" {
        return HttpResponse {
            status: 200,
            body: serde_json::json!({"status": "ok"}).to_string(),
        };
    }

    if url == "/api/transcribe" && method == "POST" {
        let req: serde_json::Value = match serde_json::from_str(body) {
            Ok(v) => v,
            Err(_) => return HttpResponse { status: 400, body: "{\"error\":\"Invalid JSON\"}".to_string() },
        };

        let video_url = match req["url"].as_str() {
            Some(u) => u.to_string(),
            None => return HttpResponse { status: 400, body: "{\"error\":\"Missing url\"}".to_string() },
        };

        let request_id = uuid::Uuid::new_v4().to_string();
        eprintln!("[http] Transcribe request: url={}, id={}", video_url, request_id);

        // Insert job
        {
            let mut map = jobs.lock().unwrap();
            map.insert(request_id.clone(), TranscriptionJob {
                stage: "preparing".to_string(),
                progress: 0.0,
                result: None,
                error: None,
                cancelled: false,
                extra: None,
            });
        }

        let app = app_handle.clone();
        let rid = request_id.clone();
        let worker = get_worker_path(app_handle).unwrap_or_default();
        let python = get_python_path(app_handle);
        eprintln!("[http] worker={}, python={}", worker, python);
        let jobs_clone = jobs.clone();

        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async move {
                run_http_transcription(&rid, &video_url, &worker, &python, &app, &jobs_clone).await;
            });
        });

        return HttpResponse {
            status: 200,
            body: serde_json::json!({"requestId": request_id}).to_string(),
        };
    }

    if url.starts_with("/api/progress/") && method == "GET" {
        let request_id = url.strip_prefix("/api/progress/").unwrap_or("");
        let rid = request_id.to_string();

        let result = {
            let map = jobs.lock().unwrap();
            map.get(&rid).cloned()
        };

        eprintln!("[http] Progress query: id={}, stage={:?}, progress={:?}", rid, result.as_ref().map(|j| &j.stage), result.as_ref().map(|j| j.progress));

        return match result {
            Some(job) => HttpResponse {
                status: 200,
                body: serde_json::to_string(&serde_json::json!({
                    "stage": job.stage,
                    "progress": job.progress,
                    "result": job.result,
                    "error": job.error,
                })).unwrap_or_default(),
            },
            None => HttpResponse {
                status: 200,
                body: serde_json::json!({"stage": "unknown", "progress": 0}).to_string(),
            },
        };
    }

    if url.starts_with("/api/cancel/") && method == "POST" {
        let request_id = url.strip_prefix("/api/cancel/").unwrap_or("");
        let rid = request_id.to_string();

        {
            let mut map = jobs.lock().unwrap();
            if let Some(job) = map.get_mut(&rid) {
                job.error = Some("Cancelled".to_string());
                job.cancelled = true;
            }
        }

        return HttpResponse {
            status: 200,
            body: "{\"ok\":true}".to_string(),
        };
    }

    HttpResponse { status: 404, body: "{\"error\":\"Not found\"}".to_string() }
}

async fn run_http_transcription(
    request_id: &str,
    url: &str,
    worker_path: &str,
    python_path: &str,
    _app: &AppHandle,
    jobs: &Arc<Mutex<HashMap<String, TranscriptionJob>>>,
) {
    if worker_path.is_empty() {
        eprintln!("[http] Worker not found");
        let mut map = jobs.lock().unwrap();
        if let Some(job) = map.get_mut(request_id) {
            job.error = Some("Worker not found".to_string());
        }
        return;
    }

    let mut child = match Command::new(python_path)
        .arg(worker_path)
        .arg("--mode")
        .arg("worker")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => {
            eprintln!("[http] Worker spawned with pid {}", c.id().map(|p| p.to_string()).unwrap_or_default());
            c
        },
        Err(e) => {
            eprintln!("[http] Failed to start worker: {}", e);
            let mut map = jobs.lock().unwrap();
            if let Some(job) = map.get_mut(request_id) {
                job.error = Some("Failed to start worker".to_string());
            }
            return;
        }
    };

    let mut stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("[http worker] {}", line);
        }
    });

    let msg = serde_json::json!({
        "action": "transcribe",
        "url": url,
        "model": "small",
        "language": "auto",
        "jobId": request_id,
    });

    stdin.write_all(format!("{}\n", msg).as_bytes()).await.ok();
    stdin.shutdown().await.ok();

    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();
    let jobs_clone = jobs.clone();
    let rid = request_id.to_string();

    let result = tokio::time::timeout(std::time::Duration::from_secs(600), async {
        loop {
            tokio::select! {
                line = lines.next_line() => {
                    match line {
                        Ok(Some(line)) => {
                            eprintln!("[http] Worker stdout: {}", line);
                            if let Ok(msg) = serde_json::from_str::<WorkerMessage>(&line) {
                                match msg {
                                    WorkerMessage::Progress { stage, progress, extra } => {
                                        let mut map = jobs_clone.lock().unwrap();
                                        if let Some(job) = map.get_mut(&rid) {
                                            job.stage = stage.clone();
                                            job.progress = progress;
                                            if let Some(e) = extra {
                                                job.extra = Some(e);
                                            }
                                        }
                                    }
                                    WorkerMessage::Result { data } => {
                                        let mut map = jobs_clone.lock().unwrap();
                                        if let Some(job) = map.get_mut(&rid) {
                                            job.stage = "complete".to_string();
                                            job.progress = 100.0;
                                            job.result = Some(data);
                                        }
                                        return Ok(());
                                    }
                                    WorkerMessage::Error { message } => {
                                        let mut map = jobs_clone.lock().unwrap();
                                        if let Some(job) = map.get_mut(&rid) {
                                            job.error = Some(message);
                                        }
                                        return Ok(());
                                    }
                                }
                            }
                        }
                        Ok(None) => break,
                        Err(e) => {
                            eprintln!("[http] Read error: {}", e);
                            break;
                        }
                    }
                }
            }
        }
        Ok::<(), String>(())
    }).await;

    if result.is_err() {
        eprintln!("[http] Transcription timed out after 10 minutes");
        let mut map = jobs.lock().unwrap();
        if let Some(job) = map.get_mut(request_id) {
            job.error = Some("Transcription timed out".to_string());
        }
    }

    child.kill().await.ok();
}

#[tauri::command]
async fn save_transcript(
    app: AppHandle,
    metadata: database::TranscriptMetadata,
    data: database::TranscriptData,
) -> Result<(), String> {
    let state = app.state::<SharedMutex<DatabaseState>>();
    let state = state.lock().await;
    state.db.save_transcript(&metadata, &data)
}

#[tauri::command]
async fn list_transcripts(app: AppHandle) -> Result<Vec<database::TranscriptMetadata>, String> {
    let state = app.state::<SharedMutex<DatabaseState>>();
    let state = state.lock().await;
    state.db.list_transcripts()
}

#[tauri::command]
async fn get_transcript_data(
    app: AppHandle,
    transcript_id: String,
) -> Result<(database::TranscriptMetadata, database::TranscriptData), String> {
    let state = app.state::<SharedMutex<DatabaseState>>();
    let state = state.lock().await;
    state.db.get_transcript(&transcript_id)
}

#[tauri::command]
async fn delete_transcript(app: AppHandle, transcript_id: String) -> Result<(), String> {
    let state = app.state::<SharedMutex<DatabaseState>>();
    let state = state.lock().await;
    state.db.delete_transcript(&transcript_id)
}

#[tauri::command]
async fn search_transcripts(app: AppHandle, query: String) -> Result<Vec<database::TranscriptMetadata>, String> {
    let state = app.state::<SharedMutex<DatabaseState>>();
    let state = state.lock().await;
    state.db.search_transcripts(&query)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SharedMutex::new(WorkerState::default()))
        .setup(|app| {
            let data_dir = get_data_dir(app.handle())?;
            let db = database::Database::new(data_dir)
                .map_err(|e| format!("Failed to initialize database: {}", e))?;
            app.manage(SharedMutex::new(DatabaseState { db }));

            let handle = app.handle().clone();
            start_http_server(handle);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            test_worker,
            get_video_info,
            get_captions,
            transcribe,
            cancel_transcription,
            get_settings,
            save_settings,
            export_transcript,
            check_model_downloaded,
            save_transcript,
            list_transcripts,
            get_transcript_data,
            delete_transcript,
            search_transcripts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
