use anyhow::{Context, Result};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};
use log;

pub async fn run_migrations(pool: &SqlitePool, app: &AppHandle) -> Result<()> {
    create_images_table(pool).await?;
    create_settings_table(pool).await?;
    create_swatches_table(pool).await?;
    create_notifications_table(pool).await?;
    create_selections_table(pool).await?;
    create_compressed_images_table(pool).await?;
    create_upscaled_images_table(pool).await?;
    create_bg_removed_images_table(pool).await?;
    create_videos_table(pool).await?;
    alter_videos_add_thumbnail(pool).await?;
    create_bg_removed_videos_table(pool).await?;
    create_compressed_videos_table(pool).await?;
    create_filters_table(pool).await?;
    insert_default_settings(pool, app).await?;
    insert_default_swatches(pool).await?;
    insert_default_filters(pool).await?;

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

    sqlx::query("INSERT OR IGNORE INTO settings (key, value) VALUES ('upscale_model', 'realesrgan-x4')")
        .execute(pool)
        .await
        .context("Failed to insert default 'upscale_model' setting")?;

    sqlx::query("INSERT OR IGNORE INTO settings (key, value) VALUES ('bg_removal_model', 'bria-rmbg-1.4')")
        .execute(pool)
        .await
        .context("Failed to insert default 'bg_removal_model' setting")?;

    sqlx::query("INSERT OR IGNORE INTO settings (key, value) VALUES ('ffmpeg_downloaded', '0')")
        .execute(pool)
        .await
        .context("Failed to insert default 'ffmpeg_downloaded' setting")?;

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

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS video_selections (
            video_id INTEGER PRIMARY KEY NOT NULL,
            selected_at INTEGER NOT NULL,
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await
    .context("Failed to create 'video_selections' table")?;

    Ok(())
}

async fn create_compressed_images_table(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS compressed_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            original_id INTEGER NOT NULL UNIQUE,
            filepath TEXT NOT NULL,
            size INTEGER,
            FOREIGN KEY (original_id) REFERENCES images(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await
    .context("Failed to create 'compressed_images' table")?;

    Ok(())
}

async fn create_upscaled_images_table(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS upscaled_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            original_id INTEGER NOT NULL,
            filepath TEXT NOT NULL,
            scale_factor INTEGER NOT NULL,
            model_used TEXT NOT NULL,
            size INTEGER,
            FOREIGN KEY (original_id) REFERENCES images(id) ON DELETE CASCADE,
            UNIQUE(original_id, scale_factor)
        )
        "#,
    )
    .execute(pool)
    .await
    .context("Failed to create 'upscaled_images' table")?;

    Ok(())
}

async fn create_bg_removed_images_table(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS bg_removed_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            original_id INTEGER NOT NULL UNIQUE,
            filepath TEXT NOT NULL,
            size INTEGER,
            model_used TEXT NOT NULL,
            FOREIGN KEY (original_id) REFERENCES images(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await
    .context("Failed to create 'bg_removed_images' table")?;

    Ok(())
}

async fn create_filters_table(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS filters (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            page TEXT NOT NULL UNIQUE,
            search_query TEXT DEFAULT '',
            sort_field TEXT DEFAULT 'date',
            sort_order TEXT DEFAULT 'desc',
            output_type TEXT DEFAULT 'all',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        "#,
    )
    .execute(pool)
    .await
    .context("Failed to create 'filters' table")?;

    Ok(())
}

async fn create_videos_table(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL UNIQUE,
            mimetype TEXT,
            size INTEGER,
            width INTEGER,
            height INTEGER,
            duration REAL,
            fps REAL
        )
        "#,
    )
    .execute(pool)
    .await
    .context("Failed to create 'videos' table")?;

    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_filepath ON videos(filepath)")
        .execute(pool)
        .await
        .context("Failed to create unique index on videos filepath")?;

    Ok(())
}

async fn alter_videos_add_thumbnail(pool: &SqlitePool) -> Result<()> {
    match sqlx::query("ALTER TABLE videos ADD COLUMN thumbnail_path TEXT")
        .execute(pool)
        .await
    {
        Ok(_) => log::info!("Added thumbnail_path column to videos table"),
        Err(e) => {
            if e.to_string().contains("duplicate column") {
                // Column already exists, that's fine
            } else {
                return Err(e.into());
            }
        }
    }
    Ok(())
}

async fn create_bg_removed_videos_table(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS bg_removed_videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            original_id INTEGER NOT NULL UNIQUE,
            filepath TEXT NOT NULL,
            size INTEGER,
            model_used TEXT NOT NULL,
            FOREIGN KEY (original_id) REFERENCES videos(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await
    .context("Failed to create 'bg_removed_videos' table")?;

    Ok(())
}

async fn create_compressed_videos_table(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS compressed_videos (
            original_id INTEGER NOT NULL UNIQUE,
            filepath TEXT NOT NULL,
            size INTEGER,
            FOREIGN KEY (original_id) REFERENCES videos(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await
    .context("Failed to create 'compressed_videos' table")?;

    Ok(())
}

async fn insert_default_filters(pool: &SqlitePool) -> Result<()> {
    // Default filters for index page
    sqlx::query(
        "INSERT OR IGNORE INTO filters (page, search_query, sort_field, sort_order, output_type) VALUES ('index', '', 'date', 'desc', 'all')"
    )
    .execute(pool)
    .await
    .context("Failed to insert default index filters")?;

    // Default filters for output page
    sqlx::query(
        "INSERT OR IGNORE INTO filters (page, search_query, sort_field, sort_order, output_type) VALUES ('output', '', 'date', 'desc', 'all')"
    )
    .execute(pool)
    .await
    .context("Failed to insert default output filters")?;

    // Default filters for videos page
    sqlx::query(
        "INSERT OR IGNORE INTO filters (page, search_query, sort_field, sort_order, output_type) VALUES ('videos', '', 'date', 'desc', 'all')"
    )
    .execute(pool)
    .await
    .context("Failed to insert default videos filters")?;

    Ok(())
}

