use tauri::State;
use anyhow::Result;
use crate::DbState;
use std::time::{SystemTime, UNIX_EPOCH};

#[tauri::command]
pub async fn get_video_selections(state: State<'_, DbState>) -> Result<Vec<i64>, String> {
    let rows = sqlx::query_as::<_, (i64, i64)>(
        "SELECT video_id, selected_at FROM video_selections ORDER BY selected_at DESC"
    )
    .fetch_all(&state.0)
    .await
    .map_err(|e| e.to_string())?;

    let selections: Vec<i64> = rows.into_iter().map(|(video_id, _)| video_id).collect();
    Ok(selections)
}

#[tauri::command]
pub async fn set_video_selections(video_ids: Vec<i64>, state: State<'_, DbState>) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let mut tx = state.0.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM video_selections")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    for id in video_ids {
        sqlx::query("INSERT INTO video_selections (video_id, selected_at) VALUES (?, ?)")
            .bind(id)
            .bind(now)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn add_video_selection(video_id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    sqlx::query("INSERT OR REPLACE INTO video_selections (video_id, selected_at) VALUES (?, ?)")
        .bind(video_id)
        .bind(now)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn remove_video_selection(video_id: i64, state: State<'_, DbState>) -> Result<(), String> {
    sqlx::query("DELETE FROM video_selections WHERE video_id = ?")
        .bind(video_id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn clear_video_selections(state: State<'_, DbState>) -> Result<(), String> {
    sqlx::query("DELETE FROM video_selections")
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}