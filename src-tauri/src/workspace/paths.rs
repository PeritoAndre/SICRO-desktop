//! Path utilities for `.sicro` workspaces.

use std::path::{Path, PathBuf};

use crate::error::{Result, SicroError};
use crate::filesystem::sanitize_folder_name;

/// Compute the folder name (no path, no extension) for a workspace from
/// the data the user supplied. Falls back to "ocorrencia" if everything
/// is empty.
pub fn derive_workspace_name(
    numero_bo: Option<&str>,
    municipio: Option<&str>,
    short_id: &str,
) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(bo) = numero_bo {
        let bo = bo.trim();
        if !bo.is_empty() {
            parts.push(format!("BO_{}", bo.replace(['/', ' '], "_")));
        }
    }
    if let Some(mun) = municipio {
        let mun = mun.trim();
        if !mun.is_empty() {
            parts.push(mun.replace(' ', "_"));
        }
    }
    parts.push(short_id.to_string());
    sanitize_folder_name(&parts.join("_"))
}

/// Returns true if `path` looks like a `.sicro` workspace.
/// We only check the directory extension and the presence of the manifest.
/// Deep validation happens in `validation.rs`.
pub fn is_workspace_dir(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }
    matches!(path.extension().and_then(|s| s.to_str()), Some("sicro"))
        && path.join(super::manifest::MANIFEST_FILENAME).is_file()
}

/// Compute the full path for a fresh workspace, ensuring it doesn't already
/// exist (so we don't accidentally overwrite a sibling).
pub fn unique_workspace_path(parent: &Path, base_name: &str) -> Result<PathBuf> {
    let mut candidate = parent.join(format!("{base_name}.sicro"));
    let mut suffix = 1;
    while candidate.exists() {
        suffix += 1;
        candidate = parent.join(format!("{base_name}_{suffix}.sicro"));
        if suffix > 999 {
            return Err(SicroError::Workspace(format!(
                "could not find unique workspace name under {}",
                parent.display()
            )));
        }
    }
    Ok(candidate)
}
