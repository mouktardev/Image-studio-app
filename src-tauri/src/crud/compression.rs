use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};
use anyhow::{Context, Result};
use serde::Serialize;
use crate::DbState;

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
    let mut tasks = Vec::new();
    let pool = state.0.clone();

    for id in ids {
        let app_clone = app.clone();
        let pool_clone = pool.clone();

        // Spawn a new task for each image to process concurrently
        let task = tauri::async_runtime::spawn(async move {
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
                let new_filepath = orig_path.with_file_name(&new_filename);

                let _ = app_clone.emit("compression-progress", CompressionProgress {
                    id,
                    progress: 30,
                    message: "Decoding...".to_string(),
                });

                let new_filepath_clone = new_filepath.clone();
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

                    let mut out_file = fs::File::create(&new_filepath_clone)?;
                    
                    if ext_lower == "jpg" || ext_lower == "jpeg" {
                        let mut encoder = jpeg_encoder::Encoder::new(&mut out_file, quality);
                        // Optimized Huffman tables shrink the size further without quality loss
                        encoder.set_optimized_huffman_tables(true);
                        // 4:2:0 subsampling significantly reduces size for web
                        encoder.set_sampling_factor(jpeg_encoder::SamplingFactor::F_2_2);
                        
                        let img_rgb = img_data.to_rgb8();
                        encoder.encode(img_rgb.as_raw(), img_rgb.width() as u16, img_rgb.height() as u16, jpeg_encoder::ColorType::Rgb).context("JPEG Encode failed")?;
                    } else if ext_lower == "png" {
                        // Extreme lossy compression for PNG using imagequant (TinyPNG style)
                        let rgba = img_data.to_rgba8();
                        let mut liq = imagequant::new();
                        
                        // Map 1-100 quality slider to imagequant parameters.
                        // Imagequant accepts 0-100. Lower means more compression (fewer colors).
                        liq.set_quality(0, quality).context("Failed to set PNG quality")?;
                        liq.set_speed(4).context("Failed to set PNG speed")?;
                        
                        let mut img_quant = liq.new_image_borrowed(rgb::FromSlice::as_rgba(rgba.as_raw().as_slice()), rgba.width() as usize, rgba.height() as usize, 0.0)
                            .context("Failed to create imagequant image")?;
                        
                        let mut res = liq.quantize(&mut img_quant).context("PNG Quantization failed")?;
                        
                        let (palette, pixels) = res.remapped(&mut img_quant).context("PNG Remapping failed")?;
                        
                        // Write the paletted image using standard PngEncoder
                        // Convert the palette from imagequant's RGBA struct to a flat byte array
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
                        img_data.save(&new_filepath_clone).context("Image save failed")?;
                    }

                    let _ = app_inner.emit("compression-progress", CompressionProgress {
                        id: id_inner,
                        progress: 90,
                        message: "Saving to DB...".to_string(),
                    });
                    
                    Ok(())
                }).await;

                match compress_result {
                    Ok(Ok(_)) => {
                        let size = fs::metadata(&new_filepath).map(|m| m.len() as i64).ok();
                        let fp = dunce::canonicalize(&new_filepath).unwrap_or(new_filepath).to_string_lossy().to_string();
                        
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
                            // Emit update immediately so UI updates for this single image
                            let _ = app_clone.emit("images-updated", ());
                            return true;
                        }
                    },
                    Ok(Err(e)) => {
                        log::error!("Compression error for ID {}: {}", id, e);
                    },
                    Err(e) => {
                        log::error!("Tokio spawn error for ID {}: {}", id, e);
                    }
                }
                
                let _ = app_clone.emit("compression-progress", CompressionProgress {
                    id,
                    progress: 0,
                    message: "Failed".to_string(),
                });
            }
            false
        });
        
        tasks.push(task);
    }

    let mut compressed_count = 0;
    for task in tasks {
        if let Ok(success) = task.await {
            if success {
                compressed_count += 1;
            }
        }
    }

    Ok(compressed_count)
}
