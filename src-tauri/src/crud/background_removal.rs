use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use anyhow::{Context, Result};
use serde::Serialize;
use image::{DynamicImage, GenericImageView, ImageBuffer, Rgba};
use crate::DbState;
use futures::{stream, StreamExt};
use hf_hub::api::sync::Api;
use ort::{Environment, SessionBuilder, Value};
use ndarray::{Array, Axis};

const MODEL_NAME: &str = "bria-rmbg-1.4";
const HF_REPO: &str = "briaai/RMBG-1.4";
const MODEL_FILENAME: &str = "onnx/model.onnx";

#[derive(Clone, Serialize)]
pub struct BgRemovalProgress {
    pub id: i64,
    pub progress: u8,
    pub message: String,
}

#[derive(Clone, Serialize)]
pub struct BgRemovalModelStatus {
    pub name: String,
    pub downloaded: bool,
    pub path: String,
    pub size: Option<i64>,
}

fn get_hf_cache_dir() -> Result<PathBuf> {
    let home = dirs::home_dir().context("Failed to get home directory")?;
    let cache_dir = home
        .join(".cache")
        .join("huggingface")
        .join("hub");
    Ok(cache_dir)
}

pub fn check_model_downloaded() -> Result<(PathBuf, i64), String> {
    let cache_dir = get_hf_cache_dir().map_err(|e| e.to_string())?;
    
    let filename = MODEL_FILENAME.split('/').last().unwrap_or(MODEL_FILENAME);
    let repo_id_safe = HF_REPO.replace('/', "--");
    
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
                    let subfolder_path = entry_path.join(MODEL_FILENAME);
                    if subfolder_path.exists() {
                        let size = fs::metadata(&subfolder_path).map(|m| m.len() as i64).unwrap_or(0);
                        return Ok((subfolder_path, size));
                    }
                }
            }
        }
    }
    
    Err(format!("Model {} not found in cache", MODEL_NAME))
}



