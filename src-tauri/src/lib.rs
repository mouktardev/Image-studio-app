mod db;
mod crud;

use db::{get_db_url, init_db, get_setting as db_get_setting, set_setting as db_set_setting};
use crud::images::{get_all_images, add_image, import_images_bulk, delete_image, delete_images_by_ids, get_image_metadata};
use crud::notifications::{get_all_notifications, add_notification, mark_notification_read, delete_notification, mark_all_notifications_read, clear_all_notifications};
use crud::selections::{get_selections, set_selections, add_selection, remove_selection, clear_selections};
use sqlx::SqlitePool;
use std::sync::OnceLock;
use tauri::{AppHandle, Manager, State};

pub struct DbState(pub SqlitePool);

static DB_INITIALIZED: OnceLock<()> = OnceLock::new();

#[tauri::command]
async fn init_database(app: AppHandle) -> Result<String, String> {
    let (pool, path) = init_db(&app).await.map_err(|e| e.to_string())?;
    app.manage(DbState(pool));
    Ok(format!("Database initialized at: {:?}", path))
}

#[tauri::command]
async fn db_exists(app: AppHandle) -> Result<bool, String> {
    let path = db::get_db_path(&app).map_err(|e| e.to_string())?;
    Ok(path.exists())
}

#[tauri::command]
fn get_db_path_cmd(app: AppHandle) -> Result<String, String> {
    get_db_url(&app).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_setting(key: String, state: State<'_, DbState>) -> Result<Option<String>, String> {
    db_get_setting(&state.0, &key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_setting(key: String, value: String, state: State<'_, DbState>) -> Result<(), String> {
    db_set_setting(&state.0, &key, &value)
        .await
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if DB_INITIALIZED.get().is_some() {
                return Ok(());
            }

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match init_db(&handle).await {
                    Ok((pool, path)) => {
                        handle.manage(DbState(pool));
                        let _ = DB_INITIALIZED.set(());
                        println!("[DB] Initialized at: {:?}", path);
                    }
                    Err(e) => {
                        eprintln!("[DB] Failed to initialize: {}", e);
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            init_database,
            db_exists,
            get_db_path_cmd,
            get_setting,
            set_setting,
            get_all_images,
            add_image,
            import_images_bulk,
            delete_image,
            delete_images_by_ids,
            get_image_metadata,
            get_all_notifications,
            add_notification,
            mark_notification_read,
            delete_notification,
            mark_all_notifications_read,
            clear_all_notifications,
            get_selections,
            set_selections,
            add_selection,
            remove_selection,
            clear_selections
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
