use anyhow::{Context, Result};
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub fn get_db_path(_app: &AppHandle) -> Result<PathBuf> {
    let path = if cfg!(debug_assertions) {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                std::env::current_dir().expect("Failed to get current directory")
            });
        let project_root = manifest_dir.parent().unwrap_or(&manifest_dir);
        project_root.join("data").join("db.sqlite")
    } else {
        let app_data_dir = _app
            .path()
            .app_data_dir()
            .context("Failed to get app data directory")?;
        app_data_dir.join("db.sqlite")
    };

    Ok(path)
}

pub fn ensure_database(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .context("Failed to create database directory")?;
        }
    }

    if !path.exists() {
        fs::File::create(path).context("Failed to create database file")?;
    }

    Ok(())
}

pub async fn create_pool(db_url: &str) -> Result<SqlitePool> {
    SqlitePoolOptions::new()
        .max_connections(5)
        .connect(db_url)
        .await
        .context("Failed to create database pool")
}
