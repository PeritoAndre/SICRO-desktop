/**
 * Factory helpers — create a new `SicroObject` with sensible defaults so
 * the UI doesn't sprinkle UUIDs and constants everywhere.
 *
 * `crypto.randomUUID()` is available in modern browsers and in the Tauri
 * WebView (Chromium-based), so no extra dep needed.
 */

import type {
  LineSubtype,
  MarkerSubtype,
  SicroLineObject,
  SicroMarkerObject,
  SicroMeasurementObject,
  SicroPoint,
  SicroTextObject,
  SicroVehicleObject,
  VehicleBodyType,
} from "./schema";

const OBJECT_LAYER = "layer_objects";

/**
 * Vehicle silhouette presets — width × height in canvas pixels at zoom 1.
 * Numbers chosen from doc 03 §6.4 references (sedan ~4.5×1.8 m, SUV ~4.7×1.9
 * m, caminhão leve ~6.5×2.2 m, moto ~2.0×0.7 m, bike ~1.6×0.5 m). The pixel
 * mapping uses ~18 px/m as a sensible starting size — the user can
 * re-scale anything anyway. Keeping aspect ratios honest matters more
 * than absolute size for the spike.
 */
const VEHICLE_DIMENSIONS: Record<
  VehicleBodyType,
  { width: number; height: number; color: string }
> = {
  car: { width: 80, height: 40, color: "#3b82f6" },
  sedan: { width: 80, height: 35, color: "#3b82f6" },
  suv: { width: 84, height: 42, color: "#475569" },
  hatch: { width: 70, height: 36, color: "#0ea5e9" },
  truck: { width: 120, height: 50, color: "#7c2d12" },
  caminhao: { width: 120, height: 50, color: "#7c2d12" },
  moto: { width: 36, height: 16, color: "#facc15" },
  bike: { width: 28, height: 12, color: "#22c55e" },
  other: { width: 80, height: 40, color: "#6b7280" },
};

