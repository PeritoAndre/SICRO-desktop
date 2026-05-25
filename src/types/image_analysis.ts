/**
 * Mirror of `src-tauri/src/models/image_analysis.rs` (MVP 7).
 * Field names em snake_case por compatibilidade com serde.
 */

export type ImageSourceKind =
  | "photo"
  | "video_frame"
  | "evidence"
  | "local_import";

export interface ImageAnalysis {
  id: string;
  occurrence_id: string;
  title: string;
  source_kind: ImageSourceKind;
  source_id: string | null;
  original_relative_path: string;
  original_hash_sha256: string | null;
  analysis_relative_path: string;
  last_export_relative_path: string | null;
  status: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

export interface ImageExport {
  id: string;
  occurrence_id: string;
  image_analysis_id: string;
  output_relative_path: string;
  sidecar_relative_path: string | null;
  hash_sha256: string | null;
  width: number | null;
  height: number | null;
  format: string;
  created_at: string;
  operation_summary_json: string;
}

export interface ImageOperationLog {
  id: number;
  occurrence_id: string;
  image_analysis_id: string;
  action: string;
  details_json: string;
  created_at: string;
}

export interface CreateImageAnalysisInput {
  title: string;
  source_kind: ImageSourceKind;
  source_id?: string | null;
  original_relative_path: string;
  original_hash_sha256?: string | null;
}

export interface ImportLocalImageInput {
  source_path: string;
  title?: string;
}

export interface BackendAdjustments {
  brightness: number;
  contrast: number;
  gamma: number;
  saturation: number;
  grayscale: boolean;
  invert: boolean;
}

export type BackendOperation =
  | { kind: "rotate_90_cw" }
  | { kind: "rotate_90_ccw" }
  | { kind: "rotate_180" }
  | { kind: "flip_horizontal" }
  | { kind: "flip_vertical" }
  | { kind: "crop"; x: number; y: number; width: number; height: number }
  | { kind: "resize"; width: number; height: number };

export interface ExportImageInput {
  apply_backend_adjustments?: boolean;
  composed_png_base64?: string | null;
  adjustments?: BackendAdjustments | null;
  operations?: BackendOperation[];
  format?: "png" | "jpg";
  operation_summary_json?: string | null;
}

export interface SaveImageAnalysisInput {
  doc: unknown;
  metadata_json?: string;
  title?: string;
}

export interface ImageAnalysisPayload {
  analysis: ImageAnalysis;
  doc: unknown;
}

export interface ImageMetadata {
  width: number;
  height: number;
  mime_type: string | null;
  format_label: string | null;
  size_bytes: number;
  hash_sha256: string | null;
  exif_json: string | null;
}

export interface ImageAssetBytes {
  relative_path: string;
  mime_type: string;
  base64: string;
  size_bytes: number;
}
