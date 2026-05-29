use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use serde::Serialize;

const MODELS_DIR: &str = "models";

#[derive(Clone, Serialize)]
pub struct DownloadProgress {
    pub id: i64,
    pub progress: u8,
    pub message: String,
}

pub(crate) struct ModelEntry {
    name: &'static str,
    url: &'static str,
    filename: &'static str,
}

const MODEL_REGISTRY: &[ModelEntry] = &[
    ModelEntry {
        name: "bria-rmbg-1.4",
        url: "https://storage.mouktar.com/db-backups/models/briaai-RMBG-1.4.onnx",
        filename: "briaai-RMBG-1.4.onnx",
    },
    ModelEntry {
        name: "realesrgan-x2",
        url: "https://storage.mouktar.com/db-backups/models/swin2SR-classicalx2.onnx",
        filename: "swin2SR-classicalx2.onnx",
    },
    ModelEntry {
        name: "realesrgan-x4",
        url: "https://storage.mouktar.com/db-backups/models/swin2SR-realworldx4.onnx",
        filename: "swin2SR-realworldx4.onnx",
    },
];

pub fn get_cache_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(MODELS_DIR)
}

pub fn find_model(name: &str) -> Option<&'static ModelEntry> {
    MODEL_REGISTRY.iter().find(|m| m.name == name)
}


pub fn check_downloaded(app: &AppHandle, name: &str) -> Result<(PathBuf, i64), String> {
    let entry = find_model(name).ok_or_else(|| format!("Unknown model: {}", name))?;
    let path = get_cache_dir(app).join(entry.filename);
    if path.exists() {
        let size = fs::metadata(&path).map(|m| m.len() as i64).unwrap_or(0);
        Ok((path, size))
    } else {
        Err(format!("Model '{}' not found at {:?}", name, path))
    }
}

#[derive(Clone, Serialize)]
pub struct ModelStatus {
    pub name: String,
    pub downloaded: bool,
    pub path: String,
    pub size: Option<i64>,
}

pub fn get_status(app: &AppHandle, name: String) -> ModelStatus {
    let entry = match find_model(&name) {
        Some(e) => e,
        None => {
            return ModelStatus {
                name,
                downloaded: false,
                path: String::new(),
                size: None,
            };
        }
    };
    let path = get_cache_dir(app).join(entry.filename);
    if path.exists() {
        let size = fs::metadata(&path).ok().map(|m| m.len() as i64);
        ModelStatus {
            name,
            downloaded: true,
            path: path.to_string_lossy().to_string(),
            size,
        }
    } else {
        ModelStatus {
            name,
            downloaded: false,
            path: String::new(),
            size: None,
        }
    }
}

pub fn download_model_blocking(
    app: &AppHandle,
    name: &str,
    event_name: &str,
) -> Result<PathBuf, String> {
    let entry = find_model(name).ok_or_else(|| format!("Unknown model: {}", name))?;

    let cache_dir = get_cache_dir(app);
    fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create models directory: {}", e))?;

    let target_path = cache_dir.join(entry.filename);
    let temp_path = cache_dir.join(format!("{}.tmp", entry.filename));
    let _ = fs::remove_file(&temp_path);

    let _ = app.emit(
        event_name,
        DownloadProgress {
            id: 0,
            progress: 0,
            message: "Connecting...".to_string(),
        },
    );

    let client = reqwest::blocking::Client::new();
    let mut response = client
        .get(entry.url)
        .send()
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "HTTP {} error downloading {}",
            response.status(),
            entry.url
        ));
    }

    let total = response.content_length().unwrap_or(0);

    let _ = app.emit(
        event_name,
        DownloadProgress {
            id: 0,
            progress: 5,
            message: "Downloading model...".to_string(),
        },
    );

    let mut file = fs::File::create(&temp_path)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    let mut downloaded: u64 = 0;
    let mut last_pct: u8 = 0;
    let mut buffer = [0u8; 65536];

    loop {
        let n = response
            .read(&mut buffer)
            .map_err(|e| format!("Read error: {}", e))?;
        if n == 0 {
            break;
        }
        file.write_all(&buffer[..n])
            .map_err(|e| format!("Write error: {}", e))?;
        downloaded += n as u64;

        let pct = if total > 0 {
            ((downloaded as f64 / total as f64) * 100.0).round() as u8
        } else {
            0
        };
        if pct >= last_pct + 5 || downloaded >= total {
            last_pct = pct;
            let _ = app.emit(
                event_name,
                DownloadProgress {
                    id: 0,
                    progress: pct.min(99),
                    message: format!("Downloading... {}%", pct),
                },
            );
        }
    }

    file.sync_all()
        .map_err(|e| format!("Failed to sync file: {}", e))?;
    drop(file);

    if total > 0 {
        let actual = fs::metadata(&temp_path).map(|m| m.len()).unwrap_or(0);
        if actual != total {
            let _ = fs::remove_file(&temp_path);
            return Err(format!(
                "Download incomplete: expected {} bytes, got {} bytes",
                total, actual
            ));
        }
    }

    let _ = fs::remove_file(&target_path);
    fs::rename(&temp_path, &target_path)
        .map_err(|e| format!("Failed to rename temp file: {}", e))?;

    let _ = app.emit(
        event_name,
        DownloadProgress {
            id: 0,
            progress: 100,
            message: "Download complete".to_string(),
        },
    );

    Ok(target_path)
}
