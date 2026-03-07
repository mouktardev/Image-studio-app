use anyhow::{Context, Result};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

pub async fn run_migrations(pool: &SqlitePool, app: &AppHandle) -> Result<()> {
    create_images_table(pool).await?;
    create_settings_table(pool).await?;
    create_swatches_table(pool).await?;
    create_notifications_table(pool).await?;
    create_selections_table(pool).await?;
    insert_default_settings(pool, app).await?;
    insert_default_swatches(pool).await?;

    Ok(())
}

async fn create_images_table(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL,
            mimetype TEXT,
            size INTEGER,
            width INTEGER,
            height INTEGER
        )
        "#,
    )
    .execute(pool)
    .await
    .context("Failed to create 'images' table")?;

    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS idx_images_filepath ON images(filepath)")
        .execute(pool)
        .await
        .context("Failed to create unique index on filepath")?;

    Ok(())
}

async fn create_settings_table(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .context("Failed to create 'settings' table")?;

    Ok(())
}

async fn create_swatches_table(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS swatches (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            hex TEXT NOT NULL UNIQUE
        )
        "#,
    )
    .execute(pool)
    .await
    .context("Failed to create 'swatches' table")?;

    Ok(())
}

async fn insert_default_settings(pool: &SqlitePool, app: &AppHandle) -> Result<()> {
    let picture_dir = app
        .path()
        .picture_dir()
        .ok()
        .and_then(|p| p.to_str().map(|s| s.to_string()))
        .unwrap_or_default();

    sqlx::query("INSERT OR IGNORE INTO settings (key, value) VALUES ('output', ?)")
        .bind(&picture_dir)
        .execute(pool)
        .await
        .context("Failed to insert default 'output' setting")?;

    Ok(())
}

async fn insert_default_swatches(pool: &SqlitePool) -> Result<()> {
    let default_swatches = ["#ff0000", "#00ff00", "#0000ff", "#ffffff", "#000000"];

    for color in default_swatches {
        sqlx::query("INSERT OR IGNORE INTO swatches (hex) VALUES (?)")
            .bind(color)
            .execute(pool)
            .await
            .with_context(|| format!("Failed to insert default swatch '{}'", color))?;
    }

    Ok(())
}

async fn create_notifications_table(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'info',
            timestamp INTEGER NOT NULL,
            read INTEGER NOT NULL DEFAULT 0,
            action_label TEXT,
            action_payload TEXT
        )
        "#,
    )
    .execute(pool)
    .await
    .context("Failed to create 'notifications' table")?;

    Ok(())
}

async fn create_selections_table(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS selections (
            image_id INTEGER PRIMARY KEY NOT NULL,
            selected_at INTEGER NOT NULL,
            FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await
    .context("Failed to create 'selections' table")?;

    Ok(())
}
