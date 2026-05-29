//! Tauri commands for the Laudo module.
//!
//! Spike B exposes the minimum surface required to validate the Document
//! Engine end-to-end:
//!   - create a laudo (row + empty .sicrodoc on disk);
//!   - list laudos of a workspace;
//!   - read a laudo's full document JSON;
//!   - save (overwrite) a laudo's document JSON.
//!
//! The schema of `doc` (TipTap-based) is owned by the front-end Document
//! Engine. The Rust side treats it as opaque JSON.

use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::database::connection::open_connection;
use crate::database::migrations::run_migrations;
use crate::database::repositories::{laudo_repo, occurrence_repo};
use crate::error::{Result, SicroError};
use crate::filesystem::{atomic_write_bytes, resolve_workspace_relative};
use crate::hashing::sha256::sha256_file;
use crate::models::{Laudo, LaudoDoc, LaudoStatus, NewLaudoInput};
use crate::workspace::manifest::{Manifest, SQLITE_FILENAME};

const LAUDOS_SUBDIR: &str = "laudos";

#[tauri::command]
pub async fn create_laudo(
    workspace_path: String,
    input: NewLaudoInput,
) -> Result<LaudoDoc> {
    let ws = PathBuf::from(&workspace_path);
    let manifest = Manifest::read(&ws)?;

    let mut conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    run_migrations(&mut conn)?;

    let now = Utc::now();
    let id = Uuid::new_v4();
    let relative_path = format!("{LAUDOS_SUBDIR}/laudo_{}.sicrodoc", id);

    let laudo = Laudo {
        id,
        occurrence_id: manifest.occurrence_id,
        title: if input.title.trim().is_empty() {
            "Laudo sem título".to_string()
        } else {
            input.title.trim().to_string()
        },
        template_id: if input.template_id.trim().is_empty() {
            "documento_livre".to_string()
        } else {
            input.template_id.trim().to_string()
        },
        relative_path: relative_path.clone(),
        status: LaudoStatus::Rascunho,
        created_at: now,
        updated_at: now,
        last_export_pdf: None,
        last_export_docx: None,
        signature_type: None,
    };

    laudo_repo::insert(&conn, &laudo)?;
    occurrence_repo::record_audit(
        &conn,
        Some(&laudo.occurrence_id),
        "laudo.created",
        Some("laudo"),
        Some("laudo"),
        Some(&laudo.id),
        None,
    )?;

    // Write the initial .sicrodoc envelope. The front-end will overwrite it
    // with a real TipTap document on first save; until then we ship a valid
    // empty document so a read-after-create never fails.
    let envelope = empty_envelope(&laudo);
    let target = ws.join(&relative_path);
    write_doc(&target, &envelope)?;

    Ok(LaudoDoc {
        laudo,
        doc: envelope,
    })
}

#[tauri::command]
pub async fn list_laudos(workspace_path: String) -> Result<Vec<Laudo>> {
    let ws = PathBuf::from(&workspace_path);
    let manifest = Manifest::read(&ws)?;

    let mut conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    run_migrations(&mut conn)?;

    let mut list = laudo_repo::list_by_occurrence(&conn, &manifest.occurrence_id)?;

    // H — best-effort: lê cada `.sicrodoc` e extrai `finalization.signature.type`.
    // Falhas são silenciosas (laudo continua sem badge na lista).
    for laudo in list.iter_mut() {
        if let Some(sig_type) = read_signature_type(&ws, &laudo.relative_path) {
            laudo.signature_type = Some(sig_type);
        }
    }

    Ok(list)
}

