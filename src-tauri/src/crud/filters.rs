use serde::{Deserialize, Serialize};
use tauri::State;
use crate::DbState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FilterState {
    pub page: String,
    pub search_query: String,
    pub sort_field: String,
    pub sort_order: String,
    pub output_type: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateFilterRequest {
    pub page: String,
    pub search_query: Option<String>,
    pub sort_field: Option<String>,
    pub sort_order: Option<String>,
    pub output_type: Option<String>,
}

#[tauri::command]
pub async fn get_filters(
    state: State<'_, DbState>,
    page: String,
) -> Result<FilterState, String> {
    let pool = &state.0;
    
    let filter = sqlx::query_as::<_, (String, String, String, String, String)>(
        "SELECT page, search_query, sort_field, sort_order, output_type FROM filters WHERE page = ?"
    )
    .bind(&page)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to get filters: {}", e))?;

    Ok(FilterState {
        page: filter.0,
        search_query: filter.1,
        sort_field: filter.2,
        sort_order: filter.3,
        output_type: filter.4,
    })
}

#[tauri::command]
pub async fn update_filters(
    state: State<'_, DbState>,
    request: UpdateFilterRequest,
) -> Result<(), String> {
    let pool = &state.0;
    
    // Update fields individually if provided
    if let Some(search_query) = request.search_query {
        sqlx::query("UPDATE filters SET search_query = ?, updated_at = CURRENT_TIMESTAMP WHERE page = ?")
            .bind(&search_query)
            .bind(&request.page)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to update search_query: {}", e))?;
    }
    
    if let Some(sort_field) = request.sort_field {
        sqlx::query("UPDATE filters SET sort_field = ?, updated_at = CURRENT_TIMESTAMP WHERE page = ?")
            .bind(&sort_field)
            .bind(&request.page)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to update sort_field: {}", e))?;
    }
    
    if let Some(sort_order) = request.sort_order {
        sqlx::query("UPDATE filters SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE page = ?")
            .bind(&sort_order)
            .bind(&request.page)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to update sort_order: {}", e))?;
    }
    
    if let Some(output_type) = request.output_type {
        sqlx::query("UPDATE filters SET output_type = ?, updated_at = CURRENT_TIMESTAMP WHERE page = ?")
            .bind(&output_type)
            .bind(&request.page)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to update output_type: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn reset_filters(
    state: State<'_, DbState>,
    page: String,
) -> Result<FilterState, String> {
    let pool = &state.0;
    
    sqlx::query(
        "UPDATE filters SET search_query = '', sort_field = 'date', sort_order = 'desc', output_type = 'all', updated_at = CURRENT_TIMESTAMP WHERE page = ?"
    )
    .bind(&page)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to reset filters: {}", e))?;

    // Return the reset state
    get_filters(state, page).await
}
