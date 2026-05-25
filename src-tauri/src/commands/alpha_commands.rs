//! Tauri commands para a consolidação Alpha (MVP 8).
//!
//! Três commands:
//!   - `generate_workspace_backup` — gera o `.sicrobackup` (zip).
//!   - `get_system_health_snapshot` — devolve o snapshot JSON
//!     (rápido, sem escrever em disco).
//!   - `generate_system_health_report` — grava o HTML do snapshot
//!     dentro de `<workspace>/reports/`.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::database::connection::open_connection;
use crate::database::migrations::run_migrations;
use crate::database::repositories::occurrence_repo;
use crate::error::Result;
use crate::workspace::{
    create_backup, BackupArtifact, HealthReportArtifact, SystemHealthSnapshot,
};
use crate::workspace::{build_snapshot, render_and_save};
use crate::workspace::manifest::{Manifest, SQLITE_FILENAME};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupArtifactJson {
    pub absolute_path: String,
    pub relative_path: String,
    pub filename: String,
    pub size_bytes: u64,
    pub hash_sha256: String,
    pub file_count: u32,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl From<BackupArtifact> for BackupArtifactJson {
    fn from(a: BackupArtifact) -> Self {
        Self {
            absolute_path: a.absolute_path.to_string_lossy().into_owned(),
            relative_path: a.relative_path,
            filename: a.filename,
            size_bytes: a.size_bytes,
            hash_sha256: a.hash_sha256,
            file_count: a.file_count,
            created_at: a.created_at,
        }
    }
}

#[tauri::command]
pub async fn generate_workspace_backup(
    workspace_path: String,
    destination: Option<String>,
    bo_label: Option<String>,
) -> Result<BackupArtifactJson> {
    let ws = PathBuf::from(&workspace_path);
    let manifest = Manifest::read(&ws)?;
    let dest = destination.map(PathBuf::from);

    let artifact = create_backup(&ws, dest.as_deref(), bo_label.as_deref())?;

    // Audit log (best-effort).
    if let Ok(conn) = open_connection(&ws.join(SQLITE_FILENAME)) {
        let _ = occurrence_repo::record_audit(
            &conn,
            Some(&manifest.occurrence_id),
            "workspace.backup_generated",
            Some("alpha"),
            Some("backup"),
            None,
            Some(&artifact.hash_sha256),
        );
    }

    Ok(BackupArtifactJson::from(artifact))
}

#[tauri::command]
pub async fn get_system_health_snapshot(
    workspace_path: Option<String>,
) -> Result<SystemHealthSnapshot> {
    let ws = workspace_path.map(PathBuf::from);
    build_snapshot(ws.as_deref())
}

#[tauri::command]
pub async fn generate_system_health_report(
    workspace_path: Option<String>,
) -> Result<HealthReportArtifact> {
    let ws = workspace_path.map(PathBuf::from);
    let snapshot = build_snapshot(ws.as_deref())?;
    let artifact = render_and_save(ws.as_deref(), &snapshot)?;

    // Audit log (best-effort, only when workspace given).
    if let Some(path) = ws.as_deref() {
        if let Ok(manifest) = Manifest::read(path) {
            if let Ok(mut conn) = open_connection(&path.join(SQLITE_FILENAME)) {
                let _ = run_migrations(&mut conn);
                let _ = occurrence_repo::record_audit(
                    &conn,
                    Some(&manifest.occurrence_id),
                    "system.health_report_generated",
                    Some("alpha"),
                    Some("health_report"),
                    None,
                    Some(&artifact.relative_path),
                );
            }
        }
    }
    Ok(artifact)
}