/// Lê o `.sicrodoc` no disco e retorna o `type` da assinatura digital
/// (`finalization.signature.type`), se houver. Falhas silenciosas.
fn read_signature_type(ws: &Path, relative_path: &str) -> Option<String> {
    let abs = ws.join(relative_path);
    let bytes = std::fs::read(&abs).ok()?;
    let v: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    v.get("finalization")
        .and_then(|f| f.get("signature"))
        .and_then(|s| s.get("type"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
}

#[tauri::command]
pub async fn read_laudo(workspace_path: String, laudo_id: String) -> Result<LaudoDoc> {
    let ws = PathBuf::from(&workspace_path);
    let id = Uuid::parse_str(&laudo_id)
        .map_err(|e| SicroError::Validation(format!("invalid laudo id: {e}")))?;

    let mut conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    run_migrations(&mut conn)?;

    let laudo = laudo_repo::find_by_id(&conn, &id)?
        .ok_or_else(|| SicroError::Validation(format!("laudo {} not found", id)))?;

    let target = ws.join(&laudo.relative_path);
    let bytes = std::fs::read(&target).map_err(|e| {
        SicroError::Workspace(format!(
            "could not read laudo at {}: {}",
            target.display(),
            e
        ))
    })?;
    let doc: serde_json::Value = serde_json::from_slice(&bytes)?;

    Ok(LaudoDoc { laudo, doc })
}

#[tauri::command]
pub async fn save_laudo(
    workspace_path: String,
    laudo_id: String,
    doc: serde_json::Value,
) -> Result<Laudo> {
    let ws = PathBuf::from(&workspace_path);
    let id = Uuid::parse_str(&laudo_id)
        .map_err(|e| SicroError::Validation(format!("invalid laudo id: {e}")))?;

    let mut conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    run_migrations(&mut conn)?;

    let mut laudo = laudo_repo::find_by_id(&conn, &id)?
        .ok_or_else(|| SicroError::Validation(format!("laudo {} not found", id)))?;

    let target = ws.join(&laudo.relative_path);
    write_doc(&target, &doc)?;

    let now = Utc::now();
    laudo_repo::touch_updated_at(&conn, &laudo.id, now)?;
    laudo.updated_at = now;

    occurrence_repo::record_audit(
        &conn,
        Some(&laudo.occurrence_id),
        "laudo.saved",
        Some("laudo"),
        Some("laudo"),
        Some(&laudo.id),
        None,
    )?;

    Ok(laudo)
}

// ---------------------------------------------------------------------------
// Helpers

fn write_doc(target: &Path, doc: &serde_json::Value) -> Result<()> {
    let bytes = serde_json::to_vec_pretty(doc)?;
    atomic_write_bytes(target, &bytes)?;
    Ok(())
}

/// Build a minimal `.sicrodoc` envelope for a freshly-created laudo.
// ---------------------------------------------------------------------------
// H — Fluxo gov.br externo: importação do PDF assinado de volta para o workspace.
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ImportSignedPdfInput {
    /// ID do laudo (UUID).
    pub laudo_id: String,
    /// Caminho ABSOLUTO no SO do PDF assinado escolhido pelo perito.
    /// Vindo do `<input type=file>` ou do file picker do Tauri.
    pub source_absolute_path: String,
    /// Nome de arquivo desejado (sem path). Se vazio, o backend gera um.
    pub preferred_filename: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ImportSignedPdfResult {
    /// Caminho relativo ao workspace onde o PDF foi gravado.
    pub relative_path: String,
    /// SHA-256 do PDF assinado (hex).
    pub sha256: String,
    /// Tamanho em bytes.
    pub size_bytes: u64,
}

/// H — Importa um PDF assinado pelo gov.br de volta para o workspace.
///
/// Validações:
///   - O arquivo source existe e é PDF (header `%PDF-`).
///   - O laudo existe na ocorrência atual do workspace.
///   - O caminho final fica dentro de `laudos/<id>/assinados/`.
///
/// O command NÃO mexe no `.sicrodoc` — quem grava o `finalization.signature`
/// com os metadados retornados é o frontend (via `setStatus` do store).
/// Isso preserva a separação: backend cuida do arquivo, frontend cuida
/// do envelope JSON.
#[tauri::command]
pub async fn import_signed_pdf(
    workspace_path: String,
    input: ImportSignedPdfInput,
) -> Result<ImportSignedPdfResult> {
    let ws = PathBuf::from(&workspace_path);
    let _manifest = Manifest::read(&ws)?;

    let laudo_uuid = Uuid::parse_str(&input.laudo_id)
        .map_err(|e| SicroError::Validation(format!("UUID inválido: {e}")))?;

    let src_abs = PathBuf::from(&input.source_absolute_path);
    if !src_abs.is_file() {
        return Err(SicroError::Filesystem(format!(
            "PDF assinado não encontrado: {}",
            src_abs.display()
        )));
    }

    // Validação: cabeçalho `%PDF-` (primeiros 5 bytes).
    let bytes = std::fs::read(&src_abs).map_err(|e| {
        SicroError::Filesystem(format!("não consegui ler o PDF: {e}"))
    })?;
    if bytes.len() < 5 || &bytes[..5] != b"%PDF-" {
        return Err(SicroError::Validation(
            "arquivo não é um PDF válido (header %PDF- ausente)".to_string(),
        ));
    }

    // Verifica que o laudo existe no banco para evitar pastas órfãs.
    let mut conn = open_connection(&ws.join(SQLITE_FILENAME))?;
    run_migrations(&mut conn)?;
    let exists = laudo_repo::find_by_id(&conn, &laudo_uuid)?;
    if exists.is_none() {
        return Err(SicroError::Validation(format!(
            "laudo {} não encontrado neste workspace",
            laudo_uuid
        )));
    }

    // Sanitiza nome de arquivo + monta caminho relativo.
    let filename = input
        .preferred_filename
        .as_deref()
        .map(sanitize_pdf_filename)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            let stamp = Utc::now().format("%Y%m%d_%H%M%S");
            format!("laudo_assinado_govbr_{stamp}.pdf")
        });

    let rel = format!("laudos/{}/assinados/{}", laudo_uuid, filename);
    let dst_abs = resolve_workspace_relative(&ws, &rel)?;
    if let Some(parent) = dst_abs.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            SicroError::Filesystem(format!(
                "cannot create signed dir: {e}"
            ))
        })?;
    }

    // Grava de forma atômica.
    atomic_write_bytes(&dst_abs, &bytes)?;

    // Hash + size do arquivo finalizado (== source, mas re-hash garante).
    let sha = sha256_file(&dst_abs)?;
    let size_bytes = std::fs::metadata(&dst_abs)
        .map(|m| m.len())
        .unwrap_or(bytes.len() as u64);

    Ok(ImportSignedPdfResult {
        relative_path: rel,
        sha256: sha,
        size_bytes,
    })
}

