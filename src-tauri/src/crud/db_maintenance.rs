use tauri::State;
use crate::DbState;

#[tauri::command]
pub async fn check_db_health(state: State<'_, DbState>) -> Result<i64, String> {
    let mut orphan_count = 0;

    // 1. Check original images - count orphaned records
    let originals: Vec<(i64, String)> = sqlx::query_as("SELECT id, filepath FROM images")
        .fetch_all(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    for (_id, filepath) in originals {
        if !std::path::Path::new(&filepath).exists() {
            orphan_count += 1;
        }
    }

    // 2. Check compressed images
    let compressions: Vec<(i64, String)> = sqlx::query_as("SELECT id, filepath FROM compressed_images")
        .fetch_all(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    for (_id, filepath) in compressions {
        if !std::path::Path::new(&filepath).exists() {
            orphan_count += 1;
        }
    }

    // 3. Check upscaled images
    let upscaled: Vec<(i64, String)> = sqlx::query_as("SELECT id, filepath FROM upscaled_images")
        .fetch_all(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    for (_id, filepath) in upscaled {
        if !std::path::Path::new(&filepath).exists() {
            orphan_count += 1;
        }
    }

    // 4. Check background removed images
    let bg_removed: Vec<(i64, String)> = sqlx::query_as("SELECT id, filepath FROM bg_removed_images")
        .fetch_all(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    for (_id, filepath) in bg_removed {
        if !std::path::Path::new(&filepath).exists() {
            orphan_count += 1;
        }
    }

    // 5. Check videos - original video files
    let videos: Vec<(i64, String)> = sqlx::query_as("SELECT id, filepath FROM videos")
        .fetch_all(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    for (_id, filepath) in videos {
        if !std::path::Path::new(&filepath).exists() {
            orphan_count += 1;
        }
    }

    // 6. Check compressed videos
    let compressed_videos: Vec<(i64, String)> =
        sqlx::query_as("SELECT original_id, filepath FROM compressed_videos")
            .fetch_all(&state.0)
            .await
            .map_err(|e| e.to_string())?;

    for (_id, filepath) in compressed_videos {
        if !std::path::Path::new(&filepath).exists() {
            orphan_count += 1;
        }
    }

    // 7. Check background removed videos
    let bg_removed_videos: Vec<(i64, String)> =
        sqlx::query_as("SELECT id, filepath FROM bg_removed_videos")
            .fetch_all(&state.0)
            .await
            .map_err(|e| e.to_string())?;

    for (_id, filepath) in bg_removed_videos {
        if !std::path::Path::new(&filepath).exists() {
            orphan_count += 1;
        }
    }

    // 8. Check converted images
    let converted_images: Vec<(i64, String)> =
        sqlx::query_as("SELECT id, filepath FROM converted_images")
            .fetch_all(&state.0)
            .await
            .map_err(|e| e.to_string())?;

    for (_id, filepath) in converted_images {
        if !std::path::Path::new(&filepath).exists() {
            orphan_count += 1;
        }
    }

    // 9. Check converted videos
    let converted_videos: Vec<(i64, String)> =
        sqlx::query_as("SELECT id, filepath FROM converted_videos")
            .fetch_all(&state.0)
            .await
            .map_err(|e| e.to_string())?;

    for (_id, filepath) in converted_videos {
        if !std::path::Path::new(&filepath).exists() {
            orphan_count += 1;
        }
    }

    Ok(orphan_count)
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

            // Delete associated upscaled images
            sqlx::query("DELETE FROM upscaled_images WHERE original_id = ?")
                .bind(id)
                .execute(&state.0)
                .await
                .map_err(|e| e.to_string())?;

            // Delete associated background removed images
            sqlx::query("DELETE FROM bg_removed_images WHERE original_id = ?")
                .bind(id)
                .execute(&state.0)
                .await
                .map_err(|e| e.to_string())?;

            // Delete associated converted images
            sqlx::query("DELETE FROM converted_images WHERE original_id = ?")
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

    // 3. Check remaining upscaled images
    let upscaled: Vec<(i64, String)> = sqlx::query_as("SELECT id, filepath FROM upscaled_images")
        .fetch_all(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    for (id, filepath) in upscaled {
        if !std::path::Path::new(&filepath).exists() {
            sqlx::query("DELETE FROM upscaled_images WHERE id = ?")
                .bind(id)
                .execute(&state.0)
                .await
                .map_err(|e| e.to_string())?;

            deleted_count += 1;
        }
    }

    // 4. Check background removed images
    let bg_removed: Vec<(i64, String)> = sqlx::query_as("SELECT id, filepath FROM bg_removed_images")
        .fetch_all(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    for (id, filepath) in bg_removed {
        if !std::path::Path::new(&filepath).exists() {
            sqlx::query("DELETE FROM bg_removed_images WHERE id = ?")
                .bind(id)
                .execute(&state.0)
                .await
                .map_err(|e| e.to_string())?;

            deleted_count += 1;
        }
    }

    // 5. Check videos - delete orphaned video records
    let videos: Vec<(i64, String)> = sqlx::query_as("SELECT id, filepath FROM videos")
        .fetch_all(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    for (id, filepath) in videos {
        if !std::path::Path::new(&filepath).exists() {
            // Delete associated compressed videos first
            sqlx::query("DELETE FROM compressed_videos WHERE original_id = ?")
                .bind(id)
                .execute(&state.0)
                .await
                .map_err(|e| e.to_string())?;

            // Delete associated background removed videos
            sqlx::query("DELETE FROM bg_removed_videos WHERE original_id = ?")
                .bind(id)
                .execute(&state.0)
                .await
                .map_err(|e| e.to_string())?;

            // Delete associated converted videos
            sqlx::query("DELETE FROM converted_videos WHERE original_id = ?")
                .bind(id)
                .execute(&state.0)
                .await
                .map_err(|e| e.to_string())?;

            // Delete original video
            sqlx::query("DELETE FROM videos WHERE id = ?")
                .bind(id)
                .execute(&state.0)
                .await
                .map_err(|e| e.to_string())?;

            deleted_count += 1;
        }
    }

    // 6. Check compressed videos (where original exists but compressed file was deleted)
    let compressed_videos: Vec<(i64, String)> =
        sqlx::query_as("SELECT original_id, filepath FROM compressed_videos")
            .fetch_all(&state.0)
            .await
            .map_err(|e| e.to_string())?;

    for (id, filepath) in compressed_videos {
        if !std::path::Path::new(&filepath).exists() {
            sqlx::query("DELETE FROM compressed_videos WHERE original_id = ?")
                .bind(id)
                .execute(&state.0)
                .await
                .map_err(|e| e.to_string())?;

            deleted_count += 1;
        }
    }

    // 7. Check background removed videos
    let bg_removed_videos: Vec<(i64, String)> =
        sqlx::query_as("SELECT id, filepath FROM bg_removed_videos")
            .fetch_all(&state.0)
            .await
            .map_err(|e| e.to_string())?;

    for (id, filepath) in bg_removed_videos {
        if !std::path::Path::new(&filepath).exists() {
            sqlx::query("DELETE FROM bg_removed_videos WHERE id = ?")
                .bind(id)
                .execute(&state.0)
                .await
                .map_err(|e| e.to_string())?;

            deleted_count += 1;
        }
    }

    // 8. Check converted images
    let converted_images: Vec<(i64, String)> =
        sqlx::query_as("SELECT id, filepath FROM converted_images")
            .fetch_all(&state.0)
            .await
            .map_err(|e| e.to_string())?;

    for (id, filepath) in converted_images {
        if !std::path::Path::new(&filepath).exists() {
            sqlx::query("DELETE FROM converted_images WHERE id = ?")
                .bind(id)
                .execute(&state.0)
                .await
                .map_err(|e| e.to_string())?;

            deleted_count += 1;
        }
    }

    // 9. Check converted videos
    let converted_videos: Vec<(i64, String)> =
        sqlx::query_as("SELECT id, filepath FROM converted_videos")
            .fetch_all(&state.0)
            .await
            .map_err(|e| e.to_string())?;

    for (id, filepath) in converted_videos {
        if !std::path::Path::new(&filepath).exists() {
            sqlx::query("DELETE FROM converted_videos WHERE id = ?")
                .bind(id)
                .execute(&state.0)
                .await
                .map_err(|e| e.to_string())?;

            deleted_count += 1;
        }
    }

    Ok(deleted_count)
}