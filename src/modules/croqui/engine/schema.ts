/**
 * `.sicrocroqui` schema (Spike E + MVP 6 + MVP 9 — Croqui Pericial
 * Avançado).
 *
 * The .sicrocroqui envelope is the source of truth for a croqui. PNG is
 * derived, never primary. Keep this file framework-agnostic — no React,
 * no Konva — so the engine is testable and reusable.
 *
 * Compatibility rules:
 *   - Only ADD fields. Never rename, never change a type without bumping
 *     `schema_version`.
 *   - Unknown fields are preserved as-is when a future version reads an
 *     older envelope.
 *
 * MVP 6 (schema_version "0.2") adds:
 *   - new vehicle body_type values (sedan | suv | hatch | caminhao);
 *   - new marker subtypes (brake_mark | drag_mark | fluid | blood |
 *     debris | pedestrian | body);
 *   - new line subtypes (arrow | sidewalk | lane_separator);
 *   - visible? / locked? / notes? / category? per object.
 *
 * MVP 9 (schema_version "0.3") adds:
 *   - new vehicle body_types: pickup | van | onibus | moto_esportiva |
 *     moto_carga | caminhao_pesado | carreta;
 *   - new marker subtypes: skid | impact_area | rest_position |
 *     trajectory | semaforo | placa_pare | poste | arvore | guia |
 *     faixa_pedestre;
 *   - new line subtypes: canteiro | calcada (já existia como sidewalk —
 *     mantido para compat);
 *   - new ObjectCategory: mobiliario_urbano (placas, postes, semáforos);
 *   - SicroCroquiViewSettings (grid, snap, rulers, labels, measurements);
 *   - SicroCroquiExportSettings (with_stamp / with_background /
 *     with_legend);
 *   - SicroCroquiStampMetadata (cabeçalho técnico do PNG: BO, município,
 *     etc.).
 *
 * Todas as adições do MVP 9 são opcionais. Croquis v0.1/v0.2 continuam
 * carregando via `coerceCroquiDoc`.
 */

export const CURRENT_SCHEMA_VERSION = "0.3";

export interface SicroCroquiCanvas {
  /** Logical canvas size in CSS pixels. Konva Stage gets this size. */
  width_px: number;
  height_px: number;
  background_color: string;
  grid?: {
    enabled: boolean;
    size_px: number;
  };
}

/**
 * Scale calibration. When `null`, distances are reported in pixels.
 *
 * `definition` records the two points the user picked + the real-world
 * distance they declared, so the conversion is auditable and the user
 * can re-calibrate from the same anchor pair.
 */
export interface SicroCroquiScale {
  px_per_m: number;
  definition?: {
    p1: SicroPoint;
    p2: SicroPoint;
    real_distance_m: number;
  };
}

export interface SicroPoint {
  x: number;
  y: number;
}

export interface SicroCroquiBackgroundImage {
  /** Workspace-relative or absolute path. Frontend resolves via convertFileSrc. */
  source_path: string;
  /** Position of the top-left of the image inside the canvas. */
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  locked: boolean;
  /**
   * Rotation around the image's centre, in degrees. Optional + defaults
   * to 0 — older `.sicrocroqui` envelopes that don't carry the field
   * keep loading unchanged. MVP 9 Round 5.
   */
  rotation?: number;
  /**
   * Optional sidecar JSON path (drone import). Carries provenance of
   * the derivative: original hash, k1/k2/k3, crop rect, timestamps.
   * Not used by the renderer; persisted for audit + future reuse.
   */
  sidecar_path?: string;
  /**
   * Original source the derivative came from (when known). Used by the
   * audit trail; the renderer always loads `source_path`.
   */
  original_path?: string;
}

export type LayerKind =
  | "background"
  | "objects"
  | "annotations"
  // MVP 6 — categorias dedicadas
  | "vias"
  | "veiculos"
  | "vestigios"
  | "medidas"
  | "referenciais";

export interface SicroCroquiLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  kind: LayerKind;
}

// ---- Objects (discriminated union by `kind`) ----

export type SicroObjectKind =
  | "vehicle"
  | "line"
  | "marker"
  | "text"
  | "measurement"
  // MVP 9 — Road Engine Pro (motor de vias avançado)
  | "road";

