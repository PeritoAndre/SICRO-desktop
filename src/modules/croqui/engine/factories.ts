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
  RoadCurb,
  RoadDirection,
  RoadMarkings,
  RoadStyle,
  RoadSurface,
  SicroLineObject,
  SicroMarkerObject,
  SicroMeasurementObject,
  SicroPoint,
  SicroRoadObject,
  SicroRoundaboutObject,
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
  // MVP 9 — frota expandida
  pickup: { width: 96, height: 42, color: "#0f766e" }, // caminhonete
  van: { width: 96, height: 46, color: "#854d0e" },
  onibus: { width: 220, height: 60, color: "#b45309" },
  moto_esportiva: { width: 38, height: 14, color: "#dc2626" },
  moto_carga: { width: 50, height: 28, color: "#a16207" }, // moto com bagageiro
  caminhao_pesado: { width: 160, height: 60, color: "#7c2d12" },
  carreta: { width: 280, height: 60, color: "#451a03" }, // cavalo + semi-reboque
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

/** Central palette for line subtypes (color + width + dashing). MVP 6+9. */
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
  // MVP 9
  canteiro: { color: "#22c55e", width: 8, dashed: false }, // verde grosso
  acostamento: { color: "#a8a29e", width: 4, dashed: false },
  trajetoria: { color: "#2563eb", width: 3, dashed: true },
  callout: { color: "#0ea5e9", width: 1.5, dashed: true },
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
        : subtype === "freehand" || subtype === "callout"
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

/** Marker palette and default labels. MVP 6 + MVP 9. */
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
  // MVP 9 — vestígios adicionais
  skid_curve: { color: "#1f2937", defaultLabel: "Derrapagem", defaultSize: 70 },
  sulcagem: { color: "#451a03", defaultLabel: "Sulcagem", defaultSize: 60 },
  ranhura: { color: "#78350f", defaultLabel: "Ranhura", defaultSize: 50 },
  impact_area: { color: "#b91c1c", defaultLabel: "Área de impacto", defaultSize: 80 },
  rest_position: { color: "#0e7490", defaultLabel: "Repouso final", defaultSize: 28 },
  // MVP 9 — mobiliário urbano
  semaforo: { color: "#f97316", defaultLabel: "Semáforo", defaultSize: 22 },
  placa_pare: { color: "#dc2626", defaultLabel: "PARE", defaultSize: 26 },
  placa_preferencia: { color: "#f59e0b", defaultLabel: "Preferência", defaultSize: 26 },
  poste: { color: "#52525b", defaultLabel: "Poste", defaultSize: 14 },
  arvore: { color: "#15803d", defaultLabel: "Árvore", defaultSize: 26 },
  guia: { color: "#a8a29e", defaultLabel: "Guia", defaultSize: 18 },
  faixa_pedestre: { color: "#1e293b", defaultLabel: "Faixa pedestre", defaultSize: 40 },
};

