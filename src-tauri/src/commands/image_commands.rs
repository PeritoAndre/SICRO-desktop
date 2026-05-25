//! Tauri commands for the Image Editor (MVP 7).
//!
//! Oito commands cobrindo o ciclo de vida da análise:
//!   - `create_image_analysis_from_evidence` — cria a partir de um item
//!     já no workspace (`relative_path` conhecido — foto do Dossiê,
//!     frame do Vídeo, evidência da Central).
//!   - `create_image_analysis_from_file` — copia uma imagem do disco
//!     do usuário para `imagens/originais/`, calcula hash e cria a
//!     análise.
//!   - `list_image_analyses` — todas da ocorrência ativa.
//!   - `read_image_analysis` — row + envelope `.sicroimage` parseado.
//!   - `save_image_analysis` — grava o `.sicroimage` no disco e
//!     atualiza `updated_at` (e o `metadata_json` quando o frontend
//!     passar).
//!   - `export_image_derivative` — pipeline + sidecar + linha em
//!     `image_exports`.
//!   - `read_image_asset` — bytes base64 (mesmo contrato do MVP 4).
//!   - `get_image_metadata` — dimensões / mime / hash sem decodificar.
//!
//! Path safety usa o helper compartilhado do MVP 5.

use std::path::{Path, PathBuf};

use base64::Engine as _;
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::database::connection::open_connection;
use crate::database::migrations::run_migrations;
use crate::database::repositories::{
    image_analysis_repo, occurrence_repo,
};
use crate::error::{Result, SicroError};
use crate::filesystem::{
    atomic_write_bytes, resolve_workspace_relative, sanitize_relative_path,
};
use crate::hashing::sha256::sha256_file;
use crate::image_editor::{metadata, pipeline};
use crate::models::{
    CreateImageAnalysisInput, ExportImageInput, ImageAnalysis, ImageAssetBytes,
    ImageExport, ImageMetadata, ImageOperationLog, ImageSourceKind,
    ImportLocalImageInput,
};
use crate::workspace::manifest::{Manifest, SQLITE_FILENAME};

const ANALYSES_DIR: &str = "imagens/analises";
const ORIGINALS_DIR: &str = "imagens/originais";

#[derive(Debug, Clone, Deserialize)]
pub struct SaveImageAnalysisInput {
    /// JSON inteiro do `.sicroimage`. O backend valida apenas que é
    /// um objeto JSON; o schema completo vive no frontend.
    pub doc: serde_json::Value,
    /// Quando presente, é o novo `metadata_json` a gravar na linha
    /// SQLite (tamanho/preview/dimensões etc.). Quando ausente, a
    /// linha existente é mantida.
    pub metadata_json: Option<String>,
    /// Optional new title — atualiza o registro.
    pub title: Option<String>,
}

#[tauri::command]
pub async fn create_image_analysis_from_evidence(
    workspace_path: String,
    input: CreateImageAnalysisInput,
) -> Result<ImageAnalysis> {
    let ws = PathBuf::from(&workspace_path);
    let manifest = Manifest::read(&ws)?;
    let mut conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    run_migrations(&mut conn)?;

    // Validate the source path exists.
    let abs_src = resolve_workspace_relative(&ws, &input.original_relative_path)?;
    if !abs_src.is_file() {
        return Err(SicroError::Filesystem(format!(
            "imagem original não encontrada em {}",
            abs_src.display()
        )));
    }
    let meta_metadata = metadata::read_metadata(&abs_src, false)?;

    let now = Utc::now();
    let id = Uuid::new_v4();
    let rel_doc = format!(
        "{}/imagem_{}.sicroimage",
        ANALYSES_DIR,
        &id.to_string()[..8],
    );
    write_initial_sicroimage(&ws, &rel_doc, &id, &manifest.occurrence_id, &input, &meta_metadata)?;

    let row = ImageAnalysis {
        id,
        occurrence_id: manifest.occurrence_id,
        title: input.title.clone(),
        source_kind: input.source_kind,
        source_id: input.source_id.clone(),
        original_relative_path: input.original_relative_path.clone(),
        original_hash_sha256: input.original_hash_sha256.clone(),
        analysis_relative_path: rel_doc.clone(),
        last_export_relative_path: None,
        status: "draft".to_string(),
        metadata_json: serde_json::to_string(&meta_metadata)
            .unwrap_or_else(|_| "{}".to_string()),
        created_at: now,
        updated_at: now,
    };
    image_analysis_repo::insert(&conn, &row)?;
    image_analysis_repo::insert_log(
        &conn,
        &manifest.occurrence_id,
        &id,
        "analysis.created",
        &json!({
            "source_kind": input.source_kind.as_str(),
            "source_id": input.source_id,
            "original_relative_path": input.original_relative_path,
        })
        .to_string(),
    )?;
    occurrence_repo::record_audit(
        &conn,
        Some(&manifest.occurrence_id),
        "image.analysis_created",
        Some("image_editor"),
        Some("image_analysis"),
        Some(&id),
        Some(input.source_kind.as_str()),
    )?;
    Ok(row)
}

