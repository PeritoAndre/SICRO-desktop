//! Atomic file write — write to a sibling temp file, fsync, then rename.
//!
//! Why this matters: if the app dies mid-write, the original file stays
//! intact. `manifest.json` corruption would brick a workspace, so every
//! write goes through this helper.

use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use crate::error::{Result, SicroError};

pub fn atomic_write_bytes(target: &Path, bytes: &[u8]) -> Result<()> {
    let parent = target
        .parent()
        .ok_or_else(|| SicroError::Filesystem(format!("path has no parent: {}", target.display())))?;

    fs::create_dir_all(parent)?;

    // Use a `.tmp` sibling so we stay on the same volume (rename is atomic on
    // the same filesystem on every platform we care about).
    let tmp_name = format!(
        "{}.tmp",
        target
            .file_name()
            .ok_or_else(|| SicroError::Filesystem(format!(
                "path has no filename: {}",
                target.display()
            )))?
            .to_string_lossy()
    );
    let tmp_path = parent.join(tmp_name);

    {
        let mut f = File::create(&tmp_path)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }

    // On Windows, fs::rename will fail if the destination exists; we want
    // overwrite semantics, so try once and fall back to remove+rename.
    match fs::rename(&tmp_path, target) {
        Ok(()) => Ok(()),
        Err(_) => {
            if target.exists() {
                fs::remove_file(target).ok();
            }
            fs::rename(&tmp_path, target)?;
            Ok(())
        }
    }
}