fn sanitize_pdf_filename(raw: &str) -> String {
    let trimmed = raw.trim();
    let stem = trimmed
        .strip_suffix(".pdf")
        .or_else(|| trimmed.strip_suffix(".PDF"))
        .unwrap_or(trimmed);
    let mut out = String::with_capacity(stem.len() + 4);
    for c in stem.chars() {
        let ok = c.is_ascii_alphanumeric()
            || c == '-'
            || c == '_'
            || c == '.';
        out.push(if ok { c } else { '_' });
    }
    let truncated: String = out.trim_matches('_').chars().take(80).collect();
    if truncated.is_empty() {
        "laudo_assinado.pdf".to_string()
    } else {
        format!("{truncated}.pdf")
    }
}

// ---------------------------------------------------------------------------

/// The front-end may overwrite it immediately, but it MUST be valid JSON the
/// front-end can parse — otherwise the first `read_laudo` would explode.
fn empty_envelope(laudo: &Laudo) -> serde_json::Value {
    serde_json::json!({
        "schema_version": "1.0.0",
        "document_id": laudo.id.to_string(),
        "occurrence_id": laudo.occurrence_id.to_string(),
        "type": "laudo",
        "title": laudo.title,
        "template_id": laudo.template_id,
        "created_at": laudo.created_at.to_rfc3339(),
        "updated_at": laudo.updated_at.to_rfc3339(),
        "metadata": {},
        "layout": {
            "page_size": "A4",
            "orientation": "portrait"
        },
        // ProseMirror/TipTap empty doc: a single empty paragraph.
        "content": {
            "type": "doc",
            "content": [
                { "type": "paragraph" }
            ]
        }
    })
}
