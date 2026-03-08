use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};
use anyhow::{Context, Result};
use serde::Serialize;
use crate::DbState;
use futures::{stream, StreamExt};

#[derive(Clone, Serialize)]
pub struct CompressionProgress {
    pub id: i64,
    pub progress: u8,
    pub message: String,
}

#[tauri::command]
pub async fn compress_images_by_ids(
    app: AppHandle,
    state: State<'_, DbState>,
    ids: Vec<i64>,
    quality: u8,
) -> Result<usize, String> {
    let pool = state.0.clone();

    // Fetch the output directory setting once before starting tasks
    let output_dir_setting: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'output'")
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

    // Limit concurrency to the number of CPU cores to prevent thrashing and SQLite connection pool exhaustion
    let concurrency_limit = num_cpus::get().max(2);

    let results: Vec<bool> = stream::iter(ids.into_iter())
        .map(|id| {
            let app_clone = app.clone();
            let pool_clone = pool.clone();
            let output_dir_clone = output_dir_setting.clone();

            async move {
                let image_record: Option<(String,)> = sqlx::query_as("SELECT filepath FROM images WHERE id = ?")
                    .bind(id)
                    .fetch_optional(&pool_clone)
                    .await
                    .ok()
                    .flatten();

                if let Some((filepath,)) = image_record {
                    let _ = app_clone.emit("compression-progress", CompressionProgress {
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
                    let new_filename = format!("{}_compressed.{}", file_stem, ext);
                    
                    // Determine save destination (Output Dir vs Original Dir)
                    let final_filepath = match &output_dir_clone {
                        Some(dir) if PathBuf::from(dir).exists() => PathBuf::from(dir).join(&new_filename),
                        _ => orig_path.with_file_name(&new_filename),
                    };

                    // Use a temporary file for atomic saving to prevent corruption on crash
                    let temp_filename = format!("{}.tmp", new_filename);
                    let temp_filepath = match &output_dir_clone {
                        Some(dir) if PathBuf::from(dir).exists() => PathBuf::from(dir).join(&temp_filename),
                        _ => orig_path.with_file_name(&temp_filename),
                    };

                    let _ = app_clone.emit("compression-progress", CompressionProgress {
                        id,
                        progress: 30,
                        message: "Decoding...".to_string(),
                    });

                    let temp_filepath_clone = temp_filepath.clone();
                    let orig_path_clone = orig_path.clone();
                    let app_inner = app_clone.clone();
                    let id_inner = id;
                    let ext_lower = ext.to_lowercase();
                    
                    let compress_result = tauri::async_runtime::spawn_blocking(move || -> Result<()> {
                        let img_data = image::open(&orig_path_clone).context("Failed to open image")?;
                        
                        let _ = app_inner.emit("compression-progress", CompressionProgress {
                            id: id_inner,
                            progress: 60,
                            message: format!("Compressing to {}%...", quality),
                        });

                        let mut out_file = fs::File::create(&temp_filepath_clone)?;
                        
                        if ext_lower == "jpg" || ext_lower == "jpeg" {
                            let mut encoder = jpeg_encoder::Encoder::new(&mut out_file, quality);
                            encoder.set_optimized_huffman_tables(true);
                            encoder.set_sampling_factor(jpeg_encoder::SamplingFactor::F_2_2);
                            
                            let img_rgb = img_data.to_rgb8();
                            encoder.encode(img_rgb.as_raw(), img_rgb.width() as u16, img_rgb.height() as u16, jpeg_encoder::ColorType::Rgb).context("JPEG Encode failed")?;
                        } else if ext_lower == "png" {
                            // Extreme lossy compression for PNG using imagequant (TinyPNG style)
                            let rgba = img_data.to_rgba8();
                            let mut liq = imagequant::new();
                            
                            liq.set_quality(0, quality).context("Failed to set PNG quality")?;
                            liq.set_speed(4).context("Failed to set PNG speed")?;
                            
                            let mut img_quant = liq.new_image_borrowed(rgb::FromSlice::as_rgba(rgba.as_raw().as_slice()), rgba.width() as usize, rgba.height() as usize, 0.0)
                                .context("Failed to create imagequant image")?;
                            
                            let mut res = liq.quantize(&mut img_quant).context("PNG Quantization failed")?;
                            
                            let (palette, pixels) = res.remapped(&mut img_quant).context("PNG Remapping failed")?;
                            
                            let mut palette_bytes = Vec::with_capacity(palette.len() * 3);
                            let mut trns_bytes = Vec::with_capacity(palette.len());
                            
                            for color in palette {
                                palette_bytes.push(color.r);
                                palette_bytes.push(color.g);
                                palette_bytes.push(color.b);
                                trns_bytes.push(color.a);
                            }
                            
                            let mut encoder = png::Encoder::new(&mut out_file, rgba.width() as u32, rgba.height() as u32);
                            encoder.set_color(png::ColorType::Indexed);
                            encoder.set_depth(png::BitDepth::Eight);
                            encoder.set_palette(palette_bytes);
                            encoder.set_trns(trns_bytes);
                            
                            let mut writer = encoder.write_header().context("Failed to write PNG header")?;
                            writer.write_image_data(&pixels).context("Failed to write paletted PNG data")?;
                        } else {
                            // Default save for WebP and others
                            img_data.save(&temp_filepath_clone).context("Image save failed")?;
                        }

                        // Explicitly sync to ensure data is completely written before rename
                        out_file.sync_all().context("Failed to sync file to disk")?;

                        let _ = app_inner.emit("compression-progress", CompressionProgress {
                            id: id_inner,
                            progress: 90,
                            message: "Saving to DB...".to_string(),
                        });
                        
                        Ok(())
                    }).await;

                    match compress_result {
                        Ok(Ok(_)) => {
                            // Atomic rename: move .tmp to final path only if compression fully succeeded
                            if let Err(e) = fs::rename(&temp_filepath, &final_filepath) {
                                log::error!("Failed to rename temp file: {}", e);
                                let _ = fs::remove_file(&temp_filepath); // Clean up temp file
                                return false;
                            }

                            let size = fs::metadata(&final_filepath).map(|m| m.len() as i64).ok();
                            let fp = dunce::canonicalize(&final_filepath).unwrap_or(final_filepath).to_string_lossy().to_string();
                            
                            let insert_result = sqlx::query(
                                "INSERT OR REPLACE INTO compressed_images (original_id, filepath, size) VALUES (?, ?, ?)"
                            )
                            .bind(id)
                            .bind(fp)
                            .bind(size)
                            .execute(&pool_clone)
                            .await;

                            if insert_result.is_ok() {
                                let _ = app_clone.emit("compression-progress", CompressionProgress {
                                    id,
                                    progress: 100,
                                    message: "Done".to_string(),
                                });
                                let _ = app_clone.emit("images-updated", ());
                                return true;
                            }
                        },
                        Ok(Err(e)) => {
                            log::error!("Compression error for ID {}: {}", id, e);
                            let _ = fs::remove_file(&temp_filepath); // Clean up partial temp file
                        },
                        Err(e) => {
                            log::error!("Tokio spawn error for ID {}: {}", id, e);
                            let _ = fs::remove_file(&temp_filepath);
                        }
                    }
                    
                    let _ = app_clone.emit("compression-progress", CompressionProgress {
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

