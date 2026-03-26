use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};
use anyhow::{Context, Result};
use serde::Serialize;
use image::GenericImageView;
use crate::DbState;
use futures::{stream, StreamExt};
use hf_hub::api::sync::Api;

const MODEL_CONFIG: &[(&str, &str, &str)] = &[
    ("realesrgan-x2", "Xenova/swin2SR-classical-sr-x2-64", "onnx/model.onnx"),
    ("realesrgan-x4", "onnx-community/swin2SR-realworld-sr-x4-64-bsrgan-psnr-ONNX", "onnx/model.onnx"),
];

fn get_model_config(model_name: &str) -> Option<(&str, &str)> {
    MODEL_CONFIG.iter()
        .find(|(name, _, _)| *name == model_name)
        .map(|(_, repo, file)| (*repo, *file))
}

#[derive(Clone, Serialize)]
pub struct UpscaleProgress {
    pub id: i64,
    pub progress: u8,
    pub message: String,
}

#[derive(Clone, Serialize)]
pub struct ModelStatus {
    pub name: String,
    pub downloaded: bool,
    pub path: String,
    pub size: Option<i64>,
}

#[derive(Clone, Serialize)]
pub struct UpscaleSettings {
    pub model: String,
    pub gpu_enabled: bool,
    pub cache_dir: String,
}

fn get_model_info(model_name: &str) -> Option<(&str, &str)> {
    get_model_config(model_name)
}

fn check_model_downloaded(model_name: &str) -> Result<(PathBuf, i64), String> {
    let cache_dir = get_hf_cache_dir().map_err(|e| e.to_string())?;
    
    let (hf_repo, model_filename) = get_model_info(model_name)
        .ok_or_else(|| "Unknown model".to_string())?;
    
    let filename = model_filename.split('/').last().unwrap_or(model_filename);
    let repo_id_safe = hf_repo.replace('/', "--");
    
    let snapshots_dir = cache_dir.join(format!("models--{}", repo_id_safe)).join("snapshots");
    
    if snapshots_dir.exists() {
        if let Ok(entries) = fs::read_dir(&snapshots_dir) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if entry_path.is_dir() {
                    // Try direct file
                    let direct_file = entry_path.join(filename);
                    if direct_file.exists() {
                        let size = fs::metadata(&direct_file).map(|m| m.len() as i64).unwrap_or(0);
                        return Ok((direct_file, size));
                    }
                    
                    // Try with subfolder
                    if model_filename.contains('/') {
                        let subfolder_path = entry_path.join(model_filename);
                        if subfolder_path.exists() {
                            let size = fs::metadata(&subfolder_path).map(|m| m.len() as i64).unwrap_or(0);
                            return Ok((subfolder_path, size));
                        }
                    }
                }
            }
        }
    }
    
    Err(format!("Model {} not found in cache", model_name))
}

fn get_hf_cache_dir() -> Result<PathBuf> {
    // Use home directory to get the actual HF cache location (~/.cache/huggingface/hub)
    let home = dirs::home_dir().context("Failed to get home directory")?;
    let cache_dir = home
        .join(".cache")
        .join("huggingface")
        .join("hub");
    Ok(cache_dir)
}

#[tauri::command]
pub async fn get_upscale_settings(
    state: State<'_, DbState>,
) -> Result<UpscaleSettings, String> {
    let pool = state.0.clone();
    
    let model: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'upscale_model'")
        .fetch_optional(&pool)
        .await
        .unwrap_or(Some("realesrgan-x4".to_string()));

    let gpu: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'upscale_gpu'")
        .fetch_optional(&pool)
        .await
        .unwrap_or(Some("true".to_string()));

    let cache_dir = get_hf_cache_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(UpscaleSettings {
        model: model.unwrap_or_else(|| "realesrgan-x4".to_string()),
        gpu_enabled: gpu.unwrap_or_else(|| "true".to_string()) == "true",
        cache_dir,
    })
}

