//! Tauri commands for the Croqui module (Spike E).
//!
//! Mirrors the Laudo command surface:
//!   - create_croqui    → row in `croquis` + empty `.sicrocroqui` on disk
//!   - list_croquis     → all croquis of the active occurrence
//!   - read_croqui      → row + `.sicrocroqui` envelope
//!   - save_croqui      → overwrites the `.sicrocroqui` file
//!   - export_croqui_png → writes the PNG produced by Konva.toDataURL()
//!                          into `croquis/exports/` and updates the row.
//!
//! The schema of `doc` lives on the frontend (`src/modules/croqui/engine/`).
//! Rust treats the envelope as opaque JSON.

use std::path::{Path, PathBuf};

use base64::Engine as _;
use chrono::Utc;
use uuid::Uuid;

use crate::database::connection::open_connection;
use crate::database::migrations::run_migrations;
use crate::database::repositories::{croqui_repo, occurrence_repo};
use crate::error::{Result, SicroError};
use crate::filesystem::atomic_write_bytes;
use crate::models::{Croqui, CroquiDoc, CroquiStatus, ExportCroquiPngInput, NewCroquiInput};
use crate::workspace::manifest::{Manifest, SQLITE_FILENAME};

const CROQUIS_SUBDIR: &str = "croquis";
const CROQUIS_EXPORT_SUBDIR: &str = "croquis/exports";
const CURRENT_SCHEMA_VERSION: &str = "0.1";

#[tauri::command]
pub async fn create_croqui(
    workspace_path: String,
    input: NewCroquiInput,
) -> Result<CroquiDoc> {
    let ws = PathBuf::from(&workspace_path);
    let manifest = Manifest::read(&ws)?;

    let mut conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    run_migrations(&mut conn)?;

    let now = Utc::now();
    let id = Uuid::new_v4();
    let relative_path = format!("{CROQUIS_SUBDIR}/croqui_{}.sicrocroqui", id);

    let croqui = Croqui {
        id,
        occurrence_id: manifest.occurrence_id,
        title: if input.title.trim().is_empty() {
            format!("Croqui {}", &id.to_string()[..8])
        } else {
            input.title.trim().to_string()
        },
        relative_path: relative_path.clone(),
        status: CroquiStatus::Draft,
        schema_version: CURRENT_SCHEMA_VERSION.to_string(),
        last_export_relative_path: None,
        created_at: now,
        updated_at: now,
    };

    croqui_repo::insert(&conn, &croqui)?;
    occurrence_repo::record_audit(
        &conn,
        Some(&croqui.occurrence_id),
        "croqui.created",
        Some("croqui"),
        Some("croqui"),
        Some(&croqui.id),
        None,
    )?;

    // Write the empty envelope so read-after-create never fails.
    let envelope = empty_envelope(&croqui);
    let target = ws.join(&relative_path);
    write_doc(&target, &envelope)?;

    Ok(CroquiDoc {
        croqui,
        doc: envelope,
    })
}

#[tauri::command]
pub async fn list_croquis(workspace_path: String) -> Result<Vec<Croqui>> {
    let ws = PathBuf::from(&workspace_path);
    let manifest = Manifest::read(&ws)?;

    let mut conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    run_migrations(&mut conn)?;

    croqui_repo::list_by_occurrence(&conn, &manifest.occurrence_id)
}

#[tauri::command]
pub async fn read_croqui(workspace_path: String, croqui_id: String) -> Result<CroquiDoc> {
    let ws = PathBuf::from(&workspace_path);
    let id = Uuid::parse_str(&croqui_id)
        .map_err(|e| SicroError::Validation(format!("invalid croqui id: {e}")))?;

    let mut conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    run_migrations(&mut conn)?;

    let croqui = croqui_repo::find_by_id(&conn, &id)?
        .ok_or_else(|| SicroError::Validation(format!("croqui {} not found", id)))?;

    let target = ws.join(&croqui.relative_path);
    let bytes = std::fs::read(&target).map_err(|e| {
        SicroError::Workspace(format!(
            "could not read croqui at {}: {}",
            target.display(),
            e
        ))
    })?;
    let doc: serde_json::Value = serde_json::from_slice(&bytes)?;

    Ok(CroquiDoc { croqui, doc })
}