function uid(prefix: string): string {
  // crypto.randomUUID is the canonical path in modern Chromium.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  // Defensive fallback for non-browser test environments (vitest under jsdom
  // sometimes lacks the API). Not cryptographically strong — only used to
  // disambiguate within a session.
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function makeVehicle(
  p: SicroPoint,
  label = "V1",
  body_type: VehicleBodyType = "car",
): SicroVehicleObject {
  const preset = VEHICLE_DIMENSIONS[body_type] ?? VEHICLE_DIMENSIONS.car;
  return {
    id: uid("vehicle"),
    layer_id: OBJECT_LAYER,
    kind: "vehicle",
    x: p.x,
    y: p.y,
    width: preset.width,
    height: preset.height,
    rotation: 0,
    label,
    color: preset.color,
    body_type,
    visible: true,
    locked: false,
    category: "veiculos",
  };
}

/** MVP 6 — central palette for line subtypes (color + width + dashing). */
export const LINE_STYLES: Record<
  LineSubtype,
  { color: string; width: number; dashed: boolean }
> = {
  road: { color: "#1f2937", width: 6, dashed: false },
  r1: { color: "#d97706", width: 4, dashed: true },
  r2: { color: "#0ea5e9", width: 4, dashed: true },
  lane: { color: "#9ca3af", width: 2, dashed: false },
  lane_separator: { color: "#9ca3af", width: 2, dashed: true },
  sidewalk: { color: "#52525b", width: 3, dashed: false },
  arrow: { color: "#111827", width: 3, dashed: false },
  freehand: { color: "#111827", width: 2, dashed: false },
};

export function makeLine(
  p1: SicroPoint,
  p2: SicroPoint,
  subtype: LineSubtype = "road",
): SicroLineObject {
  const style = LINE_STYLES[subtype];
  return {
    id: uid("line"),
    layer_id: OBJECT_LAYER,
    kind: "line",
    subtype,
    points: [p1.x, p1.y, p2.x, p2.y],
    stroke_width: style.width,
    dashed: style.dashed,
    color: style.color,
    label:
      subtype === "r1" ? "R1" : subtype === "r2" ? "R2" : null,
    visible: true,
    locked: false,
    category:
      subtype === "r1" || subtype === "r2"
        ? "referenciais"
        : subtype === "freehand"
          ? "anotacoes"
          : "vias",
  };
}

/** Convenience: R1/R2 dedicated factories with the canonical labels. */
export function makeR1(p1: SicroPoint, p2: SicroPoint): SicroLineObject {
  const line = makeLine(p1, p2, "r1");
  line.label = "R1";
  return line;
}
export function makeR2(p1: SicroPoint, p2: SicroPoint): SicroLineObject {
  const line = makeLine(p1, p2, "r2");
  line.label = "R2";
  return line;
}

/** Arrow line — same as line(arrow); renderer draws a head at p2. */
export function makeArrow(p1: SicroPoint, p2: SicroPoint): SicroLineObject {
  return makeLine(p1, p2, "arrow");
}

/** MVP 6 — marker palette and default labels. */
export const MARKER_STYLES: Record<
  MarkerSubtype,
  { color: string; defaultLabel: string; defaultSize: number }
> = {
  collision_x: { color: "#dc2626", defaultLabel: "X", defaultSize: 24 },
  victim_point: { color: "#7c3aed", defaultLabel: "V", defaultSize: 22 },
  trace_point: { color: "#059669", defaultLabel: "T", defaultSize: 22 },
  brake_mark: { color: "#1f2937", defaultLabel: "Frenagem", defaultSize: 60 },
  drag_mark: { color: "#52525b", defaultLabel: "Arrasto", defaultSize: 60 },
  fluid: { color: "#0e7490", defaultLabel: "Fluido", defaultSize: 28 },
  blood: { color: "#991b1b", defaultLabel: "Sangue", defaultSize: 28 },
  debris: { color: "#a16207", defaultLabel: "Destroços", defaultSize: 30 },
  pedestrian: { color: "#0f172a", defaultLabel: "Pedestre", defaultSize: 22 },
  body: { color: "#0f172a", defaultLabel: "Vítima", defaultSize: 32 },
};

export function makeMarker(
  p: SicroPoint,
  subtype: MarkerSubtype = "collision_x",
  labelOverride?: string,
): SicroMarkerObject {
  const style = MARKER_STYLES[subtype];
  return {
    id: uid("marker"),
    layer_id: OBJECT_LAYER,
    kind: "marker",
    subtype,
    x: p.x,
    y: p.y,
    size: style.defaultSize,
    color: style.color,
    label: labelOverride ?? style.defaultLabel,
    visible: true,
    locked: false,
    category: "vestigios",
  };
}

export function makeText(p: SicroPoint, text = "Anotação"): SicroTextObject {
  return {
    id: uid("text"),
    layer_id: OBJECT_LAYER,
    kind: "text",
    x: p.x,
    y: p.y,
    text,
    font_size: 16,
    color: "#111827",
    visible: true,
    locked: false,
    category: "anotacoes",
  };
}

export function makeMeasurement(
  p1: SicroPoint,
  p2: SicroPoint,
): SicroMeasurementObject {
  return {
    id: uid("measurement"),
    layer_id: OBJECT_LAYER,
    kind: "measurement",
    p1,
    p2,
    color: "#dc2626",
    visible: true,
    locked: false,
    category: "medidas",
  };
}

/** Clone an object with a new id (Ctrl+D / duplicate). */
export function cloneObject<T extends SicroVehicleObject
  | SicroLineObject
  | SicroMarkerObject
  | SicroTextObject
  | SicroMeasurementObject>(source: T): T {
  const cloned = { ...source } as T;
  cloned.id = uid(source.kind);
  // Nudge so the duplicate doesn't overlap the source visually.
  if ("x" in cloned && typeof cloned.x === "number") {
    cloned.x += 16;
  }
  if ("y" in cloned && typeof cloned.y === "number") {
    cloned.y += 16;
  }
  if (cloned.kind === "line") {
    cloned.points = source.kind === "line"
      ? source.points.map((v, i) => v + (i % 2 === 0 ? 16 : 16))
      : cloned.points;
  }
  if (cloned.kind === "measurement") {
    if (source.kind === "measurement") {
      cloned.p1 = { x: source.p1.x + 16, y: source.p1.y + 16 };
      cloned.p2 = { x: source.p2.x + 16, y: source.p2.y + 16 };
    }
  }
  return cloned;
}
