use dunce::canonicalize;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::State;

use crate::DbState;

const SUPPORTED_IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "tif", "avif"];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Image {
    pub id: i64,
    pub filename: String,
    pub filepath: String,
    pub mimetype: Option<String>,
    pub size: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub compressed_filepath: Option<String>,
    pub compressed_size: Option<i64>,
    #[serde(default)]
    pub upscaled_versions: String,  // JSON array of upscaled versions
    #[serde(default)]
    pub bg_removed_filepath: Option<String>,
    #[serde(default)]
    pub bg_removed_size: Option<i64>,
    #[serde(default)]
    pub converted_filepath: Option<String>,
    #[serde(default)]
    pub converted_size: Option<i64>,
    #[serde(default)]
    pub converted_format: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ImageQueryParams {
    pub search: Option<String>,
    pub sort_field: String,  // 'name', 'size', 'date'
    pub sort_order: String,  // 'asc', 'desc'
}

#[derive(Debug, Deserialize)]
pub struct AddImageData {
    pub filename: String,
    pub filepath: String,
    pub mimetype: Option<String>,
    pub size: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageMetadata {
    pub width: u32,
    pub height: u32,
    pub size: u64,
    pub mimetype: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported: i64,
    pub duplicates: i64,
    pub failed: i64,
}

#[tauri::command]
pub async fn get_all_images(
    state: State<'_, DbState>,
    params: Option<ImageQueryParams>,
) -> Result<Vec<Image>, String> {
    let pool = &state.0;
    
    // Build the ORDER BY clause based on sort parameters
    let order_clause = if let Some(ref p) = params {
        let sort_field = match p.sort_field.as_str() {
            "name" => "i.filename",
            "size" => "i.size",
            _ => "i.id", // date default
        };
        let sort_order = if p.sort_order == "asc" { "ASC" } else { "DESC" };
        format!("ORDER BY {} {}", sort_field, sort_order)
    } else {
        "ORDER BY i.id DESC".to_string()
    };
    
    // Build search clause if search query provided
    let search_clause = if let Some(ref p) = params {
        if let Some(ref search) = p.search {
            if !search.is_empty() {
                format!("WHERE LOWER(i.filename) LIKE LOWER('%{}%')", search.replace("'", "''"))
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
        "SELECT 
            i.id, i.filename, i.filepath, i.mimetype, i.size, i.width, i.height,
            ci.filepath as compressed_filepath, ci.size as compressed_size,
            COALESCE(json_group_array(
                json_object(
                    'scale', u.scale_factor,
                    'filepath', u.filepath,
                    'size', u.size,
                    'model', u.model_used
                )
            ), '[]') as upscaled_versions,
            bi.filepath as bg_removed_filepath, bi.size as bg_removed_size,
            cvi.filepath as converted_filepath, cvi.size as converted_size, cvi.format as converted_format
         FROM images i
         LEFT JOIN compressed_images ci ON ci.original_id = i.id
         LEFT JOIN upscaled_images u ON u.original_id = i.id
         LEFT JOIN bg_removed_images bi ON bi.original_id = i.id
         LEFT JOIN converted_images cvi ON cvi.original_id = i.id
         {}
         GROUP BY i.id
         {}",
        search_clause,
        order_clause
    );
    
    let rows = sqlx::query_as::<_, (i64, String, String, Option<String>, Option<i64>, Option<i64>, Option<i64>, Option<String>, Option<i64>, String, Option<String>, Option<i64>, Option<String>, Option<i64>, Option<String>)>(&query)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let images: Vec<Image> = rows
        .into_iter()
        .map(|(id, filename, filepath, mimetype, size, width, height, compressed_filepath, compressed_size, upscaled_versions, bg_removed_filepath, bg_removed_size, converted_filepath, converted_size, converted_format)| {
            Image { 
                id, filename, filepath, mimetype, size, width, height, 
                compressed_filepath, compressed_size,
                upscaled_versions,
                bg_removed_filepath,
                bg_removed_size,
                converted_filepath,
                converted_size,
                converted_format,
            }
        })
        .collect();

    Ok(images)
}

#[tauri::command]
pub async fn get_all_compressed_images(state: State<'_, DbState>) -> Result<Vec<Image>, String> {
    let rows = sqlx::query_as::<_, (i64, String, String, Option<String>, Option<i64>, Option<i64>, Option<i64>, Option<String>, Option<i64>, String, Option<String>, Option<i64>, Option<String>, Option<i64>, Option<String>)>(
        "SELECT 
            i.id, i.filename, ci.filepath, i.mimetype, ci.size, i.width, i.height,
            ci.filepath as compressed_filepath, ci.size as compressed_size,
            COALESCE(json_group_array(
                json_object(
                    'scale', u.scale_factor,
                    'filepath', u.filepath,
                    'size', u.size,
                    'model', u.model_used
                )
            ), '[]') as upscaled_versions,
            bi.filepath as bg_removed_filepath, bi.size as bg_removed_size,
            cvi.filepath as converted_filepath, cvi.size as converted_size, cvi.format as converted_format
         FROM images i
         INNER JOIN compressed_images ci ON ci.original_id = i.id
         LEFT JOIN upscaled_images u ON u.original_id = i.id
         LEFT JOIN bg_removed_images bi ON bi.original_id = i.id
         LEFT JOIN converted_images cvi ON cvi.original_id = i.id
         GROUP BY i.id, ci.id
         ORDER BY ci.id DESC"
    )
    .fetch_all(&state.0)
    .await
    .map_err(|e| e.to_string())?;

    let images: Vec<Image> = rows
        .into_iter()
        .map(|(id, filename, filepath, mimetype, size, width, height, compressed_filepath, compressed_size, upscaled_versions, bg_removed_filepath, bg_removed_size, converted_filepath, converted_size, converted_format)| {
            Image { 
                id, filename, filepath, mimetype, size, width, height, 
                compressed_filepath, compressed_size,
                upscaled_versions,
                bg_removed_filepath,
                bg_removed_size,
                converted_filepath,
                converted_size,
                converted_format,
            }
        })
        .collect();

    Ok(images)
}

#[tauri::command]
pub async fn get_all_converted_images(state: State<'_, DbState>) -> Result<Vec<Image>, String> {
    let rows = sqlx::query_as::<_, (i64, String, String, Option<String>, Option<i64>, Option<i64>, Option<i64>, Option<String>, Option<i64>, String, Option<String>, Option<i64>, Option<String>, Option<i64>, Option<String>)>(
        "SELECT 
            i.id, i.filename, cvi.filepath, i.mimetype, cvi.size, i.width, i.height,
            ci.filepath as compressed_filepath, ci.size as compressed_size,
            COALESCE(json_group_array(
                json_object(
                    'scale', u.scale_factor,
                    'filepath', u.filepath,
                    'size', u.size,
                    'model', u.model_used
                )
            ), '[]') as upscaled_versions,
            bi.filepath as bg_removed_filepath, bi.size as bg_removed_size,
            cvi.filepath as converted_filepath, cvi.size as converted_size, cvi.format as converted_format
         FROM images i
         INNER JOIN converted_images cvi ON cvi.original_id = i.id
         LEFT JOIN compressed_images ci ON ci.original_id = i.id
         LEFT JOIN upscaled_images u ON u.original_id = i.id
         LEFT JOIN bg_removed_images bi ON bi.original_id = i.id
         GROUP BY i.id, cvi.id
         ORDER BY cvi.id DESC"
    )
    .fetch_all(&state.0)
    .await
    .map_err(|e| e.to_string())?;

    let images: Vec<Image> = rows
        .into_iter()
        .map(|(id, filename, filepath, mimetype, size, width, height, compressed_filepath, compressed_size, upscaled_versions, bg_removed_filepath, bg_removed_size, converted_filepath, converted_size, converted_format)| {
            Image { 
                id, filename, filepath, mimetype, size, width, height, 
                compressed_filepath, compressed_size,
                upscaled_versions,
                bg_removed_filepath,
                bg_removed_size,
                converted_filepath,
                converted_size,
                converted_format,
            }
        })
        .collect();

    Ok(images)
}

#[tauri::command]
pub async fn add_image(data: AddImageData, state: State<'_, DbState>) -> Result<Image, String> {
    let path = PathBuf::from(&data.filepath);
    let canonical_path = canonicalize(&path)
        .map_err(|e| format!("Failed to canonicalize path: {}", e))?;
    let filepath = canonical_path
        .to_str()
        .map(|s| s.to_string())
        .unwrap_or(data.filepath);

    let result = sqlx::query(
        "INSERT INTO images (filename, filepath, mimetype, size, width, height) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&data.filename)
    .bind(&filepath)
    .bind(&data.mimetype)
    .bind(data.size)
    .bind(data.width)
    .bind(data.height)
    .execute(&state.0)
    .await
    .map_err(|e| e.to_string())?;

    let id = result.last_insert_rowid();

    Ok(Image {
        id,
        filename: data.filename,
        filepath,
        mimetype: data.mimetype,
        size: data.size,
        width: data.width,
        height: data.height,
        compressed_filepath: None,
        compressed_size: None,
        upscaled_versions: "[]".to_string(),
        bg_removed_filepath: None,
        bg_removed_size: None,
        converted_filepath: None,
        converted_size: None,
        converted_format: None,
    })
}

#[tauri::command]
pub async fn import_images_bulk(
    filepaths: Vec<String>,
    state: State<'_, DbState>,
) -> Result<ImportResult, String> {
    let mut imported: i64 = 0;
    let mut duplicates: i64 = 0;
    let mut failed: i64 = 0;

    // Prepare all image data before touching the DB
    struct ImageRow {
        filename: String,
        filepath: String,
        mimetype: String,
        size: i64,
        width: i64,
        height: i64,
    }

    let mut rows: Vec<ImageRow> = Vec::with_capacity(filepaths.len());

    for filepath in &filepaths {
        let path = PathBuf::from(filepath);

        // Validate file extension first
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());

        if let Some(extension) = ext.as_deref() {
            if !SUPPORTED_IMAGE_EXTENSIONS.contains(&extension) {
                failed += 1;
                continue;
            }
        } else {
            // No extension - skip
            failed += 1;
            continue;
        }

        let canonical_path = match canonicalize(&path) {
            Ok(p) => p,
            Err(_) => { failed += 1; continue; }
        };

        let filename = canonical_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let mimetype = match ext.as_deref() {
            Some("png") => "image/png",
            Some("jpg") | Some("jpeg") => "image/jpeg",
            Some("gif") => "image/gif",
            Some("webp") => "image/webp",
            Some("bmp") => "image/bmp",
            Some("tiff") | Some("tif") => "image/tiff",
            Some("avif") => "image/avif",
            _ => "application/octet-stream",
        }.to_string();

        let size = match fs::metadata(&canonical_path) {
            Ok(m) => m.len() as i64,
            Err(_) => 0,
        };

        // imagesize only reads the image header - much faster than full decode
        let (width, height) = match imagesize::size(&canonical_path) {
            Ok(dim) => (dim.width as i64, dim.height as i64),
            Err(_) => (0, 0),
        };

        let fp = canonical_path
            .to_str()
            .unwrap_or(filepath)
            .to_string();

        rows.push(ImageRow { filename, filepath: fp, mimetype, size, width, height });
    }

    // Bulk insert in a single transaction
    let mut tx = state.0.begin().await.map_err(|e| e.to_string())?;

    for row in &rows {
        let result = sqlx::query(
            "INSERT OR IGNORE INTO images (filename, filepath, mimetype, size, width, height) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(&row.filename)
        .bind(&row.filepath)
        .bind(&row.mimetype)
        .bind(row.size)
        .bind(row.width)
        .bind(row.height)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if result.rows_affected() == 0 {
            duplicates += 1;
        } else {
            imported += 1;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(ImportResult { imported, duplicates, failed })
}

#[tauri::command]
pub async fn delete_image(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    sqlx::query("DELETE FROM compressed_images WHERE original_id = ?")
        .bind(id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM upscaled_images WHERE original_id = ?")
        .bind(id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM bg_removed_images WHERE original_id = ?")
        .bind(id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM images WHERE id = ?")
        .bind(id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_images_by_ids(ids: Vec<i64>, state: State<'_, DbState>) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }

    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    
    // Also explicitly delete compressed images
    let ci_query = format!("DELETE FROM compressed_images WHERE original_id IN ({})", placeholders);
    let mut ci_q = sqlx::query(&ci_query);
    for id in &ids {
        ci_q = ci_q.bind(id);
    }
    ci_q.execute(&state.0).await.map_err(|e| e.to_string())?;

    // Also explicitly delete upscaled images
    let ui_query = format!("DELETE FROM upscaled_images WHERE original_id IN ({})", placeholders);
    let mut ui_q = sqlx::query(&ui_query);
    for id in &ids {
        ui_q = ui_q.bind(id);
    }
    ui_q.execute(&state.0).await.map_err(|e| e.to_string())?;

    // Also explicitly delete background removed images
    let bi_query = format!("DELETE FROM bg_removed_images WHERE original_id IN ({})", placeholders);
    let mut bi_q = sqlx::query(&bi_query);
    for id in &ids {
        bi_q = bi_q.bind(id);
    }
    bi_q.execute(&state.0).await.map_err(|e| e.to_string())?;

    let query = format!("DELETE FROM images WHERE id IN ({})", placeholders);
    let mut q = sqlx::query(&query);
    for id in &ids {
        q = q.bind(id);
    }

    q.execute(&state.0).await.map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_image_metadata(filepath: String) -> Result<ImageMetadata, String> {
    let path = PathBuf::from(&filepath);
    let canonical_path = canonicalize(&path)
        .map_err(|e| format!("Failed to canonicalize path: {}", e))?;

    let metadata = fs::metadata(&canonical_path).map_err(|e| e.to_string())?;
    let size = metadata.len();

    let dim = imagesize::size(&canonical_path).map_err(|e| e.to_string())?;

    let mimetype = match canonical_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("tiff") | Some("tif") => "image/tiff",
        Some("avif") => "image/avif",
        _ => "application/octet-stream",
    }
    .to_string();

    Ok(ImageMetadata {
        width: dim.width as u32,
        height: dim.height as u32,
        size,
        mimetype,
    })
}