#[tauri::command]
pub async fn save_croqui(
    workspace_path: String,
    croqui_id: String,
    doc: serde_json::Value,
) -> Result<Croqui> {
    let ws = PathBuf::from(&workspace_path);
    let id = Uuid::parse_str(&croqui_id)
        .map_err(|e| SicroError::Validation(format!("invalid croqui id: {e}")))?;

    let mut conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    run_migrations(&mut conn)?;

    let mut croqui = croqui_repo::find_by_id(&conn, &id)?
        .ok_or_else(|| SicroError::Validation(format!("croqui {} not found", id)))?;

    let target = ws.join(&croqui.relative_path);
    write_doc(&target, &doc)?;

    let now = Utc::now();
    croqui_repo::touch(&conn, &croqui.id, now, None, None)?;
    croqui.updated_at = now;

    occurrence_repo::record_audit(
        &conn,
        Some(&croqui.occurrence_id),
        "croqui.saved",
        Some("croqui"),
        Some("croqui"),
        Some(&croqui.id),
        None,
    )?;

    Ok(croqui)
}

/// Persist a PNG export. The frontend builds it via Konva's `toDataURL()`
/// and ships the bytes base64-encoded. We write to `croquis/exports/` and
/// update the croqui row with the new path.
#[tauri::command]
pub async fn export_croqui_png(
    workspace_path: String,
    croqui_id: String,
    input: ExportCroquiPngInput,
) -> Result<String> {
    let ws = PathBuf::from(&workspace_path);
    let id = Uuid::parse_str(&croqui_id)
        .map_err(|e| SicroError::Validation(format!("invalid croqui id: {e}")))?;

    let mut conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    run_migrations(&mut conn)?;

    let croqui = croqui_repo::find_by_id(&conn, &id)?
        .ok_or_else(|| SicroError::Validation(format!("croqui {} not found", id)))?;

    // Decode base64 — accept either raw or "data:image/png;base64,..." prefix.
    let cleaned = input
        .png_base64
        .split(',')
        .last()
        .unwrap_or(&input.png_base64);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(cleaned.trim())
        .map_err(|e| SicroError::Validation(format!("invalid base64 PNG: {e}")))?;
    if bytes.len() < 8 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err(SicroError::Validation(
            "payload does not start with PNG magic bytes".to_string(),
        ));
    }

    let exports_dir = ws.join(CROQUIS_EXPORT_SUBDIR);
    std::fs::create_dir_all(&exports_dir).map_err(|e| {
        SicroError::Filesystem(format!(
            "cannot create exports dir {}: {}",
            exports_dir.display(),
            e
        ))
    })?;

    let ts = Utc::now().format("%Y%m%d_%H%M%S");
    let filename = format!("croqui_{}_{}.png", id, ts);
    let target = exports_dir.join(&filename);
    atomic_write_bytes(&target, &bytes)?;

    let relative_path = format!("{CROQUIS_EXPORT_SUBDIR}/{filename}");
    let now = Utc::now();
    croqui_repo::touch(
        &conn,
        &croqui.id,
        now,
        Some(&relative_path),
        Some(CroquiStatus::Ready),
    )?;

    occurrence_repo::record_audit(
        &conn,
        Some(&croqui.occurrence_id),
        "croqui.exported.png",
        Some("croqui"),
        Some("croqui"),
        Some(&croqui.id),
        Some(&relative_path),
    )?;

    Ok(relative_path)
}

// ---------------------------------------------------------------------------
// Helpers

fn write_doc(target: &Path, doc: &serde_json::Value) -> Result<()> {
    let bytes = serde_json::to_vec_pretty(doc)?;
    atomic_write_bytes(target, &bytes)?;
    Ok(())
}

/// Empty `.sicrocroqui` envelope — valid JSON the frontend Croqui Engine
/// can open immediately. The frontend's serializer will overwrite this on
/// the first save.
fn empty_envelope(c: &Croqui) -> serde_json::Value {
    serde_json::json!({
        "schema_version": c.schema_version,
        "croqui_id": c.id.to_string(),
        "occurrence_id": c.occurrence_id.to_string(),
        "title": c.title,
        "created_at": c.created_at.to_rfc3339(),
        "updated_at": c.updated_at.to_rfc3339(),
        "canvas": {
            "width_px": 1600,
            "height_px": 1000,
            "background_color": "#ffffff",
            "grid": { "enabled": true, "size_px": 50 }
        },
        "scale": null,
        "background_image": null,
        "layers": [
            { "id": "layer_background", "name": "Imagem de fundo", "visible": true, "locked": true, "kind": "background" },
            { "id": "layer_objects", "name": "Objetos", "visible": true, "locked": false, "kind": "objects" }
        ],
        "objects": []
    })
}
