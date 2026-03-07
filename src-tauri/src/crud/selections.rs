use tauri::State;

use crate::DbState;

#[tauri::command]
pub async fn get_selections(state: State<'_, DbState>) -> Result<Vec<i64>, String> {
    let rows = sqlx::query_as::<_, (i64, i64)>(
        "SELECT image_id, selected_at FROM selections ORDER BY selected_at DESC",
    )
    .fetch_all(&state.0)
    .await
    .map_err(|e| e.to_string())?;

    let selections: Vec<i64> = rows.into_iter().map(|(image_id, _)| image_id).collect();

    Ok(selections)
}

/// Replaces all current selections in a single transaction.
#[tauri::command]
pub async fn set_selections(image_ids: Vec<i64>, state: State<'_, DbState>) -> Result<(), String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;

    let mut tx = state.0.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM selections")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    for image_id in &image_ids {
        sqlx::query("INSERT INTO selections (image_id, selected_at) VALUES (?, ?)")
            .bind(image_id)
            .bind(timestamp)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn add_selection(image_id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;

    sqlx::query("INSERT OR REPLACE INTO selections (image_id, selected_at) VALUES (?, ?)")
        .bind(image_id)
        .bind(timestamp)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn remove_selection(image_id: i64, state: State<'_, DbState>) -> Result<(), String> {
    sqlx::query("DELETE FROM selections WHERE image_id = ?")
        .bind(image_id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn clear_selections(state: State<'_, DbState>) -> Result<(), String> {
    sqlx::query("DELETE FROM selections")
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
