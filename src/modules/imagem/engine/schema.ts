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

export const CURRENT_SCHEMA_VERSION = "0.2";

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
  | "redaction"
  // G12.14 — Anotações novas no schema 0.2
  | "polygon"
  | "angle"
  | "freehand";

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
  /**
   * G12 — Lista de pontos para polygon/freehand/angle. Coordenadas
   * absolutas em px da imagem original.
   * - polygon: 3+ pontos formando contorno fechado (área + perímetro).
   * - angle: exatamente 3 pontos (vértice é o do meio).
   * - freehand: N pontos amostrados do mouse drag.
   */
  points?: SicroImagePoint[];
  /**
   * G12 — Pré-computado pelo frontend quando há `scale` calibrada.
   * Usado para evitar recálculo a cada render.
   */
  measured_value?: {
    /** "distance_m" / "area_m2" / "angle_deg" / "perimeter_m" */
    kind: string;
    value: number;
    /** unidade (m, m², °) — display only */
    unit: string;
  };
}

/**
 * G12.10 — Pipeline de processamento NÃO destrutivo.
 *
 * Cada `ProcessingOp` representa uma operação na pilha:
 *   - `enabled = false` mantém na história mas não aplica.
 *   - reordenável via drag.
 *   - parâmetros editáveis a qualquer momento.
 *
 * O backend é chamado com o array desabilitados-filtrados quando
 * o usuário pede preview ou export.
 */
export type ProcessingOpKind =
  | "edge_sobel"
  | "edge_laplacian"
  | "edge_canny"
  | "blur_gaussian"
  | "blur_median"
  | "blur_bilateral"
  | "clahe"
  | "histogram_equalize"
  | "auto_levels"
  | "white_balance_gray_world"
  | "dilate"
  | "erode"
  | "open"
  | "close"
  | "unsharp_mask"
  | "threshold"
  | "pixelize"
  | "perspective"
  // Geométricas
  | "rotate_90_cw"
  | "rotate_90_ccw"
  | "rotate_180"
  | "flip_horizontal"
  | "flip_vertical"
  | "crop"
  | "resize";

export interface ProcessingOp {
  id: string;
  kind: ProcessingOpKind;
  enabled: boolean;
  /** Parâmetros específicos da operação (sigma, threshold, radius, etc.). */
  params: Record<string, unknown>;
  /** Comentário do perito sobre por que aplicou (audit). */
  notes?: string;
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
  /** G12.10 — pilha de operações não-destrutivas (filtros forenses). */
  processing_stack: ProcessingOp[];
  layers: SicroImageLayer[];
  annotations: SicroAnnotation[];
  measurements: SicroAnnotation[];
  scale: SicroImageScale | null;
  exports: unknown[]; // populated by backend on read; UI keeps last hint
  created_at: string;
  updated_at: string;
}