#[tauri::command]
pub async fn create_image_analysis_from_file(
    workspace_path: String,
    input: ImportLocalImageInput,
) -> Result<ImageAnalysis> {
    let ws = PathBuf::from(&workspace_path);
    let manifest = Manifest::read(&ws)?;
    let mut conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    run_migrations(&mut conn)?;

    let src = PathBuf::from(&input.source_path);
    if !src.is_file() {
        return Err(SicroError::Filesystem(format!(
            "arquivo não existe: {}",
            src.display()
        )));
    }
    let extension = src
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase())
        .ok_or_else(|| SicroError::Validation("arquivo sem extensão".into()))?;
    let allowed = ["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"];
    if !allowed.contains(&extension.as_str()) {
        return Err(SicroError::Validation(format!(
            "extensão não suportada: {extension}"
        )));
    }
    let file_id = Uuid::new_v4();
    let basename = src
        .file_stem()
        .and_then(|s| s.to_str())
        .map(sanitize_slug)
        .unwrap_or_else(|| "imagem".into());
    let rel_dest = format!(
        "{}/{}__{}.{}",
        ORIGINALS_DIR,
        basename,
        &file_id.to_string()[..8],
        extension,
    );
    let abs_dest = resolve_workspace_relative(&ws, &rel_dest)?;
    if let Some(parent) = abs_dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            SicroError::Filesystem(format!("cannot create originals dir: {e}"))
        })?;
    }
    let bytes = std::fs::read(&src).map_err(|e| {
        SicroError::Filesystem(format!("cannot read {}: {}", src.display(), e))
    })?;
    atomic_write_bytes(&abs_dest, &bytes)?;
    let hash = sha256_file(&abs_dest).ok();
    let meta_metadata = metadata::read_metadata(&abs_dest, false)?;

    let title = input
        .title
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| basename.clone());

    let payload = CreateImageAnalysisInput {
        title,
        source_kind: ImageSourceKind::LocalImport,
        source_id: Some(file_id.to_string()),
        original_relative_path: rel_dest.clone(),
        original_hash_sha256: hash.clone(),
    };

    let now = Utc::now();
    let id = Uuid::new_v4();
    let rel_doc = format!(
        "{}/imagem_{}.sicroimage",
        ANALYSES_DIR,
        &id.to_string()[..8],
    );
    write_initial_sicroimage(
        &ws,
        &rel_doc,
        &id,
        &manifest.occurrence_id,
        &payload,
        &meta_metadata,
    )?;

    let row = ImageAnalysis {
        id,
        occurrence_id: manifest.occurrence_id,
        title: payload.title.clone(),
        source_kind: payload.source_kind,
        source_id: payload.source_id.clone(),
        original_relative_path: rel_dest.clone(),
        original_hash_sha256: hash,
        analysis_relative_path: rel_doc,
        last_export_relative_path: None,
        status: "draft".to_string(),
        metadata_json: serde_json::to_string(&meta_metadata)
            .unwrap_or_else(|_| "{}".to_string()),
        created_at: now,
        updated_at: now,
    };
    image_analysis_repo::insert(&conn, &row)?;
    image_analysis_repo::insert_log(
        &conn,
        &manifest.occurrence_id,
        &id,
        "analysis.created_from_file",
        &json!({
            "original_relative_path": rel_dest,
            "source_path": input.source_path,
        })
        .to_string(),
    )?;
    occurrence_repo::record_audit(
        &conn,
        Some(&manifest.occurrence_id),
        "image.analysis_created",
        Some("image_editor"),
        Some("image_analysis"),
        Some(&id),
        Some("local_import"),
    )?;
    Ok(row)
}

