//! O — Drag & drop de fotos no editor de laudo.
//!
//! Command que recebe paths de arquivos do drop event do Tauri
//! (`onDragDropEvent`), filtra extensões de imagem, copia para
//! `<workspace>/laudos/<laudo_id>/evidencias/photos/`, calcula hash
//! SHA-256, lê dimensões e EXIF, e devolve metadata pronta pro
//! frontend inserir como `figure` node no TipTap.
//!
//! Estrutura da pasta destino:
//!
//! ```text
//! <workspace>/
//!   laudos/<laudo_id>/evidencias/photos/
//!     <hash12>_<safe_basename>.<ext>       ← foto copiada
//!     <hash12>_<safe_basename>.<ext>.json  ← sidecar: EXIF + metadata
//! ```
//!
//! Os 12 primeiros chars do SHA-256 como prefixo garantem unicidade
//! mesmo se o user dropar dois arquivos com o mesmo nome de pastas
//! diferentes.
//!
//! O command é IDEMPOTENTE: se o user dropar a mesma foto duas vezes
//! (mesmo conteúdo, mesmo nome), o destino é igual (mesmo hash) e o
//! `atomic_write_bytes` simplesmente sobrescreve com bytes idênticos.

use std::path::PathBuf;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};

use crate::error::{Result, SicroError};
use crate::filesystem::{atomic_write_bytes, resolve_workspace_relative};
use crate::image_editor::metadata;

/// Extensões aceitas. Os formatos vetoriais (.svg) são intencionalmente
/// fora — eles não fazem sentido como "foto importada" em um laudo
/// pericial e a libimage não os parseia.
const ALLOWED_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff",
];

/// Resultado da importação de UMA foto. O frontend usa esses dados
/// pra montar o `figure` node no TipTap.
#[derive(Debug, Serialize)]
pub struct ImportedPhoto {
    /// Path relativo ao workspace (sempre forward slashes). Vai pro
    /// `figure.relative_path` no doc — o resolver de evidências
    /// (`relative-src.ts`) converte pra `convertFileSrc(...)` na hora
    /// de exibir.
    pub relative_path: String,
    /// Nome original do arquivo no disco do user. Vira `alt` por default.
    pub original_filename: String,
    /// Tamanho em bytes da foto importada.
    pub size_bytes: u64,
    /// SHA-256 hex completo (64 chars).
    pub sha256: String,
    /// Largura em pixels (0 se a libimage não conseguir parsear).
    pub width: u32,
    /// Altura em pixels (0 se a libimage não conseguir parsear).
    pub height: u32,
    /// MIME inferido pelo formato detectado.
    pub mime: String,
    /// EXIF cru em JSON (texto), quando a foto tem. `None` significa
    /// "nenhum EXIF disponível" — não é erro.
    pub exif_json: Option<String>,
    /// Data de captura parseada do EXIF, quando presente.
    pub date_taken: Option<String>,
}

/// Output de erro item-por-item — o command nunca aborta o lote inteiro
/// quando uma foto falha. Em vez disso devolve um vetor de erros por path.
#[derive(Debug, Serialize)]
pub struct PhotoImportError {
    pub source_path: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
pub struct PhotoImportResult {
    pub imported: Vec<ImportedPhoto>,
    pub errors: Vec<PhotoImportError>,
}

#[derive(Debug, Deserialize)]
pub struct ImportDraggedPhotosInput {
    pub workspace_path: String,
    pub laudo_id: String,
    pub file_paths: Vec<String>,
}

#[tauri::command]
pub async fn import_dragged_photos_to_laudo(
    input: ImportDraggedPhotosInput,
) -> Result<PhotoImportResult> {
    let ws = PathBuf::from(&input.workspace_path);
    if !ws.is_dir() {
        return Err(SicroError::Filesystem(format!(
            "workspace inválido: {}",
            ws.display()
        )));
    }

    let mut imported = Vec::new();
    let mut errors = Vec::new();

    for path_str in &input.file_paths {
        match import_one_photo(&ws, &input.laudo_id, path_str) {
            Ok(p) => imported.push(p),
            Err(e) => errors.push(PhotoImportError {
                source_path: path_str.clone(),
                reason: format!("{e}"),
            }),
        }
    }

    Ok(PhotoImportResult { imported, errors })
}

fn import_one_photo(
    ws: &std::path::Path,
    laudo_id: &str,
    path_str: &str,
) -> Result<ImportedPhoto> {
    let src = PathBuf::from(path_str);
    if !src.is_file() {
        return Err(SicroError::Filesystem(format!(
            "não é um arquivo: {}",
            src.display()
        )));
    }

    let extension = src
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase())
        .ok_or_else(|| SicroError::Validation("arquivo sem extensão".into()))?;
    if !ALLOWED_EXTENSIONS.contains(&extension.as_str()) {
        return Err(SicroError::Validation(format!(
            "extensão não suportada: .{extension} (aceitas: {})",
            ALLOWED_EXTENSIONS.join(", ")
        )));
    }

