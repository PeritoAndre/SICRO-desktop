//! Models for the Image Editor (MVP 7 — Editor de Imagem Pericial).
//!
//! Three persisted entities (tabelas em SQLite, migration 009):
//!   - `ImageAnalysis`        — uma sessão `.sicroimage`;
//!   - `ImageExport`          — uma imagem derivada + sidecar JSON;
//!   - `ImageOperationLog`    — log textual (audit) das operações.
//!
//! Plus one transient input/output:
//!   - `CreateImageAnalysisInput` (criação a partir de evidência ou
//!     arquivo local), `ExportImageInput` (parâmetros do export).
//!
//! Wire format é serde-default snake_case — os mirrors TypeScript em
//! `src/types/image_analysis.ts` mantêm os mesmos nomes.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// ImageSourceKind

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ImageSourceKind {
    Photo,
    VideoFrame,
    Evidence,
    LocalImport,
}

impl ImageSourceKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Photo => "photo",
            Self::VideoFrame => "video_frame",
            Self::Evidence => "evidence",
            Self::LocalImport => "local_import",
        }
    }
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "photo" => Some(Self::Photo),
            "video_frame" => Some(Self::VideoFrame),
            "evidence" => Some(Self::Evidence),
            "local_import" => Some(Self::LocalImport),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// ImageAnalysis (row em `image_analyses`)

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageAnalysis {
    pub id: Uuid,
    pub occurrence_id: Uuid,
    pub title: String,
    pub source_kind: ImageSourceKind,
    pub source_id: Option<String>,
    pub original_relative_path: String,
    pub original_hash_sha256: Option<String>,
    pub analysis_relative_path: String,
    pub last_export_relative_path: Option<String>,
    pub status: String,
    /// JSON object preserved verbatim — pode carregar dimensions,
    /// mime_type, EXIF resumido, etc.
    pub metadata_json: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// ImageExport (row em `image_exports`)

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageExport {
    pub id: Uuid,
    pub occurrence_id: Uuid,
    pub image_analysis_id: Uuid,
    pub output_relative_path: String,
    pub sidecar_relative_path: Option<String>,
    pub hash_sha256: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub format: String,
    pub created_at: DateTime<Utc>,
    pub operation_summary_json: String,
}

// ---------------------------------------------------------------------------
// ImageOperationLog (row em `image_operation_logs`)

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageOperationLog {
    pub id: i64,
    pub occurrence_id: Uuid,
    pub image_analysis_id: Uuid,
    pub action: String,
    pub details_json: String,
    pub created_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Inputs (Tauri commands)

#[derive(Debug, Clone, Deserialize)]
pub struct CreateImageAnalysisInput {
    pub title: String,
    pub source_kind: ImageSourceKind,
    pub source_id: Option<String>,
    /// Caminho relativo ao workspace. O backend valida com
    /// `sanitize_relative_path`.
    pub original_relative_path: String,
    /// Hash conhecido da imagem original (opcional). Quando ausente,
    /// o backend tenta computar a partir do arquivo no workspace.
    pub original_hash_sha256: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImportLocalImageInput {
    /// Caminho absoluto da imagem escolhida pelo usuário no diálogo do SO.
    /// O backend copia para `imagens/originais/` e cria a análise.
    pub source_path: String,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ExportImageInput {
    /// Quando `true` o pipeline tenta aplicar os ajustes no Rust
    /// (brilho/contraste/grayscale/inverter/rotação/flip/crop). Quando
    /// `false`, exporta o PNG já composto enviado pelo frontend (após
    /// aplicar anotações via Konva).
    #[serde(default)]
    pub apply_backend_adjustments: bool,
    /// PNG já composto pelo frontend (base64, opcional). Quando
    /// presente, o backend usa-o como bytes finais; o original e os
    /// ajustes ficam só na sessão.
    #[serde(default)]
    pub composed_png_base64: Option<String>,
    /// Ajustes que o backend deve aplicar (quando
    /// `apply_backend_adjustments=true`). O frontend é a fonte de
    /// verdade da sessão; o backend só re-aplica para o derivado.
    #[serde(default)]
    pub adjustments: Option<BackendAdjustments>,
    /// Lista de operações geométricas a aplicar (na ordem).
    #[serde(default)]
    pub operations: Vec<BackendOperation>,
    /// "png" (padrão) | "jpg".
    #[serde(default)]
    pub format: Option<String>,
    /// JSON livre — vai para o sidecar como "summary".
    #[serde(default)]
    pub operation_summary_json: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BackendAdjustments {
    /// Brilho em [-100, 100]. 0 = neutro.
    #[serde(default)]
    pub brightness: f32,
    /// Contraste em [-100, 100]. 0 = neutro.
    #[serde(default)]
    pub contrast: f32,
    /// Gamma. 1.0 = neutro. Aplicado como `pixel ^ (1/gamma)`.
    #[serde(default = "default_gamma")]
    pub gamma: f32,
    /// Saturação em [-100, 100]. 0 = neutro.
    #[serde(default)]
    pub saturation: f32,
    #[serde(default)]
    pub grayscale: bool,
    #[serde(default)]
    pub invert: bool,
}

impl Default for BackendAdjustments {
    fn default() -> Self {
        Self {
            brightness: 0.0,
            contrast: 0.0,
            gamma: 1.0,
            saturation: 0.0,
            grayscale: false,
            invert: false,
        }
    }
}

fn default_gamma() -> f32 {
    1.0
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum BackendOperation {
    Rotate90Cw,
    Rotate90Ccw,
    Rotate180,
    FlipHorizontal,
    FlipVertical,
    Crop {
        x: u32,
        y: u32,
        width: u32,
        height: u32,
    },
    Resize {
        width: u32,
        height: u32,
    },
}

// ---------------------------------------------------------------------------
// Image metadata (returned by `get_image_metadata`)

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageMetadata {
    pub width: u32,
    pub height: u32,
    pub mime_type: Option<String>,
    pub format_label: Option<String>,
    pub size_bytes: u64,
    pub hash_sha256: Option<String>,
    /// JSON serialised — vazio quando não houver EXIF lido.
    pub exif_json: Option<String>,
}

// ---------------------------------------------------------------------------
// Asset bytes (returned by `read_image_asset` — base64 igual ao do MVP 4).

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageAssetBytes {
    pub relative_path: String,
    pub mime_type: String,
    pub base64: String,
    pub size_bytes: u64,
}