#[tauri::command]
pub async fn list_image_analyses(
    workspace_path: String,
) -> Result<Vec<ImageAnalysis>> {
    let ws = PathBuf::from(&workspace_path);
    let manifest = Manifest::read(&ws)?;
    let conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    image_analysis_repo::list_by_occurrence(&conn, &manifest.occurrence_id)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ImageAnalysisPayload {
    pub analysis: ImageAnalysis,
    pub doc: serde_json::Value,
}

#[tauri::command]
pub async fn read_image_analysis(
    workspace_path: String,
    analysis_id: String,
) -> Result<ImageAnalysisPayload> {
    let ws = PathBuf::from(&workspace_path);
    let _ = Manifest::read(&ws)?;
    let id = Uuid::parse_str(&analysis_id)
        .map_err(|e| SicroError::Validation(format!("analysis_id inválido: {e}")))?;
    let conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    let analysis = image_analysis_repo::find_by_id(&conn, &id)?
        .ok_or_else(|| SicroError::Validation(format!("análise {} não encontrada", id)))?;
    let abs_doc = resolve_workspace_relative(&ws, &analysis.analysis_relative_path)?;
    let bytes = std::fs::read(&abs_doc).map_err(|e| {
        SicroError::Filesystem(format!(
            "cannot read {}: {}",
            abs_doc.display(),
            e
        ))
    })?;
    let doc: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(SicroError::from)?;
    Ok(ImageAnalysisPayload { analysis, doc })
}

#[tauri::command]
pub async fn save_image_analysis(
    workspace_path: String,
    analysis_id: String,
    input: SaveImageAnalysisInput,
) -> Result<ImageAnalysis> {
    let ws = PathBuf::from(&workspace_path);
    let _ = Manifest::read(&ws)?;
    let id = Uuid::parse_str(&analysis_id)
        .map_err(|e| SicroError::Validation(format!("analysis_id inválido: {e}")))?;
    let conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    let mut analysis = image_analysis_repo::find_by_id(&conn, &id)?
        .ok_or_else(|| SicroError::Validation(format!("análise {} não encontrada", id)))?;

    // Persist the .sicroimage JSON.
    let abs_doc = resolve_workspace_relative(&ws, &analysis.analysis_relative_path)?;
    if let Some(parent) = abs_doc.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let bytes = serde_json::to_vec_pretty(&input.doc)?;
    atomic_write_bytes(&abs_doc, &bytes)?;

    let now = Utc::now();
    if let Some(title) = input.title.as_deref() {
        if title.trim() != analysis.title {
            conn.execute(
                "UPDATE image_analyses SET title = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![title.trim(), now.to_rfc3339(), id.to_string()],
            )?;
            analysis.title = title.trim().to_string();
        }
    }
    if let Some(metadata_json) = input.metadata_json.as_deref() {
        if metadata_json != analysis.metadata_json {
            conn.execute(
                "UPDATE image_analyses SET metadata_json = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![metadata_json, now.to_rfc3339(), id.to_string()],
            )?;
            analysis.metadata_json = metadata_json.to_string();
        }
    }
    image_analysis_repo::touch_updated(&conn, &id, now, None)?;
    analysis.updated_at = now;

    image_analysis_repo::insert_log(
        &conn,
        &analysis.occurrence_id,
        &id,
        "analysis.saved",
        "{}",
    )?;
    Ok(analysis)
}

#[tauri::command]
pub async fn export_image_derivative(
    workspace_path: String,
    analysis_id: String,
    input: ExportImageInput,
) -> Result<ImageExport> {
    let ws = PathBuf::from(&workspace_path);
    let _ = Manifest::read(&ws)?;
    let id = Uuid::parse_str(&analysis_id)
        .map_err(|e| SicroError::Validation(format!("analysis_id inválido: {e}")))?;
    let mut conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    run_migrations(&mut conn)?;
    let analysis = image_analysis_repo::find_by_id(&conn, &id)?
        .ok_or_else(|| SicroError::Validation(format!("análise {} não encontrada", id)))?;

    let artifact = pipeline::run_export(&ws, &analysis, &input)?;

    let now = Utc::now();
    let export = ImageExport {
        id: Uuid::new_v4(),
        occurrence_id: analysis.occurrence_id,
        image_analysis_id: analysis.id,
        output_relative_path: artifact.output_relative_path.clone(),
        sidecar_relative_path: Some(artifact.sidecar_relative_path.clone()),
        hash_sha256: Some(artifact.hash_sha256.clone()),
        width: Some(artifact.width as i32),
        height: Some(artifact.height as i32),
        format: artifact.format.clone(),
        created_at: now,
        operation_summary_json: input
            .operation_summary_json
            .clone()
            .unwrap_or_else(|| "{}".to_string()),
    };
    image_analysis_repo::insert_export(&conn, &export)?;
    image_analysis_repo::touch_updated(
        &conn,
        &analysis.id,
        now,
        Some(&artifact.output_relative_path),
    )?;
    image_analysis_repo::insert_log(
        &conn,
        &analysis.occurrence_id,
        &analysis.id,
        "analysis.exported",
        &json!({
            "format": artifact.format,
            "hash_sha256": artifact.hash_sha256,
            "output_relative_path": artifact.output_relative_path,
            "sidecar_relative_path": artifact.sidecar_relative_path,
            "size_bytes": artifact.size_bytes,
        })
        .to_string(),
    )?;
    occurrence_repo::record_audit(
        &conn,
        Some(&analysis.occurrence_id),
        "image.exported",
        Some("image_editor"),
        Some("image_export"),
        Some(&export.id),
        Some(&artifact.format),
    )?;
    Ok(export)
}

#[tauri::command]
pub async fn read_image_asset(
    workspace_path: String,
    relative_path: String,
) -> Result<ImageAssetBytes> {
    let ws = PathBuf::from(&workspace_path);
    let _ = Manifest::read(&ws)?;
    let safe = sanitize_relative_path(&relative_path)?;
    let abs = ws.join(&safe);
    if !abs.is_file() {
        return Err(SicroError::Filesystem(format!(
            "asset não encontrado em {}",
            abs.display()
        )));
    }
    let bytes = std::fs::read(&abs)?;
    let size_bytes = bytes.len() as u64;
    let mime_type = metadata::guess_mime_for_path(&safe)
        .unwrap_or("application/octet-stream")
        .to_string();
    let base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(ImageAssetBytes {
        relative_path,
        mime_type,
        base64,
        size_bytes,
    })
}

#[tauri::command]
pub async fn get_image_metadata(
    workspace_path: String,
    relative_path: String,
    compute_hash: Option<bool>,
) -> Result<ImageMetadata> {
    let ws = PathBuf::from(&workspace_path);
    let _ = Manifest::read(&ws)?;
    let abs = resolve_workspace_relative(&ws, &relative_path)?;
    if !abs.is_file() {
        return Err(SicroError::Filesystem(format!(
            "asset não encontrado em {}",
            abs.display()
        )));
    }
    metadata::read_metadata(&abs, compute_hash.unwrap_or(false))
}

#[tauri::command]
pub async fn list_image_operation_logs(
    workspace_path: String,
    analysis_id: String,
    limit: Option<i64>,
) -> Result<Vec<ImageOperationLog>> {
    let ws = PathBuf::from(&workspace_path);
    let _ = Manifest::read(&ws)?;
    let id = Uuid::parse_str(&analysis_id)
        .map_err(|e| SicroError::Validation(format!("analysis_id inválido: {e}")))?;
    let conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    image_analysis_repo::list_logs_for_analysis(&conn, &id, limit.unwrap_or(200))
}

// ---------------------------------------------------------------------------
// Helpers

fn write_initial_sicroimage(
    workspace_root: &Path,
    rel_doc: &str,
    id: &Uuid,
    occurrence_id: &Uuid,
    input: &CreateImageAnalysisInput,
    meta: &ImageMetadata,
) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    let envelope = json!({
        "schema_version": "0.1",
        "image_analysis_id": id.to_string(),
        "occurrence_id": occurrence_id.to_string(),
        "title": input.title,
        "source": {
            "kind": input.source_kind.as_str(),
            "source_id": input.source_id,
            "original_relative_path": input.original_relative_path,
            "original_hash_sha256": input.original_hash_sha256,
            "mime_type": meta.mime_type,
            "width": meta.width,
            "height": meta.height,
            "size_bytes": meta.size_bytes,
        },
        "canvas": {
            "zoom": 1.0,
            "pan_x": 0.0,
            "pan_y": 0.0,
            "rotation": 0.0,
            "background_color": "#1f2933",
        },
        "view_adjustments": {
            "brightness": 0.0,
            "contrast": 0.0,
            "exposure": 0.0,
            "gamma": 1.0,
            "saturation": 0.0,
            "grayscale": false,
            "invert": false,
        },
        "processing_stack": [],
        "layers": [
            {
                "id": "layer_base",
                "name": "Imagem base",
                "kind": "image_base",
                "visible": true,
                "locked": true,
                "opacity": 1.0,
            },
            {
                "id": "layer_annotations",
                "name": "Anotações",
                "kind": "annotations",
                "visible": true,
                "locked": false,
                "opacity": 1.0,
            },
        ],
        "annotations": [],
        "measurements": [],
        "scale": null,
        "exports": [],
        "created_at": now,
        "updated_at": now,
    });
    let abs = resolve_workspace_relative(workspace_root, rel_doc)?;
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            SicroError::Filesystem(format!("cannot create analises dir: {e}"))
        })?;
    }
    let bytes = serde_json::to_vec_pretty(&envelope)?;
    atomic_write_bytes(&abs, &bytes)?;
    Ok(())
}

fn sanitize_slug(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        let ok = c.is_ascii_alphanumeric() || c == '-' || c == '_';
        out.push(if ok { c } else { '_' });
    }
    let trimmed: String = out.trim_matches('_').chars().take(40).collect();
    if trimmed.is_empty() {
        "imagem".to_string()
    } else {
        trimmed
    }
}
