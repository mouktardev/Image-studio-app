use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use crate::DbState;
use futures::{stream, StreamExt};
use image::{DynamicImage, ImageBuffer};
use ffmpeg_sidecar::ffprobe;
use ffmpeg_sidecar::paths;

use super::background_removal::{apply_bg_removal, create_onnx_session, check_model_downloaded};

const SUPPORTED_VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v", "3gp"];

pub(crate) static FFMPEG_DIR: OnceLock<PathBuf> = OnceLock::new();

pub struct CancelTokens(pub std::sync::Mutex<HashMap<i64, Arc<AtomicBool>>>);

#[derive(Clone, Serialize)]
pub struct VideoBgRemovalProgress {
    pub id: i64,
    pub progress: u8,
    pub message: String,
    pub eta_seconds: Option<f64>,
}

#[derive(Clone, Serialize)]
pub struct VideoImportResult {
    pub imported: i64,
    pub duplicates: i64,
    pub failed: i64,
}

#[derive(Clone, Serialize)]
pub struct VideoBgRemovalResult {
    pub processed: usize,
    pub failed: usize,
    pub cancelled: usize,
}

#[derive(Clone, Serialize)]
pub struct Video {
    pub id: i64,
    pub filename: String,
    pub filepath: String,
    pub mimetype: Option<String>,
    pub size: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub duration: Option<f64>,
    pub fps: Option<f64>,
    pub thumbnail_path: Option<String>,
    pub bg_removed_filepath: Option<String>,
    pub bg_removed_size: Option<i64>,
    pub bg_removed_model: Option<String>,
    pub compressed_filepath: Option<String>,
    pub compressed_size: Option<i64>,
    #[serde(default)]
    pub converted_videos: Vec<ConvertedVideo>,
}

#[derive(Clone, Serialize)]
pub struct ConvertedVideo {
    pub filepath: String,
    pub size: Option<i64>,
    pub format: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct FfmpegStatus {
    pub available: bool,
    pub path: String,
    pub size: Option<i64>,
    pub source: String,
}

fn find_ffmpeg() -> (PathBuf, String) {
    if let Some(dir) = FFMPEG_DIR.get() {
        let our = dir.join("ffmpeg.exe");
        if our.exists() {
            return (our, "sidecar".to_string());
        }
    }

    let sidecar = paths::ffmpeg_path();

    if sidecar.exists() {
        return (sidecar, "sidecar".to_string());
    }

    let mut cmd = Command::new("where");
    cmd.arg("ffmpeg")
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    if let Ok(output) = cmd.output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(first_line) = stdout.lines().next() {
                let found = PathBuf::from(first_line.trim());
                if found.exists() {
                    return (found, "system".to_string());
                }
            }
        }
    }

    (PathBuf::from("ffmpeg"), "none".to_string())
}

fn find_ffprobe() -> (PathBuf, String) {
    if let Some(dir) = FFMPEG_DIR.get() {
        let our = dir.join("ffprobe.exe");
        if our.exists() {
            return (our, "sidecar".to_string());
        }
    }

    let sidecar = ffprobe::ffprobe_path();

    if sidecar.exists() {
        return (sidecar, "sidecar".to_string());
    }

    let mut cmd = Command::new("where");
    cmd.arg("ffprobe")
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    if let Ok(output) = cmd.output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(first_line) = stdout.lines().next() {
                let found = PathBuf::from(first_line.trim());
                if found.exists() {
                    return (found, "system".to_string());
                }
            }
        }
    }

    (PathBuf::from("ffprobe"), "none".to_string())
}

fn get_ffmpeg_path() -> PathBuf {
    let (path, _) = find_ffmpeg();
    path
}

fn get_ffprobe_path() -> PathBuf {
    let (path, _) = find_ffprobe();
    path
}

#[derive(Debug, Serialize, Deserialize)]
struct ProbeStream {
    width: Option<i64>,
    height: Option<i64>,
    codec_type: Option<String>,
    r_frame_rate: Option<String>,
    duration: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProbeFormat {
    duration: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProbeOutput {
    streams: Vec<ProbeStream>,
    format: Option<ProbeFormat>,
}


#[tauri::command]
pub async fn check_ffmpeg_status() -> Result<FfmpegStatus, String> {
    let (ffmpeg_path, ffmpeg_source) = find_ffmpeg();
    let (ffprobe_path, ffprobe_source) = find_ffprobe();

    let ffmpeg_available = ffmpeg_path.exists() && ffmpeg_source != "none";
    let ffprobe_available = ffprobe_path.exists() && ffprobe_source != "none";

    let status = if ffmpeg_available {
        let size = fs::metadata(&ffmpeg_path).map(|m| m.len() as i64).ok();
        let path_str = ffmpeg_path.to_string_lossy().to_string();
        let source = if ffmpeg_available && ffprobe_available {
            if ffmpeg_source == "system" || ffprobe_source == "system" {
                "system".to_string()
            } else {
                ffmpeg_source
            }
        } else if ffmpeg_available {
            ffmpeg_source
        } else {
            ffprobe_source
        };
        FfmpegStatus {
            available: true,
            path: path_str,
            size,
            source,
        }
    } else {
        FfmpegStatus {
            available: false,
            path: String::new(),
            size: None,
            source: "none".to_string(),
        }
    };

    Ok(status)
}

#[tauri::command]
pub async fn download_ffmpeg(app: AppHandle) -> Result<String, String> {
    let ffmpeg_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("ffmpeg");
    std::fs::create_dir_all(&ffmpeg_dir)
        .map_err(|e| format!("Failed to create ffmpeg dir: {}", e))?;
    let _ = FFMPEG_DIR.set(ffmpeg_dir.clone());

    let _ = app.emit("ffmpeg-download-progress", VideoBgRemovalProgress {
        id: 0,
        progress: 0,
        message: "Downloading FFmpeg...".to_string(),
        eta_seconds: None,
    });

    let app_for_blocking = app.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let url = ffmpeg_sidecar::download::ffmpeg_download_url()
            .map_err(|e| format!("Failed to get FFmpeg download URL: {}", e))?;

        let temp_path = ffmpeg_dir.join("ffmpeg-release-essentials.zip");

        let client = reqwest::blocking::Client::new();
        let mut response = client
            .get(url)
            .send()
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("HTTP {} error downloading FFmpeg", response.status()));
        }

