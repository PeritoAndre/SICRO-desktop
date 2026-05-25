//! Tauri commands that operate on workspaces.
//!
//! Naming convention: command names use snake_case in Rust. The front-end
//! `commands.ts` mirrors them exactly.

use std::path::PathBuf;

use tauri::State;
use uuid::Uuid;

use crate::database::connection::open_connection;
use crate::database::repositories::occurrence_repo;
use crate::error::{Result, SicroError};
use crate::models::{LoadedOccurrence, NewOccurrenceInput, Occurrence, RecentOccurrence};
use crate::state::AppState;
use crate::workspace::manifest::SQLITE_FILENAME;
use crate::workspace::{create_workspace, open_workspace};

/// Create a fresh `.sicro` workspace with one initial occurrence row.
#[tauri::command]
pub async fn create_occurrence(
    state: State<'_, AppState>,
    input: NewOccurrenceInput,
) -> Result<LoadedOccurrence> {
    let created = create_workspace(input, state.default_workspace_parent())?;
    let workspace_path = path_to_string(&created.path)?;

    state.upsert_recent(&created.occurrence, &workspace_path, created.manifest.workspace_id)?;

    Ok(LoadedOccurrence {
        occurrence: created.occurrence,
        workspace_path,
    })
}

/// Open an existing `.sicro` workspace by path.
#[tauri::command]
pub async fn open_occurrence(
    state: State<'_, AppState>,
    workspace_path: String,
) -> Result<LoadedOccurrence> {
    let path = PathBuf::from(&workspace_path);
    let opened = open_workspace(&path)?;
    state.upsert_recent(&opened.occurrence, &workspace_path, opened.manifest.workspace_id)?;

    Ok(LoadedOccurrence {
        occurrence: opened.occurrence,
        workspace_path,
    })
}

/// Re-read the occurrence row for a workspace already known to be valid.
/// Used by the front-end when navigating back to a workspace it had loaded.
#[tauri::command]
pub async fn get_occurrence(workspace_path: String) -> Result<Occurrence> {
    let path = PathBuf::from(workspace_path);
    let opened = open_workspace(&path)?;
    Ok(opened.occurrence)
}

#[tauri::command]
pub async fn list_recent_occurrences(
    state: State<'_, AppState>,
) -> Result<Vec<RecentOccurrence>> {
    Ok(state.list_recents())
}

#[tauri::command]
pub async fn forget_recent_occurrence(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<()> {
    let id = Uuid::parse_str(&workspace_id)
        .map_err(|e| SicroError::Validation(format!("invalid workspace id: {e}")))?;
    state.forget_recent(id)
}

// ---------------------------------------------------------------------------
// Helpers

fn path_to_string(path: &std::path::Path) -> Result<String> {
    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| SicroError::Filesystem(format!("non-UTF8 path: {}", path.display())))
}

// Unused yet, kept here so a future "rename / move workspace" command has a clear home.
#[allow(dead_code)]
fn workspace_db_path(workspace_dir: &std::path::Path) -> PathBuf {
    workspace_dir.join(SQLITE_FILENAME)
}

#[allow(dead_code)]
fn touch_audit_open(workspace_dir: &std::path::Path, occurrence_id: &Uuid) -> Result<()> {
    let conn = open_connection(&workspace_dir.join(SQLITE_FILENAME))?;
    occurrence_repo::record_audit(
        &conn,
        Some(occurrence_id),
        "workspace.opened",
        Some("workspace"),
        None,
        None,
        None,
    )?;
    Ok(())
}
