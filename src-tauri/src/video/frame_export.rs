//! `ffmpeg` frame export — Spike F.
//!
//! Implements the lab's decision (`SICRO_VIDEO_LAB_RELATORIO.md` §6):
//! a frame is NOT a screenshot of the player. It's extracted from the
//! source file by ffmpeg with the request timestamp, written as PNG,
//! and accompanied by a sidecar JSON describing the technical context.
//!
//! Command used:
//!     ffmpeg -hide_banner -nostdin
//!            -ss <ts>
//!            -i <video>
//!            -frames:v 1
//!            -update 1
//!            -y <out.png>
//!
//! `-ss` BEFORE `-i` is the fast seek; ffmpeg may snap to the nearest
//! keyframe. For our purposes (≈ 1-frame precision is acceptable for a
//! storyboard panel, with the delta surfaced honestly), this is the
//! right trade-off. A future spike can add a slower accurate-seek mode
//! (`-ss` AFTER `-i`).

use std::path::{Path, PathBuf};
use std::process::Command;

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;

use crate::error::{Result, SicroError};

use super::probe::detect_ffprobe;

pub struct ExtractFrameOptions<'a> {
    pub video_path: &'a Path,
    pub timestamp_s: f64,
    pub out_png: &'a Path,
    /// Optional sidecar JSON path (next to the PNG). If None, sidecar is
    /// not written. The orchestrator decides — we just do disk + ffmpeg.
    pub sidecar_json: Option<&'a Path>,
    /// Echoed verbatim into the sidecar (media_hash, event_id, etc.) so
    /// the caller can attach domain context without us having to model it
    /// at this layer.
    pub sidecar_extra: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExtractedFrame {
    pub out_png: PathBuf,
    pub sidecar_json_path: Option<PathBuf>,
    pub requested_timestamp_s: f64,
    pub actual_timestamp_s: Option<f64>,
    pub delta_s: Option<f64>,
    pub size_bytes: u64,
    /// Captures the ffmpeg version line (first line of `ffmpeg -version`).
    pub ffmpeg_version: Option<String>,
    pub extracted_at: DateTime<Utc>,
}

/// Detect the `ffmpeg` binary in PATH. Same strategy as ffprobe (Spike F).
pub fn detect_ffmpeg() -> Result<PathBuf> {
    which("ffmpeg")
}

/// Extract a single frame from the video at the given timestamp.
pub fn extract_frame(opts: ExtractFrameOptions<'_>) -> Result<ExtractedFrame> {
    if !opts.video_path.is_file() {
        return Err(SicroError::Filesystem(format!(
            "video not found: {}",
            opts.video_path.display()
        )));
    }
    if let Some(parent) = opts.out_png.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            SicroError::Filesystem(format!(
                "cannot create frame export dir {}: {}",
                parent.display(),
                e
            ))
        })?;
    }
    let ffmpeg = detect_ffmpeg()?;

    let requested = format_seconds(opts.timestamp_s);
    let status = Command::new(&ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-ss",
            &requested,
            "-i",
        ])
        .arg(opts.video_path)
        .args(["-frames:v", "1", "-update", "1", "-y"])
        .arg(opts.out_png)
        .output()
        .map_err(|e| {
            SicroError::Workspace(format!(
                "could not spawn ffmpeg at {}: {}",
                ffmpeg.display(),
                e
            ))
        })?;
    if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        return Err(SicroError::Workspace(format!(
            "ffmpeg frame extraction failed (exit {:?}): {}",
            status.status.code(),
            stderr.trim()
        )));
    }
    if !opts.out_png.is_file() {
        return Err(SicroError::Workspace(
            "ffmpeg returned success but did not write the PNG".to_string(),
        ));
    }

    let size_bytes = std::fs::metadata(opts.out_png)
        .map(|m| m.len())
        .unwrap_or(0);

    // Try to read back the precise timestamp of the produced PNG by
    // re-running ffprobe on the SOURCE near that timestamp. ffmpeg with
    // fast `-ss` may snap to a keyframe; we surface the delta honestly.
    let actual = probe_actual_timestamp(opts.video_path, opts.timestamp_s).ok();
    let delta = actual.map(|a| a - opts.timestamp_s);

    let ffmpeg_version = detect_ffmpeg_version(&ffmpeg);
    let extracted = ExtractedFrame {
        out_png: opts.out_png.to_path_buf(),
        sidecar_json_path: opts.sidecar_json.map(Path::to_path_buf),
        requested_timestamp_s: opts.timestamp_s,
        actual_timestamp_s: actual,
        delta_s: delta,
        size_bytes,
        ffmpeg_version,
        extracted_at: Utc::now(),
    };

    if let Some(sidecar) = opts.sidecar_json {
        write_sidecar(sidecar, &extracted, &opts.sidecar_extra)?;
    }

    Ok(extracted)
}