        let total = response.content_length().unwrap_or(0);
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
                let _ = app_for_blocking.emit("ffmpeg-download-progress", VideoBgRemovalProgress {
                    id: 0,
                    progress: pct.min(99),
                    message: format!("Downloading... {}%", pct),
                    eta_seconds: None,
                });
            }
        }

        file.sync_all()
            .map_err(|e| format!("Failed to sync file: {}", e))?;
        drop(file);

        let _ = app_for_blocking.emit("ffmpeg-download-progress", VideoBgRemovalProgress {
            id: 0,
            progress: 99,
            message: "Extracting FFmpeg...".to_string(),
            eta_seconds: None,
        });

        ffmpeg_sidecar::download::unpack_ffmpeg(&temp_path, &ffmpeg_dir)
            .map_err(|e| format!("Failed to unpack FFmpeg: {}", e))?;
        let _ = std::fs::remove_file(&temp_path);
        Ok(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    let _ = app.emit("ffmpeg-download-progress", VideoBgRemovalProgress {
        id: 0,
        progress: 100,
        message: "Download complete".to_string(),
        eta_seconds: None,
    });

    let (path, _) = find_ffmpeg();
    Ok(path.to_string_lossy().to_string())
}

fn probe_video(path: &PathBuf) -> Result<(Option<i64>, Option<i64>, Option<f64>, Option<f64>)> {
    let ffprobe = get_ffprobe_path();
    if !ffprobe.exists() {
        anyhow::bail!("ffprobe not found at {:?}", ffprobe);
    }

    let mut cmd = Command::new(&ffprobe);
    cmd.args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-show_format",
            &path.to_string_lossy(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd.output()
        .context("Failed to run ffprobe")?;

    let probe: ProbeOutput = serde_json::from_slice(&output.stdout)
        .context("Failed to parse ffprobe output")?;

    let video_stream = probe.streams.iter().find(|s| s.codec_type.as_deref() == Some("video"));

    if let Some(stream) = video_stream {
        let fps = stream.r_frame_rate.as_ref().and_then(|r| {
            let parts: Vec<&str> = r.split('/').collect();
            if parts.len() == 2 {
                let num: f64 = parts[0].parse().ok()?;
                let den: f64 = parts[1].parse().ok()?;
                if den > 0.0 { Some(num / den) } else { None }
            } else {
                r.parse().ok()
            }
        });

        let stream_duration = stream.duration.as_ref().and_then(|d| d.parse::<f64>().ok());
        let format_duration = probe.format.as_ref()
            .and_then(|f| f.duration.as_ref())
            .and_then(|d| d.parse::<f64>().ok());
        let duration = stream_duration.or(format_duration);

        Ok((stream.width, stream.height, fps, duration))
    } else {
        Ok((None, None, None, None))
    }
}

fn guess_mimetype(path: &PathBuf) -> String {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "mp4" => "video/mp4".to_string(),
        "mov" => "video/quicktime".to_string(),
        "avi" => "video/x-msvideo".to_string(),
        "mkv" => "video/x-matroska".to_string(),
        "webm" => "video/webm".to_string(),
        "flv" => "video/x-flv".to_string(),
        "wmv" => "video/x-ms-wmv".to_string(),
        "m4v" => "video/mp4".to_string(),
        "3gp" => "video/3gpp".to_string(),
        _ => "video/octet-stream".to_string(),
    }
}

#[tauri::command]
pub async fn import_videos(
    app: AppHandle,
    state: State<'_, DbState>,
    paths: Vec<String>,
) -> Result<VideoImportResult, String> {
    let pool = state.0.clone();

    let ffmpeg_available = get_ffmpeg_path().exists();
    let ffprobe_available = get_ffprobe_path().exists();

    if !ffmpeg_available || !ffprobe_available {
        return Err("FFmpeg is required to import videos. Please download it first in Settings.".to_string());
    }

    let thumbnails_dir = get_thumbnails_dir(&app);

    let mut imported_count: i64 = 0;
    let mut duplicates: i64 = 0;
    let mut failed: i64 = 0;

    for path_str in paths {
        let path = PathBuf::from(&path_str);
        if !path.exists() {
            failed += 1;
            continue;
        }

        // Validate file extension first
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());

        if let Some(extension) = ext.as_deref() {
            if !SUPPORTED_VIDEO_EXTENSIONS.contains(&extension) {
                failed += 1;
                continue;
            }
        } else {
            // No extension - skip
            failed += 1;
            continue;
        }

        let filename = match path.file_name() {
            Some(name) => name.to_string_lossy().to_string(),
            None => { failed += 1; continue; }
        };

        let existing: Option<(i64,)> = sqlx::query_as("SELECT id FROM videos WHERE filepath = ?")
            .bind(&path_str)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;

        if existing.is_some() {
            duplicates += 1;
            continue;
        }

        let size = fs::metadata(&path).map(|m| m.len() as i64).ok();
        let mimetype = guess_mimetype(&path);

        let (width, height, fps, duration) = probe_video(&path).unwrap_or((None, None, None, None));

        let result = sqlx::query(
            "INSERT INTO videos (filename, filepath, mimetype, size, width, height, duration, fps) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&filename)
        .bind(&path_str)
        .bind(&mimetype)
        .bind(size)
        .bind(width)
        .bind(height)
        .bind(duration)
        .bind(fps)
        .execute(&pool)
        .await;

        match result {
            Ok(row) => {
                let video_id = row.last_insert_rowid();
                let thumbnail_path = thumbnails_dir.join(format!("{}.jpg", video_id));
                if extract_video_thumbnail(&path, &thumbnail_path).is_ok() {
                    if let Some(thumb_str) = thumbnail_path.to_str().map(|s| s.to_string()) {
                        let _ = sqlx::query("UPDATE videos SET thumbnail_path = ? WHERE id = ?")
                            .bind(&thumb_str)
                            .bind(video_id)
                            .execute(&pool)
                            .await;
                    }
                }
                imported_count += 1;
            }
            Err(e) => {
                log::error!("Failed to insert video {}: {}", path_str, e);
                failed += 1;
            }
        }
    }

    Ok(VideoImportResult { imported: imported_count, duplicates, failed })
}

