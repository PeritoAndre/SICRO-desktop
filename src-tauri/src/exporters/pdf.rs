//! PDF export via Microsoft Edge headless.
//!
//! Strategy: write the HTML to a temp file inside the workspace's `cache/`
//! folder, invoke `msedge.exe --headless=new --print-to-pdf=<out> file://<in>`,
//! wait for the subprocess to finish, and surface the resulting PDF.
//!
//! Why subprocess and not a Rust HTML→PDF crate?
//!   - Crates like `wkhtmltopdf`, `weasyprint` and `headless_chrome` all add
//!     either a heavy native dependency or wrap a Chromium handshake we'd
//!     have to maintain. Spawning Edge keeps the binary footprint of the
//!     SICRO app unchanged and uses the Chromium that already ships with
//!     Windows 11.
//!   - The `--print-to-pdf` flag has been part of Chromium since 2018 and is
//!     stable across Edge versions.
//!
//! Failure modes the caller must surface to the UI:
//!   - Edge executable not found  → "instale o Microsoft Edge" message.
//!   - Subprocess exit code != 0  → "Edge falhou ao gerar o PDF (exit X)".
//!   - Output file missing after Edge exited                       (idem).
//!   - Subprocess timeout                                           (idem).

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

use crate::error::{Result, SicroError};

const EDGE_KNOWN_PATHS: &[&str] = &[
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
];

const CHROME_KNOWN_PATHS: &[&str] = &[
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
];

/// Maximum wall-time we let Edge run before considering it stuck.
const PRINT_TIMEOUT: Duration = Duration::from_secs(45);

/// Render the given HTML string to a PDF file at `output_path`.
///
/// `cache_dir` is used to stash the temporary input HTML and is expected to
/// exist (workspace creation guarantees `<workspace>/cache/`).
pub fn render_html_to_pdf(html: &str, cache_dir: &Path, output_path: &Path) -> Result<()> {
    let browser = locate_browser()?;

    // 1. Write the HTML to a temporary file. We *don't* try to share the same
    //    name across invocations because parallel exports in the future will
    //    collide. Filename uses nanos for a quick unique suffix.
    let now_nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let input_path = cache_dir.join(format!("export_{now_nanos}.html"));
    std::fs::write(&input_path, html).map_err(|e| {
        SicroError::Filesystem(format!(
            "could not write temp HTML at {}: {}",
            input_path.display(),
            e
        ))
    })?;

    // 2. Build the input file URL. Edge requires file:/// on Windows, with
    //    backslashes converted to forward slashes.
    let input_url = path_to_file_url(&input_path)?;

    // 3. Spawn Edge.
    let started_at = Instant::now();
    let mut child = Command::new(&browser)
        .arg("--headless=new")
        .arg("--disable-gpu")
        .arg("--no-pdf-header-footer")
        .arg("--virtual-time-budget=5000")
        .arg(format!("--print-to-pdf={}", output_path.display()))
        .arg(&input_url)
        .spawn()
        .map_err(|e| {
            SicroError::Filesystem(format!(
                "could not start Edge at {}: {}",
                browser.display(),
                e
            ))
        })?;

    // 4. Wait with a manual timeout — `std::process::Child` doesn't expose
    //    `wait_timeout` without an extra crate, so we poll.
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let _ = std::fs::remove_file(&input_path);
                if !status.success() {
                    return Err(SicroError::Workspace(format!(
                        "Edge exited with status {}",
                        status.code().unwrap_or(-1)
                    )));
                }
                break;
            }
            Ok(None) => {
                if started_at.elapsed() > PRINT_TIMEOUT {
                    let _ = child.kill();
                    let _ = std::fs::remove_file(&input_path);
                    return Err(SicroError::Workspace(
                        "Edge headless timed out while generating the PDF".to_string(),
                    ));
                }
                std::thread::sleep(Duration::from_millis(120));
            }
            Err(e) => {
                let _ = std::fs::remove_file(&input_path);
                return Err(SicroError::Workspace(format!(
                    "failed to wait for Edge subprocess: {e}"
                )));
            }
        }
    }

    // 5. Sanity-check: the PDF should exist and not be empty.
    if !output_path.is_file() {
        return Err(SicroError::Workspace(format!(
            "Edge finished but no PDF was created at {}",
            output_path.display()
        )));
    }
    let metadata = std::fs::metadata(output_path)?;
    if metadata.len() == 0 {
        return Err(SicroError::Workspace(
            "Edge produced an empty PDF file".to_string(),
        ));
    }

    Ok(())
}

fn locate_browser() -> Result<PathBuf> {
    for path in EDGE_KNOWN_PATHS.iter().chain(CHROME_KNOWN_PATHS.iter()) {
        let p = PathBuf::from(path);
        if p.is_file() {
            return Ok(p);
        }
    }
    // Last resort: try to find chrome.exe in PATH (works for portable Chrome installs).
    if let Ok(output) = Command::new("where").arg("chrome.exe").output() {
        if output.status.success() {
            if let Ok(first_line) = String::from_utf8(output.stdout) {
                if let Some(first) = first_line.lines().next() {
                    let p = PathBuf::from(first.trim());
                    if p.is_file() {
                        return Ok(p);
                    }
                }
            }
        }
    }

    Err(SicroError::Workspace(
        "Microsoft Edge não encontrado. Instale o Edge ou configure manualmente o caminho de um navegador baseado em Chromium.".to_string(),
    ))
}

fn path_to_file_url(path: &Path) -> Result<String> {
    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let s = canonical
        .to_str()
        .ok_or_else(|| SicroError::Filesystem(format!("non-UTF8 path: {}", path.display())))?;
    // Strip Windows long-path prefix `\\?\` that `canonicalize` adds.
    let stripped = s.strip_prefix(r"\\?\").unwrap_or(s);
    Ok(format!("file:///{}", stripped.replace('\\', "/")))
}
