/**
 * useEditorState — transient editor state shared between Toolbar, Stage and
 * InspectorPanel. Owns the active tool, the selected object id, the viewport
 * (pan/zoom), the "scale calibration" in-progress state, and a small undo
 * history (kept simple — full undo/redo lives in a future spike).
 *
 * The persisted doc lives in `croquiStore`. This file is purely "what is
 * the user doing right now?"
 */

import { useCallback, useState } from "react";
import type { SicroObject, SicroPoint } from "../engine";

/**
 * Tool keys. MVP 6 adds dedicated tools per vehicle subtype, per marker
 * subtype, per line subtype and a generic `template:<id>` shape for road
 * templates. Keeping a single string union (instead of nested structs)
 * makes the toolbar trivially mappable.
 */
export type Tool =
  | "select"
  | "pan"
  // Vehicles
  | "vehicle"            // legacy alias for "vehicle_car"
  | "vehicle_car"
  | "vehicle_sedan"
  | "vehicle_suv"
  | "vehicle_hatch"
  | "vehicle_moto"
  | "vehicle_truck"
  | "vehicle_bike"
  // MVP 9 — frota expandida
  | "vehicle_pickup"
  | "vehicle_van"
  | "vehicle_onibus"
  | "vehicle_moto_esportiva"
  | "vehicle_moto_carga"
  | "vehicle_caminhao_pesado"
  | "vehicle_carreta"
  // Lines
  | "line_road"
  | "line_lane"
  | "line_lane_separator"
  | "line_sidewalk"
  | "line_arrow"
  | "line_r1"
  | "line_r2"
  // MVP 9 — linhas adicionais
  | "line_canteiro"
  | "line_acostamento"
  | "line_trajetoria"
  | "line_callout"
  // Markers (collision + vestígios + pessoas)
  | "marker_x"
  | "marker_brake"
  | "marker_drag"
  | "marker_fluid"
  | "marker_blood"
  | "marker_debris"
  | "marker_pedestrian"
  | "marker_body"
  // MVP 9 — vestígios + mobiliário urbano
  | "marker_skid_curve"
  | "marker_sulcagem"
  | "marker_ranhura"
  | "marker_impact_area"
  | "marker_rest_position"
  | "marker_semaforo"
  | "marker_placa_pare"
  | "marker_placa_preferencia"
  | "marker_poste"
  | "marker_arvore"
  | "marker_guia"
  | "marker_faixa_pedestre"
  // Annotation / measurement / scale
  | "text"
  | "measurement"
  | "set_scale"
  // MVP 9 Road Engine Pro — multi-click road creation, one tool per style.
  | "road_urban"
  | "road_avenue"
  | "road_highway"
  | "road_dirt"
  | "road_parking"
  // Road Engine 2.0 Ciclo 2 — rotatória primitiva. Click once para
  // inserir uma rotatória default no ponto clicado.
  | "roundabout";

/** Stage of a two-click tool (measurement / set_scale / line). */
export interface PendingTwoClick {
  tool: Tool;
  first: SicroPoint;
}

/**
 * Multi-click road drafting state (MVP 9 Road Engine Pro). The user
 * clicks any number of control points; pressing Enter / double-click
 * finalises the road, Esc cancels.
 */
export interface RoadDraft {
  tool: Tool;
  points: SicroPoint[];
}

export interface Viewport {
  /** Stage scale (zoom). 1 = 100%. */
  scale: number;
  /** Stage position (pan), in stage coordinates. */
  x: number;
  y: number;
}

export const DEFAULT_VIEWPORT: Viewport = { scale: 1, x: 0, y: 0 };

export function useEditorState() {
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingTwoClick | null>(null);
  const [roadDraft, setRoadDraft] = useState<RoadDraft | null>(null);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [pointerWorld, setPointerWorld] = useState<SicroPoint>({ x: 0, y: 0 });
  /**
   * Road Engine 2.0 — Debug overlay toggle (Fase F4). Transient: vive
   * só nesse hook, não é persistido no `.sicrocroqui`. Default OFF.
   */
  const [roadDebugV2, setRoadDebugV2] = useState(false);
  /** Undo stack: snapshots of `objects` arrays before each mutation. */
  const [history, setHistory] = useState<SicroObject[][]>([]);
  /** Redo stack (MVP 6) — fed by undo, cleared on a fresh mutation. */
  const [redoStack, setRedoStack] = useState<SicroObject[][]>([]);

  const pushHistory = useCallback((snapshot: SicroObject[]) => {
    setHistory((h) => {
      const next = [...h, snapshot];
      // Keep the stack bounded — spike, not a production editor.
      if (next.length > 50) next.shift();
      return next;
    });
    // Any new mutation invalidates the redo branch.
    setRedoStack([]);
  }, []);

  const popHistory = useCallback((): SicroObject[] | null => {
    let popped: SicroObject[] | null = null;
    setHistory((h) => {
      if (h.length === 0) return h;
      popped = h[h.length - 1] ?? null;
      return h.slice(0, -1);
    });
    return popped;
  }, []);

  const pushRedo = useCallback((snapshot: SicroObject[]) => {
    setRedoStack((r) => {
      const next = [...r, snapshot];
      if (next.length > 50) next.shift();
      return next;
    });
  }, []);
  const popRedo = useCallback((): SicroObject[] | null => {
    let popped: SicroObject[] | null = null;
    setRedoStack((r) => {
      if (r.length === 0) return r;
      popped = r[r.length - 1] ?? null;
      return r.slice(0, -1);
    });
    return popped;
  }, []);

  return {
    tool,
    setTool,
    selectedId,
    setSelectedId,
    pending,
    setPending,
    roadDraft,
    setRoadDraft,
    viewport,
    setViewport,
    pointerWorld,
    setPointerWorld,
    history,
    pushHistory,
    popHistory,
    redoStack,
    pushRedo,
    popRedo,
    roadDebugV2,
    setRoadDebugV2,
  };
}

export type EditorState = ReturnType<typeof useEditorState>;