/// Use ffprobe to find the PTS of the first frame at or after `ts_s`.
/// Used purely to surface the keyframe snap delta in the sidecar / UI.
fn probe_actual_timestamp(video: &Path, ts_s: f64) -> Result<f64> {
    let ffprobe = detect_ffprobe()?;
    // Read one packet starting from the requested timestamp.
    let output = Command::new(&ffprobe)
        .args([
            "-v",
            "error",
            "-read_intervals",
            &format!("{}%+0.5", ts_s.max(0.0)),
            "-select_streams",
            "v:0",
            "-show_entries",
            "packet=pts_time",
            "-of",
            "default=nokey=1:noprint_wrappers=1",
        ])
        .arg(video)
        .output()
        .map_err(|e| {
            SicroError::Workspace(format!(
                "could not spawn ffprobe at {}: {}",
                ffprobe.display(),
                e
            ))
        })?;
    if !output.status.success() {
        return Err(SicroError::Workspace(
            "ffprobe failed when reading actual timestamp".to_string(),
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let first = stdout
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .ok_or_else(|| {
            SicroError::Workspace("ffprobe returned no packets".to_string())
        })?;
    first
        .parse::<f64>()
        .map_err(|e| SicroError::Workspace(format!("invalid pts_time: {e}")))
}

fn write_sidecar(
    path: &Path,
    frame: &ExtractedFrame,
    extra: &serde_json::Value,
) -> Result<()> {
    let mut blob = serde_json::json!({
        "schema_version": "0.1",
        "kind": "video_frame_export",
        "requested_timestamp_s": frame.requested_timestamp_s,
        "actual_timestamp_s": frame.actual_timestamp_s,
        "delta_s": frame.delta_s,
        "output_path": frame.out_png.to_string_lossy(),
        "size_bytes": frame.size_bytes,
        "ffmpeg_version": frame.ffmpeg_version,
        "extracted_at": frame.extracted_at.to_rfc3339(),
        "software": "SICRO Desktop 2.0 / Spike F"
    });
    if let Value::Object(map) = extra {
        if let Some(obj) = blob.as_object_mut() {
            for (k, v) in map.iter() {
                obj.insert(k.clone(), v.clone());
            }
        }
    }
    let bytes = serde_json::to_vec_pretty(&blob)?;
    crate::filesystem::atomic_write_bytes(path, &bytes)?;
    Ok(())
}

fn detect_ffmpeg_version(ffmpeg: &Path) -> Option<String> {
    let output = Command::new(ffmpeg).arg("-version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .map(str::to_string)
}

/// Format seconds as `HH:MM:SS.mmm` — ffmpeg accepts both decimal seconds
/// and HH:MM:SS notation; we use the latter for readability in process
/// listings during debugging.
fn format_seconds(s: f64) -> String {
    let s = s.max(0.0);
    let total_ms = (s * 1000.0).round() as i64;
    let ms = total_ms % 1000;
    let total_s = total_ms / 1000;
    let sec = total_s % 60;
    let min = (total_s / 60) % 60;
    let hr = total_s / 3600;
    format!("{hr:02}:{min:02}:{sec:02}.{ms:03}")
}

/// Estimate the frame index from `timestamp_s` and a declared FPS.
/// Returns `None` if either input is missing/zero. The result is ALWAYS
/// estimated — the orchestrator must mark the row accordingly.
pub fn estimate_frame_index(timestamp_s: f64, fps_declared: Option<f64>) -> Option<i64> {
    let fps = fps_declared?;
    if fps <= 0.0 || !fps.is_finite() {
        return None;
    }
    Some((timestamp_s * fps).round() as i64)
}

fn which(name: &str) -> Result<PathBuf> {
    let path_env = std::env::var_os("PATH").ok_or_else(|| {
        SicroError::Filesystem("PATH environment variable is empty".to_string())
    })?;
    let mut candidates: Vec<String> = vec![name.to_string()];
    if cfg!(windows) {
        candidates.push(format!("{name}.exe"));
        candidates.push(format!("{name}.cmd"));
    }
    for dir in std::env::split_paths(&path_env) {
        for cand in &candidates {
            let full = dir.join(cand);
            if full.is_file() {
                return Ok(full);
            }
        }
    }
    Err(SicroError::Validation(format!(
        "binary '{name}' not found in PATH. Install FFmpeg and ensure ffmpeg + ffprobe are on the PATH."
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_seconds_pads_correctly() {
        assert_eq!(format_seconds(0.0), "00:00:00.000");
        assert_eq!(format_seconds(0.5), "00:00:00.500");
        assert_eq!(format_seconds(65.25), "00:01:05.250");
        assert_eq!(format_seconds(3661.001), "01:01:01.001");
    }

    #[test]
    fn estimate_frame_index_handles_missing_fps() {
        assert_eq!(estimate_frame_index(1.0, None), None);
        assert_eq!(estimate_frame_index(1.0, Some(0.0)), None);
        assert_eq!(estimate_frame_index(1.0, Some(f64::NAN)), None);
        assert_eq!(estimate_frame_index(1.0, Some(30.0)), Some(30));
        assert_eq!(estimate_frame_index(2.5, Some(30.0)), Some(75));
    }
}