fn get_thumbnails_dir(app: &AppHandle) -> PathBuf {
    let dir = if cfg!(debug_assertions) {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                std::env::current_dir().expect("Failed to get current directory")
            });
        let project_root = manifest_dir.parent().unwrap_or(&manifest_dir);
        project_root.join("data").join("thumbnails")
    } else {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        app_data_dir.join("thumbnails")
    };
    let _ = fs::create_dir_all(&dir);
    dir
}

fn extract_video_thumbnail(video_path: &PathBuf, output_path: &PathBuf) -> Result<()> {
    let ffmpeg_path = get_ffmpeg_path();
    if !ffmpeg_path.exists() {
        anyhow::bail!("FFmpeg not found");
    }

    let mut cmd = Command::new(&ffmpeg_path);
    cmd.args([
            "-ss", "00:00:01",
            "-i", &video_path.to_string_lossy(),
            "-vframes", "1",
            "-q:v", "2",
            "-y",
            &output_path.to_string_lossy(),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd.output().context("Failed to run ffmpeg for thumbnail extraction")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("FFmpeg thumbnail extraction failed: {}", stderr);
    }

    Ok(())
}

#[derive(Clone, Serialize)]
pub struct VideoCompressionProgress {
    pub id: i64,
    pub progress: u8,
    pub message: String,
}

#[derive(Clone, Serialize)]
pub struct VideoConversionProgress {
    pub id: i64,
    pub progress: u8,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompressionPreset {
    pub name: String,
    pub crf: u8,
    pub preset: String,
}

#[tauri::command]
pub fn get_compression_presets() -> Vec<CompressionPreset> {
    vec![
        CompressionPreset { name: "Ultra Fast".to_string(), crf: 23, preset: "ultrafast".to_string() },
        CompressionPreset { name: "Fast".to_string(), crf: 21, preset: "fast".to_string() },
        CompressionPreset { name: "Medium".to_string(), crf: 20, preset: "medium".to_string() },
        CompressionPreset { name: "Slow".to_string(), crf: 19, preset: "slow".to_string() },
        CompressionPreset { name: "Very Slow".to_string(), crf: 18, preset: "veryslow".to_string() },
    ]
}

#[tauri::command]
pub async fn compress_videos_by_ids(
    app: AppHandle,
    state: State<'_, DbState>,
    ids: Vec<i64>,
    quality: u8,
    preset: String,
) -> Result<usize, String> {
    let pool = state.0.clone();

    let output_dir_setting: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'output'")
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

    let concurrency_limit = num_cpus::get().max(2);

    let results: Vec<bool> = stream::iter(ids.into_iter())
        .map(|id| {
            let app_clone = app.clone();
            let pool_clone = pool.clone();
            let output_dir_clone = output_dir_setting.clone();
            let preset_clone = preset.clone();
            let quality_clone = quality;

            async move {
                let video_record: Option<(String,)> = sqlx::query_as("SELECT filepath FROM videos WHERE id = ?")
                    .bind(id)
                    .fetch_optional(&pool_clone)
                    .await
                    .ok()
                    .flatten();

                if let Some((filepath,)) = video_record {
                    let _ = app_clone.emit("video-compression-progress", VideoCompressionProgress {
                        id,
                        progress: 10,
                        message: "Starting...".to_string(),
                    });

                    let orig_path = PathBuf::from(&filepath);
                    if !orig_path.exists() {
                        return false;
                    }

                    let file_stem = orig_path.file_stem().unwrap_or_default().to_string_lossy();
                    let new_filename = format!("{}_compressed.mp4", file_stem);
                    
                    let final_filepath = match &output_dir_clone {
                        Some(dir) if PathBuf::from(dir).exists() => PathBuf::from(dir).join(&new_filename),
                        _ => orig_path.with_file_name(&new_filename),
                    };

                    let temp_filename = format!("{}.tmp", new_filename);
                    let temp_filepath = match &output_dir_clone {
                        Some(dir) if PathBuf::from(dir).exists() => PathBuf::from(dir).join(&temp_filename),
                        _ => orig_path.with_file_name(&temp_filename),
                    };

                    let _ = app_clone.emit("video-compression-progress", VideoCompressionProgress {
                        id,
                        progress: 20,
                        message: "Compressing...".to_string(),
                    });

                    let temp_filepath_clone = temp_filepath.clone();
                    let orig_path_clone = orig_path.clone();
                    
                    let compress_result = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
                        let ffmpeg_path = get_ffmpeg_path();
                        if !ffmpeg_path.exists() {
                            return Err("FFmpeg not found".to_string());
                        }

                        let mut cmd = Command::new(&ffmpeg_path);
                        cmd.arg("-i").arg(&orig_path_clone)
                           .arg("-c:v").arg("libx264")
                           .arg("-crf").arg(quality_clone.to_string())
                           .arg("-preset").arg(&preset_clone)
                           .arg("-c:a").arg("aac")
                           .arg("-b:a").arg("128k")
                           .arg("-movflags").arg("+faststart")
                           .arg("-f").arg("mp4")
                           .arg("-y")
                           .arg(&temp_filepath_clone);

                        #[cfg(windows)]
                        {
                            use std::os::windows::process::CommandExt;
                            const CREATE_NO_WINDOW: u32 = 0x08000000;
                            cmd.creation_flags(CREATE_NO_WINDOW);
                        }

                        let output = cmd.output().map_err(|e| format!("Failed to run ffmpeg: {}", e))?;
                        
                        if !output.status.success() {
                            let stderr = String::from_utf8_lossy(&output.stderr);
                            return Err(format!("FFmpeg failed: {}", stderr));
                        }

                        Ok(())
                    }).await;

                    match compress_result {
                        Ok(Ok(_)) => {
                            if let Err(e) = fs::rename(&temp_filepath, &final_filepath) {
                                log::error!("Failed to rename temp file: {}", e);
                                let _ = fs::remove_file(&temp_filepath);
                                return false;
                            }

                            let size = fs::metadata(&final_filepath).map(|m| m.len() as i64).ok();
                            let fp = dunce::canonicalize(&final_filepath).unwrap_or(final_filepath).to_string_lossy().to_string();
                            
                            let insert_result = sqlx::query(
                                "INSERT OR REPLACE INTO compressed_videos (original_id, filepath, size) VALUES (?, ?, ?)"
                            )
                            .bind(id)
                            .bind(fp)
                            .bind(size)
                            .execute(&pool_clone)
                            .await;

                            if insert_result.is_ok() {
                                let _ = app_clone.emit("video-compression-progress", VideoCompressionProgress {
                                    id,
                                    progress: 100,
                                    message: "Done".to_string(),
                                });
                                let _ = app_clone.emit("videos-updated", ());
                                return true;
                            }
                        },
                        Ok(Err(e)) => {
                            log::error!("Compression error for ID {}: {}", id, e);
                            let _ = fs::remove_file(&temp_filepath);
                        },
                        Err(e) => {
                            log::error!("Tokio spawn error for ID {}: {}", id, e);
                            let _ = fs::remove_file(&temp_filepath);
                        }
                    }
                    
                    let _ = app_clone.emit("video-compression-progress", VideoCompressionProgress {
                        id,
                        progress: 0,
                        message: "Failed".to_string(),
                    });
                }
                false
            }
        })
        .buffer_unordered(concurrency_limit)
        .collect()
        .await;

    let compressed_count = results.into_iter().filter(|&success| success).count();

    Ok(compressed_count)
}