    let original_filename = src
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("foto")
        .to_string();
    let basename = src
        .file_stem()
        .and_then(|s| s.to_str())
        .map(sanitize_slug)
        .unwrap_or_else(|| "foto".into());

    // Lê os bytes uma única vez e computa o hash diretamente — assim
    // não temos race entre "calcular hash do dst" e "escrever dst".
    let bytes = std::fs::read(&src).map_err(|e| {
        SicroError::Filesystem(format!("não consegui ler {}: {e}", src.display()))
    })?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let hash_hex = format!("{:x}", hasher.finalize());
    let hash_short = &hash_hex[..12];

    // O laudo_id pode vir como um path traversal acidental (vindo do
    // frontend). `resolve_workspace_relative` (MVP 5) já se recusa a
    // sair do workspace, mas o sanitize aqui ajuda com mensagem de erro.
    let safe_laudo_id = sanitize_slug(laudo_id);
    let rel_dest = format!(
        "laudos/{}/evidencias/photos/{}_{}.{}",
        safe_laudo_id, hash_short, basename, extension
    );
    let abs_dest = resolve_workspace_relative(ws, &rel_dest)?;

    if let Some(parent) = abs_dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            SicroError::Filesystem(format!("não consegui criar diretório: {e}"))
        })?;
    }
    atomic_write_bytes(&abs_dest, &bytes)?;

    // Reusa a função do MVP 7 pra extrair dimensões + mime + EXIF.
    let meta = metadata::read_metadata(&abs_dest, false)?;
    let mime = meta
        .mime_type
        .unwrap_or_else(|| format!("image/{}", extension));
    let exif_json = meta.exif_json;
    let date_taken = exif_json.as_ref().and_then(extract_date_taken);

    // Sidecar JSON ao lado do binário — fonte de verdade para EXIF,
    // hash, dimensões e procedência. O .sicrodoc do laudo carrega
    // apenas o relative_path + um JSON resumido em metadata_json;
    // a versão completa fica aqui.
    let sidecar = json!({
        "schema_version": "1.0.0",
        "imported_at": Utc::now().to_rfc3339(),
        "source_filename": original_filename,
        "source_path_at_import": path_str,
        "sha256": hash_hex,
        "size_bytes": meta.size_bytes,
        "mime": mime,
        "dimensions": {
            "width": meta.width,
            "height": meta.height,
        },
        "exif": exif_json.as_ref().and_then(|j| serde_json::from_str::<serde_json::Value>(j).ok()),
    });
    let mut sidecar_path = abs_dest.clone();
    sidecar_path.set_extension(format!("{}.json", extension));
    atomic_write_bytes(
        &sidecar_path,
        &serde_json::to_vec_pretty(&sidecar)
            .map_err(|e| SicroError::Workspace(format!("sidecar json: {e}")))?,
    )?;

    Ok(ImportedPhoto {
        relative_path: rel_dest,
        original_filename,
        size_bytes: meta.size_bytes,
        sha256: hash_hex,
        width: meta.width,
        height: meta.height,
        mime,
        exif_json,
        date_taken,
    })
}

/// Best-effort: lê uma chave de "data de captura" do JSON cru de EXIF.
/// A função `read_exif_json` (kamadak-exif wrapper, G12.7) emite um
/// objeto com chaves snake_case; aqui só procuro nas mais comuns. Se
/// não achar, retorna None — não é erro.
fn extract_date_taken(exif_json: &String) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(exif_json).ok()?;
    for key in [
        "datetime_original",
        "DateTimeOriginal",
        "datetime",
        "DateTime",
        "datetime_digitized",
        "DateTimeDigitized",
    ] {
        if let Some(v) = parsed.get(key).and_then(|v| v.as_str()) {
            return Some(v.to_string());
        }
    }
    None
}

/// Mesma regra de `image_commands::sanitize_slug` mas vive aqui pra
/// não acoplar este módulo ao MVP 7. Mantém ASCII-only, troca outros
/// chars por `_`, trima underscores e corta em 40 chars.
fn sanitize_slug(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        let ok = c.is_ascii_alphanumeric() || c == '-' || c == '_';
        out.push(if ok { c } else { '_' });
    }
    let trimmed: String = out.trim_matches('_').chars().take(40).collect();
    if trimmed.is_empty() {
        "foto".to_string()
    } else {
        trimmed
    }
}
