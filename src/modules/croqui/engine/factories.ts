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
} from "./schema";

const OBJECT_LAYER = "layer_objects";

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

export function makeVehicle(p: SicroPoint, label = "V1"): SicroVehicleObject {
  return {
    id: uid("vehicle"),
    layer_id: OBJECT_LAYER,
    kind: "vehicle",
    x: p.x,
    y: p.y,
    width: 80,
    height: 40,
    rotation: 0,
    label,
    color: "#3b82f6",
    body_type: "car",
  };
}

export function makeLine(
  p1: SicroPoint,
  p2: SicroPoint,
  subtype: LineSubtype = "road",
): SicroLineObject {
  const colorByKind: Record<LineSubtype, string> = {
    road: "#1f2937",
    r1: "#d97706",
    r2: "#0ea5e9",
    lane: "#9ca3af",
    freehand: "#111827",
  };
  const widthByKind: Record<LineSubtype, number> = {
    road: 6,
    r1: 4,
    r2: 4,
    lane: 2,
    freehand: 2,
  };
  return {
    id: uid("line"),
    layer_id: OBJECT_LAYER,
    kind: "line",
    subtype,
    points: [p1.x, p1.y, p2.x, p2.y],
    stroke_width: widthByKind[subtype],
    dashed: subtype === "r1" || subtype === "r2",
    color: colorByKind[subtype],
    label: subtype === "r1" ? "R1" : subtype === "r2" ? "R2" : null,
  };
}

export function makeMarker(
  p: SicroPoint,
  subtype: MarkerSubtype = "collision_x",
): SicroMarkerObject {
  const colorByKind: Record<MarkerSubtype, string> = {
    collision_x: "#dc2626",
    victim_point: "#7c3aed",
    trace_point: "#059669",
  };
  return {
    id: uid("marker"),
    layer_id: OBJECT_LAYER,
    kind: "marker",
    subtype,
    x: p.x,
    y: p.y,
    size: 24,
    color: colorByKind[subtype],
    label:
      subtype === "collision_x"
        ? "X"
        : subtype === "victim_point"
          ? "V"
          : "T",
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
  };
}