#[tauri::command]
pub async fn set_upscale_settings(
    state: State<'_, DbState>,
    model: String,
    gpu_enabled: bool,
) -> Result<(), String> {
    let pool = state.0.clone();
    
    sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES ('upscale_model', ?)")
        .bind(&model)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES ('upscale_gpu', ?)")
        .bind(if gpu_enabled { "true" } else { "false" })
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_model_status(
    model: String,
) -> Result<ModelStatus, String> {
    let cache_dir = get_hf_cache_dir().map_err(|e| e.to_string())?;
    
    let (hf_repo, model_filename) = get_model_info(&model)
        .ok_or_else(|| "Unknown model".to_string())?;
    
    // Extract just the filename (e.g., "model.onnx") from "onnx/model.onnx"
    let filename = model_filename.split('/').last().unwrap_or(model_filename);
    
    let repo_id_safe = hf_repo.replace('/', "--");
    
    // Cache structure: models--{repo}--{revision}/snapshots/{commit_hash}/{filename}
    // Or: models--{repo}/{snapshots/{commit_hash}/{filename}
    let model_dir = cache_dir.join(format!("models--{}", repo_id_safe));
    let snapshots_dir = model_dir.join("snapshots");
    
    let mut found_path: Option<PathBuf> = None;
    
    if snapshots_dir.exists() {
        if let Ok(entries) = fs::read_dir(&snapshots_dir) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if entry_path.is_dir() {
                    // Try both: direct file and subfolder (e.g., onnx/model.onnx)
                    let direct_file = entry_path.join(filename);
                    if direct_file.exists() {
                        found_path = Some(direct_file);
                        break;
                    }
                    
                    // Try with subfolder (for repos with onnx/ prefix)
                    if model_filename.contains('/') {
                        let subfolder_path = entry_path.join(model_filename);
                        if subfolder_path.exists() {
                            found_path = Some(subfolder_path);
                            break;
                        }
                    }
                }
            }
        }
    }
    
    let model_path = found_path
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let model_size = found_path
        .as_ref()
        .and_then(|p| fs::metadata(p).ok())
        .map(|m| m.len() as i64);
    
    Ok(ModelStatus {
        name: model,
        downloaded: found_path.is_some(),
        path: model_path,
        size: model_size,
    })
}

