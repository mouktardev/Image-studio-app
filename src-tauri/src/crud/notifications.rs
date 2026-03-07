use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::DbState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Notification {
    pub id: i64,
    pub message: String,
    pub status: String,
    pub timestamp: i64,
    pub read: bool,
    pub action_label: Option<String>,
    pub action_payload: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddNotificationData {
    pub message: String,
    pub status: Option<String>,
    pub action_label: Option<String>,
    pub action_payload: Option<String>,
}

#[tauri::command]
pub async fn get_all_notifications(state: State<'_, DbState>) -> Result<Vec<Notification>, String> {
    let rows = sqlx::query_as::<_, (i64, String, String, i64, i32, Option<String>, Option<String>)>(
        "SELECT id, message, status, timestamp, read, action_label, action_payload FROM notifications ORDER BY timestamp DESC"
    )
    .fetch_all(&state.0)
    .await
    .map_err(|e| e.to_string())?;

    let notifications: Vec<Notification> = rows
        .into_iter()
        .map(|(id, message, status, timestamp, read, action_label, action_payload)| {
            Notification {
                id,
                message,
                status,
                timestamp,
                read: read != 0,
                action_label,
                action_payload,
            }
        })
        .collect();

    Ok(notifications)
}

#[tauri::command]
pub async fn add_notification(
    data: AddNotificationData,
    state: State<'_, DbState>,
    app: AppHandle,
) -> Result<Notification, String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;

    let status = data.status.unwrap_or_else(|| "info".to_string());

    let result = sqlx::query(
        "INSERT INTO notifications (message, status, timestamp, read, action_label, action_payload) VALUES (?, ?, ?, 0, ?, ?)"
    )
    .bind(&data.message)
    .bind(&status)
    .bind(timestamp)
    .bind(&data.action_label)
    .bind(&data.action_payload)
    .execute(&state.0)
    .await
    .map_err(|e| e.to_string())?;

    let id = result.last_insert_rowid();

    let notification = Notification {
        id,
        message: data.message,
        status,
        timestamp,
        read: false,
        action_label: data.action_label,
        action_payload: data.action_payload,
    };

    let _ = app.emit("notification-added", &notification);

    Ok(notification)
}

#[tauri::command]
pub async fn mark_notification_read(
    id: i64,
    state: State<'_, DbState>,
    app: AppHandle,
) -> Result<(), String> {
    sqlx::query("UPDATE notifications SET read = 1 WHERE id = ?")
        .bind(id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("notification-read", id);

    Ok(())
}

#[tauri::command]
pub async fn delete_notification(
    id: i64,
    state: State<'_, DbState>,
    app: AppHandle,
) -> Result<(), String> {
    sqlx::query("DELETE FROM notifications WHERE id = ?")
        .bind(id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("notification-deleted", id);

    Ok(())
}

#[tauri::command]
pub async fn mark_all_notifications_read(
    state: State<'_, DbState>,
    app: AppHandle,
) -> Result<(), String> {
    sqlx::query("UPDATE notifications SET read = 1")
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("notifications-all-read", ());

    Ok(())
}

#[tauri::command]
pub async fn clear_all_notifications(
    state: State<'_, DbState>,
    app: AppHandle,
) -> Result<(), String> {
    sqlx::query("DELETE FROM notifications")
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("notifications-cleared", ());

    Ok(())
}