/** Subtype for `line` objects — selecting the styling/colour palette. */
export type LineSubtype =
  | "road"
  | "r1"
  | "r2"
  | "lane"
  | "freehand"
  // MVP 6 additions
  | "arrow"
  | "sidewalk"
  | "lane_separator"
  // MVP 9 additions
  | "canteiro" // canteiro central (avenida)
  | "acostamento" // acostamento lateral
  | "trajetoria" // seta de trajetória do veículo
  | "callout"; // chamada explicativa (callout line)

/** Subtype for `marker` objects. */
export type MarkerSubtype =
  | "collision_x"
  | "victim_point"
  | "trace_point"
  // MVP 6 — vestígios
  | "brake_mark"
  | "drag_mark"
  | "fluid"
  | "blood"
  | "debris"
  // MVP 6 — pessoas (renderizadas como marker para reaproveitar drag/select)
  | "pedestrian"
  | "body"
  // MVP 9 — vestígios + mobiliário urbano
  | "skid_curve" // derrapagem em curva
  | "sulcagem" // sulcagem profunda
  | "ranhura" // ranhura no pavimento
  | "impact_area" // área de concentração de impacto
  | "rest_position" // ponto de repouso final do veículo
  | "semaforo"
  | "placa_pare"
  | "placa_preferencia"
  | "poste"
  | "arvore"
  | "guia" // guia / meio-fio (ponto)
  | "faixa_pedestre"; // marcação puntual de faixa de pedestres

/** Vehicle body subtypes (expanded in MVP 6 + MVP 9). */
export type VehicleBodyType =
  | "car"
  | "sedan"
  | "suv"
  | "hatch"
  | "truck"
  | "caminhao"
  | "moto"
  | "bike"
  | "other"
  // MVP 9 — frota expandida
  | "pickup"
  | "van"
  | "onibus"
  | "moto_esportiva"
  | "moto_carga"
  | "caminhao_pesado"
  | "carreta";

/** Logical category used by the layer panel to group objects (MVP 6+9). */
export type ObjectCategory =
  | "vias"
  | "veiculos"
  | "vestigios"
  | "anotacoes"
  | "medidas"
  | "referenciais"
  // MVP 9 — placas, postes, árvores, semáforos
  | "mobiliario_urbano"
  | "outros";

interface SicroObjectBase {
  id: string;
  layer_id: string;
  kind: SicroObjectKind;
  label?: string | null;
  color?: string | null;
  z?: number;
  /** MVP 6: object-level toggle (separate from layer visibility). */
  visible?: boolean;
  /** MVP 6: prevent drag / transform when true. */
  locked?: boolean;
  /** MVP 6: free-form forensic observation. */
  notes?: string | null;
  /** MVP 6: logical grouping for the layer panel. */
  category?: ObjectCategory;
}

export interface SicroVehicleObject extends SicroObjectBase {
  kind: "vehicle";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** Body subtype — selects the rendered silhouette. */
  body_type?: VehicleBodyType;
}

export interface SicroLineObject extends SicroObjectBase {
  kind: "line";
  subtype: LineSubtype;
  /** Flat list of points: [x1, y1, x2, y2, ...]. */
  points: number[];
  stroke_width: number;
  dashed?: boolean;
}

export interface SicroMarkerObject extends SicroObjectBase {
  kind: "marker";
  subtype: MarkerSubtype;
  x: number;
  y: number;
  size: number;
  rotation?: number;
}

export interface SicroTextObject extends SicroObjectBase {
  kind: "text";
  x: number;
  y: number;
  text: string;
  font_size: number;
  rotation?: number;
}

export interface SicroMeasurementObject extends SicroObjectBase {
  kind: "measurement";
  p1: SicroPoint;
  p2: SicroPoint;
  /** When set, overrides the auto-computed label. */
  label_override?: string | null;
}

// ---------------------------------------------------------------------------
// MVP 9 — Road Engine Pro
//
// A "road" object is the first-class representation of a street/avenue/
// highway. Replaces the old approach of stacking three or four `line`
// objects to fake one. Encodes:
//
//   - geometric centerline (flat `[x1, y1, x2, y2, …]`, mesma convenção
//     que `SicroLineObject.points`);
//   - largura total da pista (px);
//   - número de faixas;
//   - sentido (mão única / dupla);
//   - estilo da via (urban / avenue / highway / dirt / parking / custom);
//   - marcações (eixo central, bordas, divisórias de faixa);
//   - guia/meio-fio (curb);
//   - cor de superfície (asphalt fill);
//   - `spline_tension` para suavização Catmull-Rom-like (0 = retilínea,
//     0.5 ~ smooth, 1 = muito curvo).
//
// O renderer (CanvasStage.RoadNode) usa Konva.Line com `tension` para
// suavizar a centerline e desenha as marcações em camadas sucessivas.
// Interseções entre RoadObjects são detectadas em runtime e cobertas
// por um patch de superfície para não acumular marcações sobrepostas.

