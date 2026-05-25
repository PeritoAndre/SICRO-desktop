//! Image metadata helpers (MVP 7).
//!
//! Lê dimensões, formato e tamanho do arquivo sem decodificar a
//! imagem inteira quando possível (`image::ImageReader::with_guessed_format`).
//! Hash SHA-256 é calculado por demanda — não no momento da leitura
//! de metadados.

use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use image::ImageReader;

use crate::error::{Result, SicroError};
use crate::hashing::sha256::sha256_file;
use crate::models::ImageMetadata;

pub fn read_metadata(abs_path: &Path, compute_hash: bool) -> Result<ImageMetadata> {
    let meta = std::fs::metadata(abs_path).map_err(|e| {
        SicroError::Filesystem(format!(
            "cannot stat image at {}: {}",
            abs_path.display(),
            e
        ))
    })?;
    let size_bytes = meta.len();
    let file = File::open(abs_path).map_err(|e| {
        SicroError::Filesystem(format!(
            "cannot open image at {}: {}",
            abs_path.display(),
            e
        ))
    })?;
    let buf = BufReader::new(file);
    let reader = ImageReader::new(buf)
        .with_guessed_format()
        .map_err(|e| SicroError::Filesystem(format!("io error: {e}")))?;
    let format = reader.format();
    let (width, height) = match reader.into_dimensions() {
        Ok(d) => d,
        Err(_) => (0, 0),
    };
    let mime_type = format.map(|f| match f {
        image::ImageFormat::Png => "image/png".to_string(),
        image::ImageFormat::Jpeg => "image/jpeg".to_string(),
        image::ImageFormat::Gif => "image/gif".to_string(),
        image::ImageFormat::WebP => "image/webp".to_string(),
        image::ImageFormat::Bmp => "image/bmp".to_string(),
        image::ImageFormat::Tiff => "image/tiff".to_string(),
        _ => "application/octet-stream".to_string(),
    });
    let format_label = format.map(|f| format!("{:?}", f));
    let hash = if compute_hash {
        sha256_file(abs_path).ok()
    } else {
        None
    };

    Ok(ImageMetadata {
        width,
        height,
        mime_type,
        format_label,
        size_bytes,
        hash_sha256: hash,
        // EXIF parsing está fora do escopo do MVP 7. Spike futuro.
        exif_json: None,
    })
}

/// Map common extensions to mime types — used when criar análise a
/// partir de arquivo local antes de decidir gravar.
pub fn guess_mime_for_path(path: &Path) -> Option<&'static str> {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())?
        .to_ascii_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "tif" | "tiff" => "image/tiff",
        _ => return None,
    })
}