#[tauri::command]
pub async fn get_bg_removal_model_status() -> Result<BgRemovalModelStatus, String> {
    let cache_dir = get_hf_cache_dir().map_err(|e| e.to_string())?;
    
    let filename = MODEL_FILENAME.split('/').last().unwrap_or(MODEL_FILENAME);
    let repo_id_safe = HF_REPO.replace('/', "--");
    
    let model_dir = cache_dir.join(format!("models--{}", repo_id_safe));
    let snapshots_dir = model_dir.join("snapshots");
    
    let mut found_path: Option<PathBuf> = None;
    
    if snapshots_dir.exists() {
        if let Ok(entries) = fs::read_dir(&snapshots_dir) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if entry_path.is_dir() {
                    let direct_file = entry_path.join(filename);
                    if direct_file.exists() {
                        found_path = Some(direct_file);
                        break;
                    }
                    
                    let subfolder_path = entry_path.join(MODEL_FILENAME);
                    if subfolder_path.exists() {
                        found_path = Some(subfolder_path);
                        break;
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
    
    Ok(BgRemovalModelStatus {
        name: MODEL_NAME.to_string(),
        downloaded: found_path.is_some(),
        path: model_path,
        size: model_size,
    })
}

#[tauri::command]
pub async fn download_bg_removal_model(
    app: AppHandle,
) -> Result<String, String> {
    let _ = app.emit("bg-removal-model-download-progress", BgRemovalProgress {
        id: 0,
        progress: 0,
        message: "Connecting to HuggingFace...".to_string(),
    });

    let _ = app.emit("bg-removal-model-download-progress", BgRemovalProgress {
        id: 0,
        progress: 10,
        message: "Downloading BRIA RMBG-1.4 model...".to_string(),
    });

    let model_path = tauri::async_runtime::spawn_blocking(move || -> Result<PathBuf, String> {
        let api = Api::new().map_err(|e| format!("Failed to initialize HF Api: {}", e))?;
        let repo = api.model(HF_REPO.to_string());
        let path = repo.get(MODEL_FILENAME).map_err(|e| format!("Failed to download model: {}", e))?;
        Ok(path)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    let _ = app.emit("bg-removal-model-download-progress", BgRemovalProgress {
        id: 0,
        progress: 100,
        message: "Download complete".to_string(),
    });

    Ok(model_path.to_string_lossy().to_string())
}

pub fn create_onnx_session(model_path: &PathBuf) -> Result<ort::Session> {
    let environment = Arc::new(
        Environment::builder()
            .build()
            .map_err(|e| anyhow::anyhow!("Failed to create ONNX Runtime environment: {}", e))?,
    );
    SessionBuilder::new(&environment)
        .and_then(|b| b.with_optimization_level(ort::GraphOptimizationLevel::Level3))
        .and_then(|b| b.with_intra_threads(0))
        .and_then(|b| b.with_model_from_file(model_path))
        .map_err(|e| anyhow::anyhow!("Failed to create ONNX session: {}", e))
}

pub fn apply_bg_removal(
    original_image: &DynamicImage,
    session: &ort::Session,
) -> Result<ImageBuffer<Rgba<u8>, Vec<u8>>> {
    let (orig_width, orig_height) = original_image.dimensions();
    let resized_image = original_image.resize_exact(1024, 1024, image::imageops::FilterType::Lanczos3);

    let mut input_array = Array::zeros((1, 3, 1024, 1024));
    for y in 0..1024 {
        for x in 0..1024 {
            let pixel = resized_image.get_pixel(x, y);
            input_array[[0, 0, y as usize, x as usize]] = pixel[0] as f32 / 255.0;
            input_array[[0, 1, y as usize, x as usize]] = pixel[1] as f32 / 255.0;
            input_array[[0, 2, y as usize, x as usize]] = pixel[2] as f32 / 255.0;
        }
    }

    let input_tensor_values = ndarray::CowArray::from(input_array).into_dyn();
    let input_tensor = Value::from_array(session.allocator(), &input_tensor_values)
        .map_err(|e| anyhow::anyhow!("Failed to create input tensor: {}", e))?;

    let outputs = session
        .run(vec![input_tensor])
        .map_err(|e| anyhow::anyhow!("ONNX inference failed: {}", e))?;

    let output_tensor_value = &outputs[0];
    let extracted_tensor: ort::tensor::OrtOwnedTensor<f32, _> = output_tensor_value
        .try_extract()
        .map_err(|e| anyhow::anyhow!("Failed to extract output tensor: {}", e))?;
    let output_view = extracted_tensor.view();
    let mask = output_view.to_owned().remove_axis(Axis(0));

    let mut mask_image: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::new(1024, 1024);
    for y in 0..1024 {
        for x in 0..1024 {
            let mask_value = (mask[[0, y as usize, x as usize]].clamp(0.0, 1.0) * 255.0) as u8;
            mask_image.put_pixel(x, y, Rgba([mask_value, mask_value, mask_value, 255]));
        }
    }

    let mask_dynamic = image::DynamicImage::ImageRgba8(mask_image);
    let resized_mask = mask_dynamic.resize_exact(orig_width, orig_height, image::imageops::FilterType::Triangle);
    let final_mask = resized_mask.to_rgba8();

    let mut result_img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::new(orig_width, orig_height);
    for y in 0..orig_height {
        for x in 0..orig_width {
            let orig_pixel = original_image.get_pixel(x, y);
            let mask_pixel = final_mask.get_pixel(x, y);
            let alpha = mask_pixel[0];
            result_img.put_pixel(x, y, Rgba([orig_pixel[0], orig_pixel[1], orig_pixel[2], alpha]));
        }
    }

    Ok(result_img)
}

fn run_bg_removal_inference(
    input_path: &PathBuf,
    output_path: &PathBuf,
    model_path: &PathBuf,
    _app: Option<AppHandle>,
    _image_id: i64,
) -> Result<()> {
    let session = create_onnx_session(model_path)?;
    let original_image = image::open(input_path).context("Failed to open image")?;
    let result_img = apply_bg_removal(&original_image, &session)?;

    if let Some(parent) = output_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).with_context(|| format!("Failed to create output directory: {}", parent.display()))?;
        }
    }

    result_img.save(output_path).with_context(|| format!("Failed to save output image to: {}", output_path.display()))?;
    Ok(())
}

#[tauri::command]
pub async fn remove_background_by_ids(
    app: AppHandle,
    state: State<'_, DbState>,
    ids: Vec<i64>,
) -> Result<usize, String> {
    let pool = state.0.clone();
    
    // Check if model is downloaded
    let (model_path, _model_size) = check_model_downloaded()?;
    
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
            
            async move {
                let image_record: Option<(String,)> = sqlx::query_as("SELECT filepath FROM images WHERE id = ?")
                    .bind(id)
                    .fetch_optional(&pool_clone)
                    .await
                    .ok()
                    .flatten();

                if let Some((filepath,)) = image_record {
                    let _ = app_clone.emit("bg-removal-progress", BgRemovalProgress {
                        id,
                        progress: 10,
                        message: "Reading...".to_string(),
                    });

                    let orig_path = PathBuf::from(&filepath);
                    if !orig_path.exists() {
                        return false;
                    }

                    let file_stem = orig_path.file_stem().unwrap_or_default().to_string_lossy();
                    // Always output PNG for background removal
                    let new_filename = format!("{}_no_bg.png", file_stem);
                    
                    let final_filepath = match &output_dir_clone {
                        Some(dir) if PathBuf::from(dir).exists() => PathBuf::from(dir).join(&new_filename),
                        _ => orig_path.with_file_name(&new_filename),
                    };

                    // Use .tmp.png extension so image crate can detect format properly
                    let temp_filename = format!("{}.tmp.png", file_stem);
                    let temp_filepath = match &output_dir_clone {
                        Some(dir) if PathBuf::from(dir).exists() => PathBuf::from(dir).join(&temp_filename),
                        _ => orig_path.with_file_name(&temp_filename),
                    };

                    let _ = app_clone.emit("bg-removal-progress", BgRemovalProgress {
                        id,
                        progress: 20,
                        message: "Processing...".to_string(),
                    });

                    let temp_filepath_clone = temp_filepath.clone();
                    let app_for_blocking = app_clone.clone();
                    let removal_result = tauri::async_runtime::spawn_blocking(move || -> Result<()> {
                        run_bg_removal_inference(
                            &orig_path,
                            &temp_filepath_clone,
                            &model_path_clone,
                            Some(app_for_blocking),
                            id,
                        )
                    }).await;

                    match removal_result {
                        Ok(Ok(_)) => {
                            // Delete existing file if it exists (Windows requires this before rename)
                            if final_filepath.exists() {
                                if let Err(e) = fs::remove_file(&final_filepath) {
                                    log::error!("Failed to remove existing file {}: {}", final_filepath.display(), e);
                                }
                            }
                            
                            if let Err(e) = fs::rename(&temp_filepath, &final_filepath) {
                                log::error!("Failed to rename temp file from {} to {}: {}", temp_filepath.display(), final_filepath.display(), e);
                                let _ = fs::remove_file(&temp_filepath);
                                return false;
                            }

                            let size = fs::metadata(&final_filepath).map(|m| m.len() as i64).ok();
                            let fp = dunce::canonicalize(&final_filepath).unwrap_or(final_filepath).to_string_lossy().to_string();
                            
                            let insert_result = sqlx::query(
                                "INSERT OR REPLACE INTO bg_removed_images (original_id, filepath, size, model_used) VALUES (?, ?, ?, ?)"
                            )
                            .bind(id)
                            .bind(fp)
                            .bind(size)
                            .bind(MODEL_NAME)
                            .execute(&pool_clone)
                            .await;

                            if insert_result.is_ok() {
                                let _ = app_clone.emit("bg-removal-progress", BgRemovalProgress {
                                    id,
                                    progress: 100,
                                    message: "Done".to_string(),
                                });
                                let _ = app_clone.emit("images-updated", ());
                                return true;
                            }
                        },
                        Ok(Err(e)) => {
                            log::error!("Background removal error for ID {}: {}", id, e);
                            let _ = fs::remove_file(&temp_filepath);
                        },
                        Err(e) => {
                            log::error!("Tokio spawn error for ID {}: {}", id, e);
                            let _ = fs::remove_file(&temp_filepath);
                        }
                    }
                    
                    let _ = app_clone.emit("bg-removal-progress", BgRemovalProgress {
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

    let processed_count = results.into_iter().filter(|&success| success).count();

    Ok(processed_count)
}

#[tauri::command]
pub async fn get_all_bg_removed_images(
    state: State<'_, DbState>,
) -> Result<Vec<crate::crud::images::Image>, String> {
    let pool = state.0.clone();
    
    let images = sqlx::query_as::<_, (i64, String, String, String, i64, Option<i64>, Option<i64>, Option<i64>)>(
        r#"
        SELECT 
            i.id, i.filename, b.filepath, b.model_used, b.size,
            i.width, i.height, i.size
        FROM images i
        INNER JOIN bg_removed_images b ON i.id = b.original_id
        ORDER BY i.id DESC
        "#
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let result: Vec<crate::crud::images::Image> = images.into_iter().map(|row| {
        crate::crud::images::Image {
            id: row.0,
            filename: row.1,
            filepath: row.2.clone(),
            mimetype: Some("image/png".to_string()),
            size: Some(row.4),
            width: row.5,
            height: row.6,
            compressed_filepath: None,
            compressed_size: None,
            upscaled_versions: "[]".to_string(),
            bg_removed_filepath: Some(row.2),
            bg_removed_size: Some(row.4),
        }
    }).collect();

    Ok(result)
}