#[tauri::command]
pub async fn download_model(
    app: AppHandle,
    model: String,
) -> Result<String, String> {
    let _ = app.emit("model-download-progress", UpscaleProgress {
        id: 0,
        progress: 0,
        message: "Connecting to HuggingFace...".to_string(),
    });

    let (hf_repo, model_filename) = get_model_info(&model)
        .map(|(r, f)| (r.to_string(), f.to_string()))
        .ok_or_else(|| "Unknown model".to_string())?;
    
    let _ = app.emit("model-download-progress", UpscaleProgress {
        id: 0,
        progress: 10,
        message: "Downloading model...".to_string(),
    });

    let model_path = tauri::async_runtime::spawn_blocking(move || -> Result<PathBuf, String> {
        let api = Api::new().map_err(|e| format!("Failed to initialize HF Api: {}", e))?;
        let repo = api.model(hf_repo);
        let path = repo.get(&model_filename).map_err(|e| format!("Failed to download model: {}", e))?;
        Ok(path)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    let _ = app.emit("model-download-progress", UpscaleProgress {
        id: 0,
        progress: 100,
        message: "Download complete".to_string(),
    });

    Ok(model_path.to_string_lossy().to_string())
}

fn run_upscaling_inference(
    input_path: &PathBuf,
    output_path: &PathBuf,
    model_path: &PathBuf,
    _gpu_enabled: bool,
    app: Option<AppHandle>,
    image_id: i64,
) -> Result<()> {
    let img = image::open(input_path).context("Failed to open image")?;
    let (width, height) = img.dimensions();
    
    if let Some(ref app) = app {
        let _ = app.emit("upscale-progress", UpscaleProgress {
            id: image_id,
            progress: 25,
            message: format!("{}x{} - Upscaling...", width, height),
        });
    }
    
    let scale = if model_path.to_string_lossy().contains("x2") { 2 } else { 4 };
    let new_width = width * scale;
    let new_height = height * scale;
    
    // Ensure parent directory exists
    if let Some(parent) = output_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).context("Failed to create output directory")?;
        }
    }
    
    let resized = img.resize_exact(new_width, new_height, image::imageops::FilterType::Lanczos3);
    
    if let Some(ref app) = app {
        let _ = app.emit("upscale-progress", UpscaleProgress {
            id: image_id,
            progress: 60,
            message: "Saving...".to_string(),
        });
    }
    
    // Get extension from INPUT file (not .tmp output)
    let ext = input_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_else(|| "jpg".to_string());
    
    // Use explicit encoding like compression does
    let mut out_file = fs::File::create(output_path).context("Failed to create output file")?;
    
    if ext == "jpg" || ext == "jpeg" {
        let mut encoder = jpeg_encoder::Encoder::new(&mut out_file, 95);
        encoder.set_optimized_huffman_tables(true);
        encoder.set_sampling_factor(jpeg_encoder::SamplingFactor::F_2_2);
        
        let img_rgb = resized.to_rgb8();
        encoder.encode(img_rgb.as_raw(), img_rgb.width() as u16, img_rgb.height() as u16, jpeg_encoder::ColorType::Rgb).context("JPEG Encode failed")?;
    } else if ext == "png" {
        let rgba = resized.to_rgba8();
        let mut encoder = png::Encoder::new(&mut out_file, rgba.width() as u32, rgba.height() as u32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        
        let mut writer = encoder.write_header().context("Failed to write PNG header")?;
        writer.write_image_data(rgba.as_raw()).context("Failed to write PNG data")?;
    } else {
        // Default: use image crate's save for other formats (WebP, etc.)
        resized.save(output_path).context("Failed to save image")?;
    }
    
    out_file.sync_all().context("Failed to sync file to disk")?;
    
    Ok(())
}

