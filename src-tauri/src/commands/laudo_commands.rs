//! Tauri commands for the Laudo module.
//!
//! Spike B exposes the minimum surface required to validate the Document
//! Engine end-to-end:
//!   - create a laudo (row + empty .sicrodoc on disk);
//!   - list laudos of a workspace;
//!   - read a laudo's full document JSON;
//!   - save (overwrite) a laudo's document JSON.
//!
//! The schema of `doc` (TipTap-based) is owned by the front-end Document
//! Engine. The Rust side treats it as opaque JSON.

use std::path::{Path, PathBuf};

use chrono::Utc;
use uuid::Uuid;

use crate::database::connection::open_connection;
use crate::database::migrations::run_migrations;
use crate::database::repositories::{laudo_repo, occurrence_repo};
use crate::error::{Result, SicroError};
use crate::filesystem::atomic_write_bytes;
use crate::models::{Laudo, LaudoDoc, LaudoStatus, NewLaudoInput};
use crate::workspace::manifest::{Manifest, SQLITE_FILENAME};

const LAUDOS_SUBDIR: &str = "laudos";

#[tauri::command]
pub async fn create_laudo(
    workspace_path: String,
    input: NewLaudoInput,
) -> Result<LaudoDoc> {
    let ws = PathBuf::from(&workspace_path);
    let manifest = Manifest::read(&ws)?;

    let mut conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    run_migrations(&mut conn)?;

    let now = Utc::now();
    let id = Uuid::new_v4();
    let relative_path = format!("{LAUDOS_SUBDIR}/laudo_{}.sicrodoc", id);

    let laudo = Laudo {
        id,
        occurrence_id: manifest.occurrence_id,
        title: if input.title.trim().is_empty() {
            "Laudo sem título".to_string()
        } else {
            input.title.trim().to_string()
        },
        template_id: if input.template_id.trim().is_empty() {
            "documento_livre".to_string()
        } else {
            input.template_id.trim().to_string()
        },
        relative_path: relative_path.clone(),
        status: LaudoStatus::Rascunho,
        created_at: now,
        updated_at: now,
        last_export_pdf: None,
        last_export_docx: None,
    };

    laudo_repo::insert(&conn, &laudo)?;
    occurrence_repo::record_audit(
        &conn,
        Some(&laudo.occurrence_id),
        "laudo.created",
        Some("laudo"),
        Some("laudo"),
        Some(&laudo.id),
        None,
    )?;

    // Write the initial .sicrodoc envelope. The front-end will overwrite it
    // with a real TipTap document on first save; until then we ship a valid
    // empty document so a read-after-create never fails.
    let envelope = empty_envelope(&laudo);
    let target = ws.join(&relative_path);
    write_doc(&target, &envelope)?;

    Ok(LaudoDoc {
        laudo,
        doc: envelope,
    })
}

#[tauri::command]
pub async fn list_laudos(workspace_path: String) -> Result<Vec<Laudo>> {
    let ws = PathBuf::from(&workspace_path);
    let manifest = Manifest::read(&ws)?;

    let mut conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    run_migrations(&mut conn)?;

    laudo_repo::list_by_occurrence(&conn, &manifest.occurrence_id)
}

#[tauri::command]
pub async fn read_laudo(workspace_path: String, laudo_id: String) -> Result<LaudoDoc> {
    let ws = PathBuf::from(&workspace_path);
    let id = Uuid::parse_str(&laudo_id)
        .map_err(|e| SicroError::Validation(format!("invalid laudo id: {e}")))?;

    let mut conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    run_migrations(&mut conn)?;

    let laudo = laudo_repo::find_by_id(&conn, &id)?
        .ok_or_else(|| SicroError::Validation(format!("laudo {} not found", id)))?;

    let target = ws.join(&laudo.relative_path);
    let bytes = std::fs::read(&target).map_err(|e| {
        SicroError::Workspace(format!(
            "could not read laudo at {}: {}",
            target.display(),
            e
        ))
    })?;
    let doc: serde_json::Value = serde_json::from_slice(&bytes)?;

    Ok(LaudoDoc { laudo, doc })
}

#[tauri::command]
pub async fn save_laudo(
    workspace_path: String,
    laudo_id: String,
    doc: serde_json::Value,
) -> Result<Laudo> {
    let ws = PathBuf::from(&workspace_path);
    let id = Uuid::parse_str(&laudo_id)
        .map_err(|e| SicroError::Validation(format!("invalid laudo id: {e}")))?;

    let mut conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    run_migrations(&mut conn)?;

    let mut laudo = laudo_repo::find_by_id(&conn, &id)?
        .ok_or_else(|| SicroError::Validation(format!("laudo {} not found", id)))?;

    let target = ws.join(&laudo.relative_path);
    write_doc(&target, &doc)?;

    let now = Utc::now();
    laudo_repo::touch_updated_at(&conn, &laudo.id, now)?;
    laudo.updated_at = now;

    occurrence_repo::record_audit(
        &conn,
        Some(&laudo.occurrence_id),
        "laudo.saved",
        Some("laudo"),
        Some("laudo"),
        Some(&laudo.id),
        None,
    )?;

    Ok(laudo)
}

// ---------------------------------------------------------------------------
// Helpers

fn write_doc(target: &Path, doc: &serde_json::Value) -> Result<()> {
    let bytes = serde_json::to_vec_pretty(doc)?;
    atomic_write_bytes(target, &bytes)?;
    Ok(())
}

/// Build a minimal `.sicrodoc` envelope for a freshly-created laudo.
/// The front-end may overwrite it immediately, but it MUST be valid JSON the
/// front-end can parse — otherwise the first `read_laudo` would explode.
fn empty_envelope(laudo: &Laudo) -> serde_json::Value {
    serde_json::json!({
        "schema_version": "1.0.0",
        "document_id": laudo.id.to_string(),
        "occurrence_id": laudo.occurrence_id.to_string(),
        "type": "laudo",
        "title": laudo.title,
        "template_id": laudo.template_id,
        "created_at": laudo.created_at.to_rfc3339(),
        "updated_at": laudo.updated_at.to_rfc3339(),
        "metadata": {},
        "layout": {
            "page_size": "A4",
            "orientation": "portrait"
        },
        // ProseMirror/TipTap empty doc: a single empty paragraph.
        "content": {
            "type": "doc",
            "content": [
                { "type": "paragraph" }
            ]
        }
    })
}
