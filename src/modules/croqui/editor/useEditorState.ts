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

export type Tool =
  | "select"
  | "pan"
  | "vehicle"
  | "line_road"
  | "line_r1"
  | "line_r2"
  | "marker_x"
  | "text"
  | "measurement"
  | "set_scale";

/** Stage of a two-click tool (measurement / set_scale / line). */
export interface PendingTwoClick {
  tool: Tool;
  first: SicroPoint;
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
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [pointerWorld, setPointerWorld] = useState<SicroPoint>({ x: 0, y: 0 });
  /** Undo stack: snapshots of `objects` arrays before each mutation. */
  const [history, setHistory] = useState<SicroObject[][]>([]);

  const pushHistory = useCallback((snapshot: SicroObject[]) => {
    setHistory((h) => {
      const next = [...h, snapshot];
      // Keep the stack bounded — spike, not a production editor.
      if (next.length > 50) next.shift();
      return next;
    });
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

  return {
    tool,
    setTool,
    selectedId,
    setSelectedId,
    pending,
    setPending,
    viewport,
    setViewport,
    pointerWorld,
    setPointerWorld,
    history,
    pushHistory,
    popHistory,
  };
}

export type EditorState = ReturnType<typeof useEditorState>;
