use dunce::canonicalize;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::State;

use crate::DbState;

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
pub async fn get_all_images(state: State<'_, DbState>) -> Result<Vec<Image>, String> {
    let rows = sqlx::query_as::<_, (i64, String, String, Option<String>, Option<i64>, Option<i64>, Option<i64>, Option<String>, Option<i64>)>(
        "SELECT 
            i.id, i.filename, i.filepath, i.mimetype, i.size, i.width, i.height,
            ci.filepath as compressed_filepath, ci.size as compressed_size
         FROM images i
         LEFT JOIN compressed_images ci ON ci.original_id = i.id
         ORDER BY i.id DESC"
    )
    .fetch_all(&state.0)
    .await
    .map_err(|e| e.to_string())?;

    let images: Vec<Image> = rows
        .into_iter()
        .map(|(id, filename, filepath, mimetype, size, width, height, compressed_filepath, compressed_size)| {
            Image { id, filename, filepath, mimetype, size, width, height, compressed_filepath, compressed_size }
        })
        .collect();

    Ok(images)
}

#[tauri::command]
pub async fn get_all_compressed_images(state: State<'_, DbState>) -> Result<Vec<Image>, String> {
    let rows = sqlx::query_as::<_, (i64, String, String, Option<String>, Option<i64>, Option<i64>, Option<i64>, Option<String>, Option<i64>)>(
        "SELECT 
            i.id, i.filename, ci.filepath, i.mimetype, ci.size, i.width, i.height,
            ci.filepath as compressed_filepath, ci.size as compressed_size
         FROM images i
         INNER JOIN compressed_images ci ON ci.original_id = i.id
         ORDER BY ci.id DESC"
    )
    .fetch_all(&state.0)
    .await
    .map_err(|e| e.to_string())?;

    let images: Vec<Image> = rows
        .into_iter()
        .map(|(id, filename, filepath, mimetype, size, width, height, compressed_filepath, compressed_size)| {
            Image { id, filename, filepath, mimetype, size, width, height, compressed_filepath, compressed_size }
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

        let canonical_path = match canonicalize(&path) {
            Ok(p) => p,
            Err(_) => { failed += 1; continue; }
        };

        let filename = canonical_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

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

    sqlx::query("DELETE FROM images WHERE id = ?")
        .bind(id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn sync_database(state: State<'_, DbState>) -> Result<i64, String> {
    let mut deleted_count = 0;

    // 1. Check original images
    let originals: Vec<(i64, String)> = sqlx::query_as("SELECT id, filepath FROM images")
        .fetch_all(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    for (id, filepath) in originals {
        if !std::path::Path::new(&filepath).exists() {
            // Delete associated compressed images first
            sqlx::query("DELETE FROM compressed_images WHERE original_id = ?")
                .bind(id)
                .execute(&state.0)
                .await
                .map_err(|e| e.to_string())?;
                
            // Delete original
            sqlx::query("DELETE FROM images WHERE id = ?")
                .bind(id)
                .execute(&state.0)
                .await
                .map_err(|e| e.to_string())?;
                
            deleted_count += 1;
        }
    }

    // 2. Check remaining compressed images (where original exists, but compressed file was deleted)
    let compressions: Vec<(i64, String)> = sqlx::query_as("SELECT id, filepath FROM compressed_images")
        .fetch_all(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    for (id, filepath) in compressions {
        if !std::path::Path::new(&filepath).exists() {
            sqlx::query("DELETE FROM compressed_images WHERE id = ?")
                .bind(id)
                .execute(&state.0)
                .await
                .map_err(|e| e.to_string())?;
                
            deleted_count += 1;
        }
    }

    Ok(deleted_count)
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
