/**
 * `.sicrocroqui` schema (Spike E — Croqui Engine).
 *
 * The .sicrocroqui envelope is the source of truth for a croqui. PNG is
 * derived, never primary. Keep this file framework-agnostic — no React,
 * no Konva — so the engine is testable and reusable.
 *
 * Compatibility rules (from the architecture doc):
 *   - Only ADD fields. Never rename, never change a type without bumping
 *     `schema_version` (currently "0.1").
 *   - Unknown fields are preserved as-is when a future version reads an
 *     older envelope.
 */

export const CURRENT_SCHEMA_VERSION = "0.1";

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

export type LayerKind = "background" | "objects" | "annotations";

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
export type LineSubtype = "road" | "r1" | "r2" | "lane" | "freehand";

/** Subtype for `marker` objects. */
export type MarkerSubtype = "collision_x" | "victim_point" | "trace_point";

interface SicroObjectBase {
  id: string;
  layer_id: string;
  kind: SicroObjectKind;
  label?: string | null;
  color?: string | null;
  z?: number;
}

export interface SicroVehicleObject extends SicroObjectBase {
  kind: "vehicle";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** Useful when the perito needs different styles for car/truck/motorbike. */
  body_type?: "car" | "truck" | "moto" | "bike" | "other";
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