fn build_video_ffmpeg_args(format: &str, input: &str, output: &str) -> Vec<String> {
    let container = match format {
        "webm" => "webm",
        "mov" => "mov",
        "gif" => "gif",
        _ => "mp4",
    };

    let mut args = vec![
        "-i".into(), input.into(),
    ];

    match format {
        "webm" => {
            args.push("-c:v".into()); args.push("libvpx".into());
            args.push("-c:a".into()); args.push("libvorbis".into());
        },
        "mov" => {
            args.push("-c:v".into()); args.push("libx264".into());
            args.push("-c:a".into()); args.push("aac".into());
        },
        "gif" => {
            args.push("-vf".into()); args.push("fps=10,scale=320:-1:flags=lanczos".into());
        },
        _ => {  // mp4 default
            args.push("-c:v".into()); args.push("libx264".into());
            args.push("-c:a".into()); args.push("aac".into());
            args.push("-movflags".into()); args.push("+faststart".into());
        },
    }

    args.push("-f".into());
    args.push(container.into());
    args.push("-y".into());
    args.push(output.into());
    args
}

#[tauri::command]
pub async fn convert_videos_by_ids(
    app: AppHandle,
    state: State<'_, DbState>,
    ids: Vec<i64>,
    format: String,
) -> Result<usize, String> {
    let pool = state.0.clone();
    let target_format = format.to_lowercase();

    let output_dir_setting: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'output'")
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

    let concurrency_limit = num_cpus::get().max(2);

    let results: Vec<bool> = stream::iter(ids.into_iter())
        .map(|id| {
            let app_clone = app.clone();
            let pool_clone = pool.clone();
            let output_dir_clone = output_dir_setting.clone();
            let fmt = target_format.clone();

            async move {
                let video_record: Option<(String,)> = sqlx::query_as("SELECT filepath FROM videos WHERE id = ?")
                    .bind(id)
                    .fetch_optional(&pool_clone)
                    .await
                    .ok()
                    .flatten();

                if let Some((filepath,)) = video_record {
                    let _ = app_clone.emit("video-conversion-progress", VideoConversionProgress {
                        id,
                        progress: 10,
                        message: "Starting...".to_string(),
                    });

                    let orig_path = PathBuf::from(&filepath);
                    if !orig_path.exists() {
                        return false;
                    }

                    let file_stem = orig_path.file_stem().unwrap_or_default().to_string_lossy();
                    let new_filename = format!("{}_{}.{}", file_stem, &fmt, &fmt);

                    let final_filepath = match &output_dir_clone {
                        Some(dir) if PathBuf::from(dir).exists() => PathBuf::from(dir).join(&new_filename),
                        _ => orig_path.with_file_name(&new_filename),
                    };

                    let temp_filename = format!("{}.tmp", new_filename);
                    let temp_filepath = match &output_dir_clone {
                        Some(dir) if PathBuf::from(dir).exists() => PathBuf::from(dir).join(&temp_filename),
                        _ => orig_path.with_file_name(&temp_filename),
                    };

                    let _ = app_clone.emit("video-conversion-progress", VideoConversionProgress {
                        id,
                        progress: 30,
                        message: format!("Converting to {}...", fmt),
                    });

                    let temp_filepath_clone = temp_filepath.clone();
                    let orig_path_str = orig_path.to_string_lossy().to_string();
                    let fmt_clone = fmt.clone();

                    let convert_result = tauri::async_runtime::spawn_blocking(move || -> Result<()> {
                        let ffmpeg_path = get_ffmpeg_path();
                        if !ffmpeg_path.exists() {
                            anyhow::bail!("FFmpeg not found");
                        }

                        let mut cmd = Command::new(&ffmpeg_path);
                        let args = build_video_ffmpeg_args(&fmt_clone, &orig_path_str, &temp_filepath_clone.to_string_lossy());
                        cmd.args(&args);

                        #[cfg(windows)]
                        {
                            use std::os::windows::process::CommandExt;
                            const CREATE_NO_WINDOW: u32 = 0x08000000;
                            cmd.creation_flags(CREATE_NO_WINDOW);
                        }

                        let output = cmd.output().context("Failed to run ffmpeg for video conversion")?;

                        if !output.status.success() {
                            let stderr = String::from_utf8_lossy(&output.stderr);
                            anyhow::bail!("FFmpeg conversion failed: {}", stderr);
                        }

                        Ok(())
                    }).await;

                    match convert_result {
                        Ok(Ok(_)) => {
                            if let Err(e) = fs::rename(&temp_filepath, &final_filepath) {
                                log::error!("Failed to rename temp file: {}", e);
                                let _ = fs::remove_file(&temp_filepath);
                                return false;
                            }

                            let size = fs::metadata(&final_filepath).map(|m| m.len() as i64).ok();
                            let fp = dunce::canonicalize(&final_filepath).unwrap_or(final_filepath).to_string_lossy().to_string();

                            let insert_result = sqlx::query(
                                "INSERT OR REPLACE INTO converted_videos (original_id, filepath, format, size) VALUES (?, ?, ?, ?)"
                            )
                            .bind(id)
                            .bind(fp)
                            .bind(&fmt)
                            .bind(size)
                            .execute(&pool_clone)
                            .await;

                            if insert_result.is_ok() {
                                let _ = app_clone.emit("video-conversion-progress", VideoConversionProgress {
                                    id,
                                    progress: 100,
                                    message: "Done".to_string(),
                                });
                                let _ = app_clone.emit("videos-updated", ());
                                return true;
                            }
                        },
                        Ok(Err(e)) => {
                            log::error!("Video conversion error for ID {}: {}", id, e);
                            let _ = fs::remove_file(&temp_filepath);
                        },
                        Err(e) => {
                            log::error!("Tokio spawn error for ID {}: {}", id, e);
                            let _ = fs::remove_file(&temp_filepath);
                        }
                    }

                    let _ = app_clone.emit("video-conversion-progress", VideoConversionProgress {
                        id,
                        progress: 0,
                        message: "Failed".to_string(),
                    });
                }
                false
            }
        })
        .buffer_unordered(concurrency_limit)
        .collect()
        .await;

    let converted_count = results.into_iter().filter(|&success| success).count();
    Ok(converted_count)
}