export type RoadSubtype = "spline" | "polyline" | "intersection" | "osm_way";

export type RoadDirection = "one_way" | "two_way" | "unknown";

export type RoadStyle =
  | "urban"
  | "avenue"
  | "highway"
  | "dirt"
  | "parking"
  | "custom";

export type CenterLineStyle =
  | "none"
  | "solid"
  | "dashed"
  | "double_solid"
  | "solid_dashed";

export interface RoadMarkings {
  center_line: CenterLineStyle;
  edge_line: boolean;
  lane_dividers: boolean;
  /** Crosswalk visual rendered at the start of the road (MVP). */
  crosswalk_start?: boolean;
  /** Crosswalk visual rendered at the end of the road (MVP). */
  crosswalk_end?: boolean;
}

export interface RoadCurb {
  enabled: boolean;
  width: number; // px
  color: string;
}

export interface RoadSurface {
  fill: string;
  /** Reserved — texture is rendered lazily by the renderer. */
  texture?: "none" | "subtle_asphalt";
}

export interface SicroRoadObject extends SicroObjectBase {
  kind: "road";
  subtype: RoadSubtype;
  /** Flat `[x1,y1,x2,y2,...]` — mesmas convenções que `SicroLineObject.points`. */
  points: number[];
  /** Width of the **paved surface** in canvas pixels. */
  width: number;
  /** 1+ lanes. The renderer uses this to draw lane dividers. */
  lane_count: number;
  /** Optional explicit lane width. When absent, `width / lane_count`. */
  lane_width?: number;
  direction: RoadDirection;
  road_style: RoadStyle;
  markings: RoadMarkings;
  curb: RoadCurb;
  surface: RoadSurface;
  /** 0 = polyline reta; 0.5 ~ smooth catmull-rom; 1 = muito curvo. */
  spline_tension: number;
  /** Optional bag of opaque per-object metadata (OSM tags, etc.). */
  metadata_json?: string;
}

export type SicroObject =
  | SicroVehicleObject
  | SicroLineObject
  | SicroMarkerObject
  | SicroTextObject
  | SicroMeasurementObject
  // MVP 9
  | SicroRoadObject;

// ---------------------------------------------------------------------------
// MVP 9 — view / export / stamp settings (all optional + additive)

/**
 * Editor view preferences saved with the croqui. Determines whether
 * grid, rulers, labels and measurement values are shown by default
 * when the croqui is reopened.
 */
export interface SicroCroquiViewSettings {
  show_grid: boolean;
  grid_size: number; // px
  snap_to_grid: boolean;
  show_rulers: boolean;
  show_labels: boolean;
  show_measurements: boolean;
}

/**
 * Default export preferences. The user can still override at export
 * time; this is just the "remembered" state.
 */
export interface SicroCroquiExportSettings {
  with_stamp: boolean;
  with_background: boolean;
  with_legend: boolean;
  /** "tecnico" (default) | "limpo". */
  default_kind: string;
}

/**
 * Stamp header metadata for the technical PNG export. All fields are
 * optional; the renderer uses what is present.
 */
export interface SicroCroquiStampMetadata {
  bo?: string | null;
  protocolo?: string | null;
  tipo_pericia?: string | null;
  municipio?: string | null;
  perito?: string | null;
  custom_note?: string | null;
}

// ---- Envelope ----

export interface SicroCroquiDoc {
  schema_version: string;
  croqui_id: string;
  occurrence_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  canvas: SicroCroquiCanvas;
  scale: SicroCroquiScale | null;
  background_image: SicroCroquiBackgroundImage | null;
  layers: SicroCroquiLayer[];
  objects: SicroObject[];
  // MVP 9 — opcionais aditivos
  view_settings?: SicroCroquiViewSettings;
  export_settings?: SicroCroquiExportSettings;
  stamp_metadata?: SicroCroquiStampMetadata;
}
