/**
 * `.sicroimage` schema — Editor de Imagem Pericial (MVP 7).
 *
 * O `.sicroimage` é a fonte da verdade da sessão de análise. PNG/JPG
 * derivados são exportações.
 *
 * Compatibilidade: aditiva. Campos novos no futuro entram com `?`
 * (opcionais) e default no `coerceSicroImage`.
 */

import type {
  BackendAdjustments,
  ImageSourceKind,
} from "@domain/image_analysis";

export const CURRENT_SCHEMA_VERSION = "0.1";

export interface SicroImagePoint {
  x: number;
  y: number;
}

export interface SicroImageCanvas {
  zoom: number;
  pan_x: number;
  pan_y: number;
  rotation: number;
  background_color: string;
}

export interface SicroImageSource {
  kind: ImageSourceKind;
  source_id: string | null;
  original_relative_path: string;
  original_hash_sha256: string | null;
  mime_type: string | null;
  width: number;
  height: number;
  size_bytes: number;
}

export interface SicroImageScale {
  px_per_unit: number;
  unit: "m" | "cm" | "mm";
  calibrated_by: SicroImagePoint[];
  calibration_real_distance: number;
  created_at: string;
}

export type SicroImageLayerKind =
  | "image_base"
  | "annotations"
  | "measurements"
  | "redactions"
  | "adjustments";

export interface SicroImageLayer {
  id: string;
  name: string;
  kind: SicroImageLayerKind;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

export type SicroAnnotationKind =
  | "arrow"
  | "line"
  | "rect"
  | "ellipse"
  | "text"
  | "numbered_marker"
  | "point"
  | "measurement"
  | "redaction";

export interface SicroAnnotation {
  id: string;
  layer_id: string;
  kind: SicroAnnotationKind;
  /** For shapes: top-left or center; for measurement: p1; for text: anchor. */
  x: number;
  y: number;
  /** rect/ellipse */
  width?: number;
  height?: number;
  /** arrow/line/measurement */
  x2?: number;
  y2?: number;
  /** text / numbered_marker */
  text?: string;
  /** numbered_marker */
  number?: number;
  rotation?: number;
  stroke?: string;
  fill?: string;
  stroke_width?: number;
  opacity?: number;
  label?: string;
  notes?: string;
  visible?: boolean;
  locked?: boolean;
  created_at: string;
}

export interface SicroImageDoc {
  schema_version: string;
  image_analysis_id: string;
  occurrence_id: string;
  title: string;
  source: SicroImageSource;
  canvas: SicroImageCanvas;
  view_adjustments: BackendAdjustments;
  processing_stack: unknown[]; // reserved for MVP 8 (Sobel/CLAHE/etc)
  layers: SicroImageLayer[];
  annotations: SicroAnnotation[];
  measurements: SicroAnnotation[];
  scale: SicroImageScale | null;
  exports: unknown[]; // populated by backend on read; UI keeps last hint
  created_at: string;
  updated_at: string;
}