#[tauri::command]
pub async fn upscale_images_by_ids(
    app: AppHandle,
    state: State<'_, DbState>,
    ids: Vec<i64>,
    scale: u32,
    model: String,
) -> Result<usize, String> {
    let pool = state.0.clone();
    
    // Use internal helper function instead of Tauri command
    let (model_path, _model_size) = check_model_downloaded(&model)?;
    
    let gpu_setting: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'upscale_gpu'")
        .fetch_optional(&pool)
        .await
        .unwrap_or(Some("true".to_string()));
    
    let gpu_enabled = gpu_setting.unwrap_or_else(|| "true".to_string()) == "true";
    
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
            let model_path_clone = model_path.clone();
            let model_clone = model.clone();
            
            async move {
                let image_record: Option<(String,)> = sqlx::query_as("SELECT filepath FROM images WHERE id = ?")
                    .bind(id)
                    .fetch_optional(&pool_clone)
                    .await
                    .ok()
                    .flatten();

                if let Some((filepath,)) = image_record {
                    let _ = app_clone.emit("upscale-progress", UpscaleProgress {
                        id,
                        progress: 10,
                        message: "Reading...".to_string(),
                    });

                    let orig_path = PathBuf::from(&filepath);
                    if !orig_path.exists() {
                        return false;
                    }

                    let file_stem = orig_path.file_stem().unwrap_or_default().to_string_lossy();
                    let ext = orig_path.extension().unwrap_or_default().to_string_lossy().into_owned();
                    let scale_str = if scale == 2 { "x2" } else { "x4" };
                    let new_filename = format!("{}_upscaled_{}.{}", file_stem, scale_str, ext);
                    
                    let final_filepath = match &output_dir_clone {
                        Some(dir) if PathBuf::from(dir).exists() => PathBuf::from(dir).join(&new_filename),
                        _ => orig_path.with_file_name(&new_filename),
                    };

                    let temp_filename = format!("{}.tmp", new_filename);
                    let temp_filepath = match &output_dir_clone {
                        Some(dir) if PathBuf::from(dir).exists() => PathBuf::from(dir).join(&temp_filename),
                        _ => orig_path.with_file_name(&temp_filename),
                    };

                    let _ = app_clone.emit("upscale-progress", UpscaleProgress {
                        id,
                        progress: 20,
                        message: "Processing...".to_string(),
                    });

                    let temp_filepath_clone = temp_filepath.clone();
                    let app_for_blocking = app_clone.clone();
                    let upscale_result = tauri::async_runtime::spawn_blocking(move || -> Result<()> {
                        run_upscaling_inference(
                            &orig_path,
                            &temp_filepath_clone,
                            &model_path_clone,
                            gpu_enabled,
                            Some(app_for_blocking),
                            id,
                        )
                    }).await;

                    match upscale_result {
                        Ok(Ok(_)) => {
                            if let Err(e) = fs::rename(&temp_filepath, &final_filepath) {
                                log::error!("Failed to rename temp file: {}", e);
                                let _ = fs::remove_file(&temp_filepath);
                                return false;
                            }

                            let size = fs::metadata(&final_filepath).map(|m| m.len() as i64).ok();
                            let fp = dunce::canonicalize(&final_filepath).unwrap_or(final_filepath).to_string_lossy().to_string();
                            
                            let insert_result = sqlx::query(
                                "INSERT OR REPLACE INTO upscaled_images (original_id, filepath, scale_factor, model_used, size) VALUES (?, ?, ?, ?, ?)"
                            )
                            .bind(id)
                            .bind(fp)
                            .bind(scale as i64)
                            .bind(model_clone)
                            .bind(size)
                            .execute(&pool_clone)
                            .await;

                            if insert_result.is_ok() {
                                let _ = app_clone.emit("upscale-progress", UpscaleProgress {
                                    id,
                                    progress: 100,
                                    message: "Done".to_string(),
                                });
                                let _ = app_clone.emit("images-updated", ());
                                return true;
                            }
                        },
                        Ok(Err(e)) => {
                            log::error!("Upscaling error for ID {}: {}", id, e);
                            let _ = fs::remove_file(&temp_filepath);
                        },
                        Err(e) => {
                            log::error!("Tokio spawn error for ID {}: {}", id, e);
                            let _ = fs::remove_file(&temp_filepath);
                        }
                    }
                    
                    let _ = app_clone.emit("upscale-progress", UpscaleProgress {
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

    let upscaled_count = results.into_iter().filter(|&success| success).count();

    Ok(upscaled_count)
}

#[tauri::command]
pub async fn get_all_upscaled_images(
    state: State<'_, DbState>,
) -> Result<Vec<crate::crud::images::Image>, String> {
    let pool = state.0.clone();
    
    let images = sqlx::query_as::<_, (i64, String, String, i64, String, i64, Option<i64>, Option<i64>, Option<i64>)>(
        r#"
        SELECT 
            i.id, i.filename, u.filepath, u.scale_factor, u.model_used, u.size,
            i.width, i.height, i.size
        FROM images i
        INNER JOIN upscaled_images u ON i.id = u.original_id
        ORDER BY i.id DESC, u.scale_factor ASC
        "#
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let result: Vec<crate::crud::images::Image> = images.into_iter().map(|row| {
        // Create a JSON array with a single upscaled version for each row
        let upscaled_json = format!(
            r#"[{{"scale":{},"filepath":"{}","size":{},"model":"{}"}}]"#,
            row.3,
            row.2.replace('\\', "\\\\").replace('"', "\\\""),
            row.5,
            row.4.replace('\\', "\\\\").replace('"', "\\\"")
        );
        
        crate::crud::images::Image {
            id: row.0,
            filename: row.1,
            filepath: row.2.clone(),
            mimetype: None,
            size: Some(row.5),
            width: row.6,
            height: row.7,
            compressed_filepath: None,
            compressed_size: None,
            upscaled_versions: upscaled_json,
            bg_removed_filepath: None,
            bg_removed_size: None,
        }
    }).collect();

    Ok(result)
}
