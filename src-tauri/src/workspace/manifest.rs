//! Workspace manifest (`manifest.json`).
//!
//! Stable contract — every workspace on disk must have this file. The shape
//! follows doc 02 §10. Future fields go in `integrity` or under a new optional
//! key; never change existing field names.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::Path;
use uuid::Uuid;

use crate::error::{Result, SicroError};
use crate::filesystem::atomic_write_bytes;

pub const MANIFEST_FILENAME: &str = "manifest.json";
pub const SQLITE_FILENAME: &str = "sicro.sqlite";
pub const FORMAT_TAG: &str = "sicro-workspace";
pub const FORMAT_VERSION: &str = "2.0.0";
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Integrity {
    pub strategy: String,
    pub manifest_hash: Option<String>,
}

impl Default for Integrity {
    fn default() -> Self {
        Self {
            strategy: "sha256".to_string(),
            manifest_hash: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub format: String,
    pub version: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub workspace_id: Uuid,
    pub occurrence_id: Uuid,
    pub app_version: String,
    pub database: String,
    pub integrity: Integrity,
}

impl Manifest {
    pub fn new(workspace_id: Uuid, occurrence_id: Uuid) -> Self {
        let now = Utc::now();
        Self {
            format: FORMAT_TAG.to_string(),
            version: FORMAT_VERSION.to_string(),
            created_at: now,
            updated_at: now,
            workspace_id,
            occurrence_id,
            app_version: APP_VERSION.to_string(),
            database: SQLITE_FILENAME.to_string(),
            integrity: Integrity::default(),
        }
    }

    pub fn read(workspace_dir: &Path) -> Result<Self> {
        let path = workspace_dir.join(MANIFEST_FILENAME);
        let bytes = std::fs::read(&path).map_err(|e| {
            SicroError::Workspace(format!(
                "failed to read {} at {}: {}",
                MANIFEST_FILENAME,
                path.display(),
                e
            ))
        })?;
        let manifest: Manifest = serde_json::from_slice(&bytes)?;

        if manifest.format != FORMAT_TAG {
            return Err(SicroError::Workspace(format!(
                "unexpected manifest format: '{}' (expected '{}')",
                manifest.format, FORMAT_TAG
            )));
        }
        Ok(manifest)
    }

    pub fn write(&self, workspace_dir: &Path) -> Result<()> {
        let path = workspace_dir.join(MANIFEST_FILENAME);
        let bytes = serde_json::to_vec_pretty(self)?;
        atomic_write_bytes(&path, &bytes)?;
        Ok(())
    }

    pub fn touch(&mut self) {
        self.updated_at = Utc::now();
    }
}