#[derive(Debug, Deserialize)]
pub struct VideoQueryParams {
    pub search: Option<String>,
    pub sort_field: Option<String>,
    pub sort_order: Option<String>,
}

#[tauri::command]
pub async fn get_all_videos(
    state: State<'_, DbState>,
    params: Option<VideoQueryParams>,
) -> Result<Vec<Video>, String> {
    let pool = state.0.clone();

    let order_clause = if let Some(ref p) = params {
        let sort_field = match p.sort_field.as_deref() {
            Some("name") => "v.filename",
            Some("size") => "v.size",
            _ => "v.id",
        };
        let sort_order = if p.sort_order.as_deref() == Some("asc") {
            "ASC"
        } else {
            "DESC"
        };
        format!("ORDER BY {} {}", sort_field, sort_order)
    } else {
        "ORDER BY v.id DESC".to_string()
    };

    let search_clause = if let Some(ref p) = params {
        if let Some(ref search) = p.search {
            if !search.is_empty() {
                format!(
                    "WHERE LOWER(v.filename) LIKE LOWER('%{}%')",
                    search.replace('\'', "''")
                )
            } else {
                String::new()
            }
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let query = format!(
        "SELECT id, filename, filepath, mimetype, size, width, height, duration, fps, thumbnail_path FROM videos v {} {}",
        search_clause, order_clause
    );

    let rows = sqlx::query_as::<
        _,
        (
            i64,
            String,
            String,
            Option<String>,
            Option<i64>,
            Option<i64>,
            Option<i64>,
            Option<f64>,
            Option<f64>,
            Option<String>,
        ),
    >(&query)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let bg_rows = sqlx::query_as::<_, (i64, String, Option<i64>, String)>(
        "SELECT original_id, filepath, size, model_used FROM bg_removed_videos"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut bg_map: std::collections::HashMap<i64, (String, Option<i64>, String)> = std::collections::HashMap::new();
    for (orig_id, fp, sz, model) in bg_rows {
        bg_map.insert(orig_id, (fp, sz, model));
    }

    let comp_rows = sqlx::query_as::<_, (i64, String, Option<i64>)>(
        "SELECT original_id, filepath, size FROM compressed_videos"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut comp_map: std::collections::HashMap<i64, (String, Option<i64>)> = std::collections::HashMap::new();
    for (orig_id, fp, sz) in comp_rows {
        comp_map.insert(orig_id, (fp, sz));
    }

    let conv_rows = sqlx::query_as::<_, (i64, String, Option<i64>, String)>(
        "SELECT original_id, filepath, size, format FROM converted_videos"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut conv_map: std::collections::HashMap<i64, Vec<ConvertedVideo>> = std::collections::HashMap::new();
    for (orig_id, fp, sz, fmt) in conv_rows {
        conv_map.entry(orig_id).or_default().push(ConvertedVideo { filepath: fp, size: sz, format: fmt });
    }

    let videos: Vec<Video> = rows.into_iter().map(|(id, filename, filepath, mimetype, size, width, height, duration, fps, thumbnail_path)| {
        let (bg_removed_filepath, bg_removed_size, bg_removed_model) = match bg_map.get(&id) {
            Some((fp, sz, model)) => (Some(fp.clone()), *sz, Some(model.clone())),
            None => (None, None, None),
        };
        let (compressed_filepath, compressed_size) = match comp_map.get(&id) {
            Some((fp, sz)) => (Some(fp.clone()), *sz),
            None => (None, None),
        };
        let converted_videos = conv_map.remove(&id).unwrap_or_default();
        Video {
            id, filename, filepath, mimetype, size, width, height, duration, fps, thumbnail_path,
            bg_removed_filepath, bg_removed_size, bg_removed_model,
            compressed_filepath, compressed_size,
            converted_videos,
        }
    }).collect();

    Ok(videos)
}

#[tauri::command]
pub async fn get_video_by_id(
    id: i64,
    state: State<'_, DbState>,
) -> Result<Video, String> {
    let pool = &state.0;

    let row = sqlx::query_as::<_, (
        i64, String, String, Option<String>, Option<i64>,
        Option<i64>, Option<i64>, Option<f64>, Option<f64>, Option<String>,
    )>(
        "SELECT id, filename, filepath, mimetype, size, width, height, duration, fps, thumbnail_path
         FROM videos WHERE id = ?"
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Video not found".to_string())?;

    let (id, filename, filepath, mimetype, size, width, height, duration, fps, thumbnail_path) = row;

    let bg_row = sqlx::query_as::<_, (String, Option<i64>, String)>(
        "SELECT filepath, size, model_used FROM bg_removed_videos WHERE original_id = ?"
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let (bg_removed_filepath, bg_removed_size, bg_removed_model) = match bg_row {
        Some((fp, sz, model)) => (Some(fp), sz, Some(model)),
        None => (None, None, None),
    };

    let comp_row = sqlx::query_as::<_, (String, Option<i64>)>(
        "SELECT filepath, size FROM compressed_videos WHERE original_id = ?"
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let (compressed_filepath, compressed_size) = match comp_row {
        Some((fp, sz)) => (Some(fp), sz),
        None => (None, None),
    };

    let conv_rows = sqlx::query_as::<_, (String, Option<i64>, String)>(
        "SELECT filepath, size, format FROM converted_videos WHERE original_id = ? ORDER BY id DESC"
    )
    .bind(id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let converted_videos: Vec<ConvertedVideo> = conv_rows
        .into_iter()
        .map(|(fp, sz, fmt)| ConvertedVideo { filepath: fp, size: sz, format: fmt })
        .collect();

    Ok(Video {
        id, filename, filepath, mimetype, size, width, height, duration, fps, thumbnail_path,
        bg_removed_filepath, bg_removed_size, bg_removed_model,
        compressed_filepath, compressed_size,
        converted_videos,
    })
}

#[tauri::command]
pub async fn delete_videos_by_ids(
    state: State<'_, DbState>,
    ids: Vec<i64>,
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }

    let pool = state.0.clone();

    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");

    // Fetch thumbnail paths before deleting rows
    let thumb_query = format!("SELECT id, thumbnail_path FROM videos WHERE id IN ({})", placeholders);
    let mut tq = sqlx::query_as::<_, (i64, Option<String>)>(&thumb_query);
    for id in &ids {
        tq = tq.bind(id);
    }
    let thumb_rows: Vec<(i64, Option<String>)> = tq.fetch_all(&pool).await.map_err(|e| e.to_string())?;

    // Delete thumbnail files from disk
    for (_, thumb_path) in &thumb_rows {
        if let Some(path) = thumb_path {
            let _ = fs::remove_file(path);
        }
    }

    let br_query = format!("DELETE FROM bg_removed_videos WHERE original_id IN ({})", placeholders);
    let mut br_q = sqlx::query(&br_query);
    for id in &ids {
        br_q = br_q.bind(id);
    }
    br_q.execute(&pool).await.map_err(|e| e.to_string())?;

    let query = format!("DELETE FROM videos WHERE id IN ({})", placeholders);
    let mut q = sqlx::query(&query);
    for id in &ids {
        q = q.bind(id);
    }
    q.execute(&pool).await.map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn generate_video_thumbnails(
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<usize, String> {
    let pool = state.0.clone();
    let thumbnails_dir = get_thumbnails_dir(&app);

    let rows: Vec<(i64, String)> = sqlx::query_as(
        "SELECT id, filepath FROM videos WHERE thumbnail_path IS NULL"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut generated = 0;
    for (id, filepath) in &rows {
        let thumb_path = thumbnails_dir.join(format!("{}.jpg", id));
        let video_path = PathBuf::from(filepath);
        if extract_video_thumbnail(&video_path, &thumb_path).is_ok() {
            if let Some(thumb_str) = thumb_path.to_str().map(|s| s.to_string()) {
                if sqlx::query("UPDATE videos SET thumbnail_path = ? WHERE id = ?")
                    .bind(&thumb_str)
                    .bind(id)
                    .execute(&pool)
                    .await
                    .is_ok()
                {
                    generated += 1;
                }
            }
        }
    }

    Ok(generated)
}

#[tauri::command]
pub async fn get_all_bg_removed_videos(state: State<'_, DbState>) -> Result<Vec<Video>, String> {
    let pool = state.0.clone();

    let rows = sqlx::query_as::<_, (i64, String, String, String, Option<i64>, Option<i64>, Option<i64>, Option<f64>, Option<f64>)>(
        r#"
        SELECT v.id, v.filename, b.filepath, b.model_used, b.size,
               v.width, v.height, v.duration, v.fps
        FROM videos v
        INNER JOIN bg_removed_videos b ON v.id = b.original_id
        ORDER BY v.id DESC
        "#
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let result: Vec<Video> = rows.into_iter().map(|row| {
        Video {
            id: row.0,
            filename: row.1,
            filepath: row.2.clone(),
            mimetype: Some("video/webm".to_string()),
            size: row.4,
            width: row.5,
            height: row.6,
            duration: row.7,
            fps: row.8,
            thumbnail_path: None,
            bg_removed_filepath: Some(row.2),
            bg_removed_size: row.4,
            bg_removed_model: Some(row.3),
            compressed_filepath: None,
            compressed_size: None,
            converted_videos: vec![],
        }
    }).collect();

    Ok(result)
}

#[tauri::command]
pub async fn get_all_compressed_videos(state: State<'_, DbState>) -> Result<Vec<Video>, String> {
    let pool = state.0.clone();

    let rows = sqlx::query_as::<_, (i64, String, String, Option<i64>, Option<i64>, Option<i64>, Option<f64>, Option<f64>, Option<String>)>(
        r#"
        SELECT v.id, v.filename, c.filepath, c.size,
               v.width, v.height, v.duration, v.fps, v.thumbnail_path
        FROM videos v
        INNER JOIN compressed_videos c ON v.id = c.original_id
        ORDER BY v.id DESC
        "#
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let result: Vec<Video> = rows.into_iter().map(|row| {
        Video {
            id: row.0,
            filename: row.1,
            filepath: row.2.clone(),
            mimetype: Some("video/mp4".to_string()),
            size: row.3,
            width: row.4,
            height: row.5,
            duration: row.6,
            fps: row.7,
            thumbnail_path: row.8,
            bg_removed_filepath: None,
            bg_removed_size: None,
            bg_removed_model: None,
            compressed_filepath: Some(row.2),
            compressed_size: row.3,
            converted_videos: vec![],
        }
    }).collect();

    Ok(result)
}

#[tauri::command]
pub async fn get_all_converted_videos(state: State<'_, DbState>) -> Result<Vec<Video>, String> {
    let pool = state.0.clone();

    let rows = sqlx::query_as::<_, (i64, String, String, Option<String>, Option<i64>, Option<i64>, Option<i64>, Option<f64>, Option<f64>, Option<String>)>(
        r#"
        SELECT v.id, v.filename, v.filepath, v.mimetype, v.size,
               v.width, v.height, v.duration, v.fps, v.thumbnail_path
        FROM videos v
        INNER JOIN converted_videos cvi ON v.id = cvi.original_id
        GROUP BY v.id
        ORDER BY MAX(cvi.id) DESC
        "#
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let conv_rows = sqlx::query_as::<_, (i64, String, Option<i64>, String)>(
        "SELECT original_id, filepath, size, format FROM converted_videos ORDER BY id DESC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut conv_map: std::collections::HashMap<i64, Vec<ConvertedVideo>> = std::collections::HashMap::new();
    for (orig_id, fp, sz, fmt) in conv_rows {
        conv_map.entry(orig_id).or_default().push(ConvertedVideo { filepath: fp, size: sz, format: fmt });
    }

    let result: Vec<Video> = rows.into_iter().map(|(id, filename, filepath, mimetype, size, width, height, duration, fps, thumbnail_path)| {
        let converted_videos = conv_map.remove(&id).unwrap_or_default();
        Video {
            id, filename, filepath, mimetype, size, width, height, duration, fps, thumbnail_path,
            bg_removed_filepath: None,
            bg_removed_size: None,
            bg_removed_model: None,
            compressed_filepath: None,
            compressed_size: None,
            converted_videos,
        }
    }).collect();

    Ok(result)
}

#[allow(clippy::too_many_arguments)]
fn process_video_frames(
    video_path: &PathBuf,
    output_path: &PathBuf,
    model_path: &PathBuf,
    width: u32,
    height: u32,
    fps: f64,
    total_frames: usize,
    video_id: i64,
    app: &AppHandle,
    cancel_token: Arc<AtomicBool>,
) -> Result<()> {
    let ffmpeg_path = get_ffmpeg_path();
    if !ffmpeg_path.exists() {
        anyhow::bail!("FFmpeg not found. Please download FFmpeg first.");
    }

    let session = create_onnx_session(model_path)?;

    let mut decoder = Command::new(&ffmpeg_path)
        .args([
            "-i", &video_path.to_string_lossy(),
            "-f", "rawvideo",
            "-pix_fmt", "rgb24",
            "-v", "quiet",
            "pipe:1",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .context("Failed to spawn FFmpeg decoder")?;

    let mut decoder_stdout = decoder.stdout.take()
        .context("Failed to get decoder stdout")?;

    let fps_str = format!("{:.2}", fps);
    let size_str = format!("{}x{}", width, height);

    let mut encoder = Command::new(&ffmpeg_path)
        .args([
            "-y",
            "-f", "rawvideo",
            "-pix_fmt", "rgba",
            "-s", &size_str,
            "-r", &fps_str,
            "-i", "pipe:0",
            "-c:v", "libvpx-vp9",
            "-pix_fmt", "yuva420p",
            "-crf", "30",
            "-b:v", "0",
            "-an",
            "-v", "quiet",
            &output_path.to_string_lossy(),
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .context("Failed to spawn FFmpeg encoder")?;

    let mut encoder_stdin = encoder.stdin.take()
        .context("Failed to get encoder stdin")?;

    let row_bytes = width as usize * 3;
    let frame_size = row_bytes * height as usize;
    let mut frame_buffer = vec![0u8; frame_size];
    let mut frames_processed = 0usize;
    let start_time = Instant::now();

    loop {
        if cancel_token.load(Ordering::Relaxed) {
            drop(decoder_stdout);
            let _ = decoder.wait();
            drop(encoder_stdin);
            let _ = encoder.wait();
            anyhow::bail!("Processing cancelled");
        }

        match decoder_stdout.read_exact(&mut frame_buffer) {
            Ok(()) => {
                let mut rgba = vec![255u8; width as usize * height as usize * 4];
                for y in 0..height as usize {
                    for x in 0..width as usize {
                        let src_idx = y * row_bytes + x * 3;
                        let dst_idx = (y * width as usize + x) * 4;
                        rgba[dst_idx] = frame_buffer[src_idx];
                        rgba[dst_idx + 1] = frame_buffer[src_idx + 1];
                        rgba[dst_idx + 2] = frame_buffer[src_idx + 2];
                        // alpha already 255
                    }
                }

                let original_image = match image::RgbaImage::from_raw(width, height, rgba) {
                    Some(img) => DynamicImage::ImageRgba8(img),
                    None => DynamicImage::ImageRgba8(ImageBuffer::new(width, height)),
                };

                match apply_bg_removal(&original_image, &session) {
                    Ok(result_image) => {
                        let raw_rgba = result_image.as_raw();
                        if encoder_stdin.write_all(raw_rgba).is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        log::error!("Frame {} bg removal failed for video {}: {}", frames_processed, video_id, e);
                        let blank_frame = vec![0u8; width as usize * height as usize * 4];
                        let _ = encoder_stdin.write_all(&blank_frame);
                    }
                }

                frames_processed += 1;

                if frames_processed % 5 == 0 || frames_processed == total_frames {
                    let progress = 10 + ((frames_processed as f32 / total_frames as f32) * 85.0) as u8;
                    let elapsed = start_time.elapsed().as_secs_f64();
                    let frames_remaining = total_frames - frames_processed;
                    let eta = if frames_processed > 0 {
                        Some((elapsed / frames_processed as f64) * frames_remaining as f64)
                    } else {
                        None
                    };
                    let _ = app.emit("video-bg-removal-progress", VideoBgRemovalProgress {
                        id: video_id,
                        progress: progress.min(95),
                        message: format!("Processing frame {}/{}", frames_processed, total_frames),
                        eta_seconds: eta,
                    });
                }
            }
            Err(_) => break,
        }
    }

    drop(decoder_stdout);
    let _ = decoder.wait();

    drop(encoder_stdin);
    let _ = encoder.wait();

    Ok(())
}

#[tauri::command]
pub async fn remove_video_bg(
    app: AppHandle,
    state: State<'_, DbState>,
    cancel_tokens: State<'_, CancelTokens>,
    ids: Vec<i64>,
) -> Result<VideoBgRemovalResult, String> {
    let pool = state.0.clone();

    let (model_path, _model_size) = check_model_downloaded(&app)?;

    let ffmpeg_path = get_ffmpeg_path();
    if !ffmpeg_path.exists() {
        return Err("FFmpeg not found. Please download FFmpeg first.".to_string());
    }

    let output_dir_setting: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'output'")
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

    let model_path = Arc::new(model_path);

    let ids_for_cleanup = ids.clone();
    {
        let mut cancel_map = cancel_tokens.0.lock().unwrap_or_else(|e| e.into_inner());
        for &id in &ids {
            cancel_map.insert(id, Arc::new(AtomicBool::new(false)));
        }
    }

    #[derive(Clone, Copy, PartialEq)]
    enum FrameResult { Success, Failed, Cancelled }

    let results: Vec<FrameResult> = stream::iter(ids.into_iter())
        .map(|id| {
            let app_clone = app.clone();
            let pool_clone = pool.clone();
            let output_dir_clone = output_dir_setting.clone();
            let model_path = model_path.clone();
            let cancel_tokens_state = app.state::<CancelTokens>();
            let cancel_tokens_inner = cancel_tokens_state.inner();

            async move {
                let cancel_token = {
                    let map = cancel_tokens_inner.0.lock().unwrap_or_else(|e| e.into_inner());
                    map.get(&id).cloned().unwrap_or_else(|| Arc::new(AtomicBool::new(false)))
                };
                let video_record: Option<(String, Option<i64>, Option<i64>)> = sqlx::query_as(
                    "SELECT filepath, width, height FROM videos WHERE id = ?"
                )
                .bind(id)
                .fetch_optional(&pool_clone)
                .await
                .ok()
                .flatten();

                if let Some((filepath, db_width, db_height)) = video_record {
                    let orig_path = PathBuf::from(&filepath);
                    if !orig_path.exists() {
                        return FrameResult::Failed;
                    }

                    let _ = app_clone.emit("video-bg-removal-progress", VideoBgRemovalProgress {
                        id,
                        progress: 5,
                        message: "Preparing...".to_string(),
                        eta_seconds: None,
                    });

                    let probe_data = probe_video(&orig_path).unwrap_or((None, None, None, None));
                    let video_width = db_width.or(probe_data.0).unwrap_or(1920);
                    let video_height = db_height.or(probe_data.1).unwrap_or(1080);
                    let video_fps = probe_data.2.unwrap_or(30.0);
                    let video_duration = probe_data.3.unwrap_or(10.0);

                    let total_frames = ((video_duration * video_fps).ceil() as usize).max(1);

                    let file_stem = orig_path.file_stem().unwrap_or_default().to_string_lossy();
                    let new_filename = format!("{}_no_bg.webm", file_stem);

                    let final_filepath = match &output_dir_clone {
                        Some(dir) if PathBuf::from(dir).exists() => PathBuf::from(dir).join(&new_filename),
                        _ => orig_path.with_file_name(&new_filename),
                    };

                    let temp_filename = format!("{}.tmp.webm", file_stem);
                    let temp_filepath = match &output_dir_clone {
                        Some(dir) if PathBuf::from(dir).exists() => PathBuf::from(dir).join(&temp_filename),
                        _ => orig_path.with_file_name(&temp_filename),
                    };

                    let _ = app_clone.emit("video-bg-removal-progress", VideoBgRemovalProgress {
                        id,
                        progress: 10,
                        message: "Processing frames...".to_string(),
                        eta_seconds: None,
                    });

                    if let Some(parent) = temp_filepath.parent() {
                        if !parent.exists() {
                            let _ = fs::create_dir_all(parent);
                        }
                    }

                    let temp_path_for_cleanup = temp_filepath.clone();
                    let app_for_emit = app_clone.clone();

                    let result = tauri::async_runtime::spawn_blocking(move || -> Result<()> {
                        process_video_frames(
                            &orig_path,
                            &temp_filepath,
                            &model_path,
                            video_width as u32,
                            video_height as u32,
                            video_fps,
                            total_frames,
                            id,
                            &app_clone,
                            cancel_token,
                        )
                    }).await;

                    match result {
                        Ok(Ok(())) => {
                            if final_filepath.exists() {
                                let _ = fs::remove_file(&final_filepath);
                            }

                            if let Err(e) = fs::rename(&temp_path_for_cleanup, &final_filepath) {
                                log::error!("Failed to rename temp video: {}", e);
                                let _ = fs::remove_file(&temp_path_for_cleanup);
                                return FrameResult::Failed;
                            }

                            let size = fs::metadata(&final_filepath).map(|m| m.len() as i64).ok();
                            let fp = dunce::canonicalize(&final_filepath).unwrap_or(final_filepath).to_string_lossy().to_string();

                            let insert_result = sqlx::query(
                                "INSERT OR REPLACE INTO bg_removed_videos (original_id, filepath, size, model_used) VALUES (?, ?, ?, ?)"
                            )
                            .bind(id)
                            .bind(fp)
                            .bind(size)
                            .bind("bria-rmbg-1.4")
                            .execute(&pool_clone)
                            .await;

                            if insert_result.is_ok() {
                                let _ = app_for_emit.emit("video-bg-removal-progress", VideoBgRemovalProgress {
                                    id,
                                    progress: 100,
                                    message: "Done".to_string(),
                                    eta_seconds: None,
                                });
                                let _ = app_for_emit.emit("videos-updated", ());
                                return FrameResult::Success;
                            }
                        }
                        Ok(Err(e)) => {
                            if e.to_string().contains("cancelled") {
                                log::info!("Video background removal cancelled for ID {}", id);
                                let _ = fs::remove_file(&temp_path_for_cleanup);
                                let _ = app_for_emit.emit("video-bg-removal-progress", VideoBgRemovalProgress {
                                    id,
                                    progress: 0,
                                    message: "Cancelled".to_string(),
                                    eta_seconds: None,
                                });
                                return FrameResult::Cancelled;
                            } else {
                                log::error!("Video background removal error for ID {}: {}", id, e);
                            }
                        }
                        Err(e) => {
                            log::error!("Tokio spawn error for ID {}: {}", id, e);
                        }
                    }

                    let _ = fs::remove_file(&temp_path_for_cleanup);
                    let _ = app_for_emit.emit("video-bg-removal-progress", VideoBgRemovalProgress {
                        id,
                        progress: 0,
                        message: "Failed".to_string(),
                        eta_seconds: None,
                    });
                }
                FrameResult::Failed
            }
        })
        .buffer_unordered(1)
        .collect()
        .await;

    let processed_count = results.iter().filter(|&&r| r == FrameResult::Success).count();
    let cancelled_count = results.iter().filter(|&&r| r == FrameResult::Cancelled).count();
    let failed_count = results.iter().filter(|&&r| r == FrameResult::Failed).count();

    {
        let mut cancel_map = cancel_tokens.0.lock().unwrap_or_else(|e| e.into_inner());
        for id in &ids_for_cleanup {
            cancel_map.remove(id);
        }
    }

    Ok(VideoBgRemovalResult { processed: processed_count, failed: failed_count, cancelled: cancelled_count })
}

#[tauri::command]
pub async fn cancel_video_bg_removal(
    cancel_tokens: State<'_, CancelTokens>,
    ids: Vec<i64>,
) -> Result<(), String> {
    let cancel_map = cancel_tokens.0.lock().unwrap_or_else(|e| e.into_inner());
    for id in &ids {
        if let Some(token) = cancel_map.get(id) {
            token.store(true, Ordering::Relaxed);
        }
    }
    Ok(())
}