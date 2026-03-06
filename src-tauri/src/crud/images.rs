use anyhow::Result;
use serde::{Deserialize, Serialize};
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

#[tauri::command]
pub async fn get_all_images(state: State<'_, DbState>) -> Result<Vec<Image>, String> {
    let rows = sqlx::query_as::<_, (i64, String, String, Option<String>, Option<i64>, Option<i64>, Option<i64>)>(
        "SELECT id, filename, filepath, mimetype, size, width, height FROM images ORDER BY id DESC"
    )
    .fetch_all(&state.0)
    .await
    .map_err(|e| e.to_string())?;

    let images = rows
        .into_iter()
        .map(|(id, filename, filepath, mimetype, size, width, height)| Image {
            id,
            filename,
            filepath,
            mimetype,
            size,
            width,
            height,
        })
        .collect();

    Ok(images)
}

#[tauri::command]
pub async fn add_image(data: AddImageData, state: State<'_, DbState>) -> Result<Image, String> {
    let result = sqlx::query(
        "INSERT INTO images (filename, filepath, mimetype, size, width, height) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&data.filename)
    .bind(&data.filepath)
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
        filepath: data.filepath,
        mimetype: data.mimetype,
        size: data.size,
        width: data.width,
        height: data.height,
    })
}

#[tauri::command]
pub async fn delete_image(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    sqlx::query("DELETE FROM images WHERE id = ?")
        .bind(id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_images_by_ids(ids: Vec<i64>, state: State<'_, DbState>) -> Result<(), String> {
    for id in ids {
        sqlx::query("DELETE FROM images WHERE id = ?")
            .bind(id)
            .execute(&state.0)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
