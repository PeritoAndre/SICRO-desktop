/**
 * `.sicrocroqui` schema (Spike E + MVP 6 — Croqui Pericial).
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
 *   - MVP 6 (schema_version "0.2") adds:
 *       - new vehicle body_type values (`sedan` | `suv` | `hatch`
 *         | `caminhao`);
 *       - new marker subtypes (`brake_mark` | `drag_mark` | `fluid`
 *         | `blood` | `debris` | `pedestrian` | `body`);
 *       - new line subtypes (`arrow` | `sidewalk` | `lane_separator`);
 *       - `visible?` and `locked?` per object;
 *       - `category?` for layer-panel grouping;
 *       - `notes?` for forensic observations;
 *     All additive — old `.sicrocroqui` files load through `coerceCroquiDoc`
 *     without intervention.
 */

export const CURRENT_SCHEMA_VERSION = "0.2";

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
  | "measurement";

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
  | "lane_separator";

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
  | "body";

/** Vehicle body subtypes (MVP 6 expanded). */
export type VehicleBodyType =
  | "car"
  | "sedan"
  | "suv"
  | "hatch"
  | "truck"
  | "caminhao"
  | "moto"
  | "bike"
  | "other";

/** Logical category used by the layer panel to group objects (MVP 6). */
export type ObjectCategory =
  | "vias"
  | "veiculos"
  | "vestigios"
  | "anotacoes"
  | "medidas"
  | "referenciais"
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

export type SicroObject =
  | SicroVehicleObject
  | SicroLineObject
  | SicroMarkerObject
  | SicroTextObject
  | SicroMeasurementObject;

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
}
