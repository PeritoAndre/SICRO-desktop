/**
 * `.sicroimage` serializer — coerce arbitrary JSON into a `SicroImageDoc`
 * with safe defaults. Mirror do padrão usado em `croqui/engine/serializer.ts`
 * e `laudo/document-engine/serializer.ts`.
 */

import type { BackendAdjustments } from "@domain/image_analysis";
import {
  CURRENT_SCHEMA_VERSION,
  type SicroImageCanvas,
  type SicroImageDoc,
  type SicroImageLayer,
  type SicroImageSource,
  type SicroAnnotation,
  type SicroImageScale,
} from "./schema";

const DEFAULT_CANVAS: SicroImageCanvas = {
  zoom: 1,
  pan_x: 0,
  pan_y: 0,
  rotation: 0,
  background_color: "#1f2933",
};

const DEFAULT_ADJUSTMENTS: BackendAdjustments = {
  brightness: 0,
  contrast: 0,
  gamma: 1,
  saturation: 0,
  grayscale: false,
  invert: false,
};

const DEFAULT_LAYERS: SicroImageLayer[] = [
  {
    id: "layer_base",
    name: "Imagem base",
    kind: "image_base",
    visible: true,
    locked: true,
    opacity: 1,
  },
  {
    id: "layer_annotations",
    name: "Anotações",
    kind: "annotations",
    visible: true,
    locked: false,
    opacity: 1,
  },
];

export function coerceSicroImage(raw: unknown): SicroImageDoc {
  if (!raw || typeof raw !== "object") {
    throw new Error("invalid .sicroimage: not an object");
  }
  const o = raw as Record<string, unknown>;
  const id = stringField(o, "image_analysis_id");
  const occ = stringField(o, "occurrence_id");
  if (!id || !occ) {
    throw new Error(
      "invalid .sicroimage: missing image_analysis_id / occurrence_id",
    );
  }

  const source = coerceSource(o.source);
  const canvas = coerceCanvas(o.canvas);
  const view_adjustments = coerceAdjustments(o.view_adjustments);
  const layers = Array.isArray(o.layers)
    ? (o.layers as SicroImageLayer[])
    : DEFAULT_LAYERS;
  const annotations = Array.isArray(o.annotations)
    ? (o.annotations as SicroAnnotation[])
    : [];
  const measurements = Array.isArray(o.measurements)
    ? (o.measurements as SicroAnnotation[])
    : [];
  const scale = coerceScale(o.scale);
  const exports = Array.isArray(o.exports) ? o.exports : [];
  const processing_stack = Array.isArray(o.processing_stack)
    ? o.processing_stack
    : [];

  return {
    schema_version:
      stringField(o, "schema_version") ?? CURRENT_SCHEMA_VERSION,
    image_analysis_id: id,
    occurrence_id: occ,
    title: stringField(o, "title") ?? "Análise sem título",
    source,
    canvas,
    view_adjustments,
    processing_stack,
    layers,
    annotations,
    measurements,
    scale,
    exports,
    created_at:
      stringField(o, "created_at") ?? new Date().toISOString(),
    updated_at:
      stringField(o, "updated_at") ?? new Date().toISOString(),
  };
}

export function serializeSicroImage(doc: SicroImageDoc): SicroImageDoc {
  return {
    ...doc,
    schema_version: CURRENT_SCHEMA_VERSION,
    updated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------

function coerceSource(raw: unknown): SicroImageSource {
  if (!raw || typeof raw !== "object") {
    return {
      kind: "local_import",
      source_id: null,
      original_relative_path: "",
      original_hash_sha256: null,
      mime_type: null,
      width: 0,
      height: 0,
      size_bytes: 0,
    };
  }
  const o = raw as Record<string, unknown>;
  return {
    kind: (stringField(o, "kind") as never) ?? "local_import",
    source_id: stringField(o, "source_id"),
    original_relative_path: stringField(o, "original_relative_path") ?? "",
    original_hash_sha256: stringField(o, "original_hash_sha256"),
    mime_type: stringField(o, "mime_type"),
    width: numberField(o, "width") ?? 0,
    height: numberField(o, "height") ?? 0,
    size_bytes: numberField(o, "size_bytes") ?? 0,
  };
}

function coerceCanvas(raw: unknown): SicroImageCanvas {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CANVAS };
  const o = raw as Record<string, unknown>;
  return {
    zoom: numberField(o, "zoom") ?? DEFAULT_CANVAS.zoom,
    pan_x: numberField(o, "pan_x") ?? 0,
    pan_y: numberField(o, "pan_y") ?? 0,
    rotation: numberField(o, "rotation") ?? 0,
    background_color:
      stringField(o, "background_color") ?? DEFAULT_CANVAS.background_color,
  };
}

function coerceAdjustments(raw: unknown): BackendAdjustments {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_ADJUSTMENTS };
  const o = raw as Record<string, unknown>;
  return {
    brightness: numberField(o, "brightness") ?? 0,
    contrast: numberField(o, "contrast") ?? 0,
    gamma: numberField(o, "gamma") ?? 1,
    saturation: numberField(o, "saturation") ?? 0,
    grayscale: boolField(o, "grayscale"),
    invert: boolField(o, "invert"),
  };
}

function coerceScale(raw: unknown): SicroImageScale | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const px = numberField(o, "px_per_unit");
  if (!px || px <= 0) return null;
  const unit = stringField(o, "unit") ?? "m";
  return {
    px_per_unit: px,
    unit: (unit === "cm" || unit === "mm" ? unit : "m") as SicroImageScale["unit"],
    calibrated_by: Array.isArray(o.calibrated_by)
      ? (o.calibrated_by as never)
      : [],
    calibration_real_distance: numberField(o, "calibration_real_distance") ?? 0,
    created_at: stringField(o, "created_at") ?? new Date().toISOString(),
  };
}

function stringField(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}
function numberField(o: Record<string, unknown>, key: string): number | null {
  const v = o[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function boolField(o: Record<string, unknown>, key: string): boolean {
  const v = o[key];
  return typeof v === "boolean" ? v : false;
}