export function makeMarker(
  p: SicroPoint,
  subtype: MarkerSubtype = "collision_x",
  labelOverride?: string,
): SicroMarkerObject {
  const style = MARKER_STYLES[subtype];
  // Mobiliário urbano vai para a categoria dedicada (MVP 9).
  const isMobiliario =
    subtype === "semaforo" ||
    subtype === "placa_pare" ||
    subtype === "placa_preferencia" ||
    subtype === "poste" ||
    subtype === "arvore" ||
    subtype === "guia" ||
    subtype === "faixa_pedestre";
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
    category: isMobiliario ? "mobiliario_urbano" : "vestigios",
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

// ---------------------------------------------------------------------------
// MVP 9 Road Engine Pro — `SicroRoadObject` factory + style presets.
//
// Each preset bundles the parameters the renderer needs to draw a
// road end-to-end: paved width, lane count, default markings, curb,
// surface fill and a sensible spline tension. The user can tweak any
// of these from the InspectorPanel.
//
// Width values are in canvas pixels at zoom 1. They follow the same
// 18 px/m convention used by VEHICLE_DIMENSIONS, so a 4-lane avenue
// (~14m of paved area) reads as ~140 px.

export const ROAD_STYLES: Record<
  RoadStyle,
  {
    width: number;
    lane_count: number;
    direction: RoadDirection;
    markings: RoadMarkings;
    curb: RoadCurb;
    surface: RoadSurface;
    spline_tension: number;
  }
> = {
  urban: {
    width: 80,
    lane_count: 2,
    direction: "two_way",
    markings: {
      center_line: "dashed",
      edge_line: true,
      lane_dividers: false,
    },
    curb: { enabled: true, width: 2, color: "#475569" },
    surface: { fill: "#3f3f46", texture: "none" },
    spline_tension: 0.5,
  },
  avenue: {
    width: 140,
    lane_count: 4,
    direction: "two_way",
    markings: {
      center_line: "double_solid",
      edge_line: true,
      lane_dividers: true,
    },
    curb: { enabled: true, width: 3, color: "#475569" },
    surface: { fill: "#3f3f46", texture: "none" },
    spline_tension: 0.5,
  },
  highway: {
    width: 180,
    lane_count: 4,
    direction: "two_way",
    markings: {
      center_line: "solid",
      edge_line: true,
      lane_dividers: true,
    },
    curb: { enabled: false, width: 0, color: "#475569" },
    surface: { fill: "#27272a", texture: "none" },
    spline_tension: 0.6,
  },
  dirt: {
    width: 60,
    lane_count: 1,
    direction: "two_way",
    markings: {
      center_line: "none",
      edge_line: false,
      lane_dividers: false,
    },
    curb: { enabled: false, width: 0, color: "#a8a29e" },
    surface: { fill: "#a8a29e", texture: "none" },
    spline_tension: 0.5,
  },
  parking: {
    width: 120,
    lane_count: 1,
    direction: "unknown",
    markings: {
      center_line: "none",
      edge_line: true,
      lane_dividers: false,
    },
    curb: { enabled: true, width: 2, color: "#52525b" },
    surface: { fill: "#52525b", texture: "none" },
    spline_tension: 0,
  },
  custom: {
    width: 80,
    lane_count: 2,
    direction: "two_way",
    markings: {
      center_line: "dashed",
      edge_line: true,
      lane_dividers: false,
    },
    curb: { enabled: false, width: 0, color: "#475569" },
    surface: { fill: "#3f3f46", texture: "none" },
    spline_tension: 0.5,
  },
};

/**
 * Create a SicroRoadObject from a centerline and (optionally) a style
 * preset. The caller can override any field — for example to bump the
 * lane count or to mark this segment as `subtype: "intersection"`.
 */
export function makeRoad(
  points: number[],
  road_style: RoadStyle = "urban",
  overrides: Partial<SicroRoadObject> = {},
): SicroRoadObject {
  const preset = ROAD_STYLES[road_style];
  return {
    id: uid("road"),
    layer_id: OBJECT_LAYER,
    kind: "road",
    subtype: "spline",
    points,
    width: preset.width,
    lane_count: preset.lane_count,
    direction: preset.direction,
    road_style,
    markings: { ...preset.markings },
    curb: { ...preset.curb },
    surface: { ...preset.surface },
    spline_tension: preset.spline_tension,
    visible: true,
    locked: false,
    category: "vias",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Road Engine 2.0 Ciclo 2 — Rotatória primitiva.
//
// Defaults: anel de 80 px de raio externo + 14 px de largura → ilha de
// 66 px de raio. Suficiente para uma rotatória "padrão" cidade pequena
// (~28 m de diâmetro a 18 px/m). O perito reescala depois.
//
// `surface.fill` segue o estilo `urban` (asfalto cinza escuro). `curb`
// fica desabilitado por default — habilitar adiciona um anel colorido
// externo ao asfalto (rebaixamento típico de praça central).

/**
 * Default radius / width used when nothing is supplied.
 *
 * Ciclo 2 v6 — defaults proporcionais melhores. Premissa: rotatória
 * "urbana padrão" para via urbana de 80 px (~4,4 m a 18 px/m).
 *
 *   - `r = 144`  (≈ 16 m de diâmetro a 18 px/m — mini-rotatória)
 *   - `width = 56` (faixa de circulação ~3 m — passagem de carro)
 *   - inner radius implícito = 88 px (≈ 10 m — ilha confortável)
 *
 * Mesmo cálculo que o `computeAutoDimensions(roads: [80px])` em
 * `roundaboutNode.ts`. Os defaults aqui são para o caso "rotatória
 * inserida sem vias conectadas" — o perito ainda pode mexer no
 * Inspector, e quando ligar vias e clicar "Recalcular proporção" a
 * rotatória se re-dimensiona.
 */
const ROUNDABOUT_DEFAULTS = {
  r: 144,
  width: 56,
  lane_count: 1,
  surface_fill: "#3f3f46",
  inner_color: "#e5e7eb",
  border_color: "#f5f5f5",
};

export function makeRoundabout(
  p: SicroPoint,
  label = "R1",
  overrides: Partial<SicroRoundaboutObject> = {},
): SicroRoundaboutObject {
  return {
    id: uid("roundabout"),
    layer_id: OBJECT_LAYER,
    kind: "roundabout",
    cx: p.x,
    cy: p.y,
    r: ROUNDABOUT_DEFAULTS.r,
    width: ROUNDABOUT_DEFAULTS.width,
    lane_count: ROUNDABOUT_DEFAULTS.lane_count,
    surface: { fill: ROUNDABOUT_DEFAULTS.surface_fill, texture: "none" },
    inner_color: ROUNDABOUT_DEFAULTS.inner_color,
    border_color: ROUNDABOUT_DEFAULTS.border_color,
    label,
    visible: true,
    locked: false,
    category: "vias",
    ...overrides,
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
  | SicroMeasurementObject
  | SicroRoadObject
  | SicroRoundaboutObject>(source: T): T {
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
  if (cloned.kind === "road") {
    cloned.points = source.kind === "road"
      ? source.points.map((v) => v + 16)
      : cloned.points;
  }
  if (cloned.kind === "roundabout") {
    if (source.kind === "roundabout") {
      cloned.cx = source.cx + 16;
      cloned.cy = source.cy + 16;
    }
  }
  if (cloned.kind === "measurement") {
    if (source.kind === "measurement") {
      cloned.p1 = { x: source.p1.x + 16, y: source.p1.y + 16 };
      cloned.p2 = { x: source.p2.x + 16, y: source.p2.y + 16 };
    }
  }
  return cloned;
}
