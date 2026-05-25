/**
 * CanvasStage — the Konva Stage + Layers + Shapes.
 *
 * Why React-Konva (vs SVG/Canvas/own engine): see SPIKE_E_*.md §1.
 *
 * Layer split (each Layer is a separate <canvas> under the hood):
 *   - bgLayer        — grid + background image
 *   - objectsLayer   — every SicroObject + the Transformer for the selection
 *   - uiLayer        — transient cues (pending two-click first point,
 *                      preview line during measurement, etc.)
 *
 * The Stage exposes the underlying Konva Stage via the `stageRef` so the
 * parent can call `toDataURL()` for the PNG export.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text as KonvaText,
  Transformer,
} from "react-konva";
import type Konva from "konva";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  angleDeg,
  distancePx,
  formatMeasurement,
  midpoint,
  type SicroCroquiDoc,
  type SicroLineObject,
  type SicroMarkerObject,
  type SicroMeasurementObject,
  type SicroObject,
  type SicroPoint,
  type SicroTextObject,
  type SicroVehicleObject,
} from "../engine";
import type { EditorState, Tool } from "./useEditorState";

export interface CanvasStageHandle {
  /** Returns a PNG data URL of the current scene (incl. background + grid). */
  toPng(pixelRatio?: number): string | null;
  getStageSize(): { width: number; height: number };
}

interface Props {
  doc: SicroCroquiDoc;
  editor: EditorState;
  containerWidth: number;
  containerHeight: number;
  /** Called when the user clicks the canvas with an "add object" tool. */
  onCanvasClick: (worldPoint: SicroPoint) => void;
  /** Called when the user finishes a Konva drag/transform on an object. */
  onObjectChange: (id: string, patch: Partial<SicroObject>) => void;
  onSelect: (id: string | null) => void;
  workspacePath: string;
}

export const CanvasStage = forwardRef<CanvasStageHandle, Props>(function CanvasStage(
  {
    doc,
    editor,
    containerWidth,
    containerHeight,
    onCanvasClick,
    onObjectChange,
    onSelect,
    workspacePath,
  },
  ref,
) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const objectsLayerRef = useRef<Konva.Layer | null>(null);

  useImperativeHandle(ref, () => ({
    toPng(pixelRatio = 2) {
      const stage = stageRef.current;
      if (!stage) return null;
      return stage.toDataURL({ pixelRatio, mimeType: "image/png" });
    },
    getStageSize() {
      return {
        width: containerWidth,
        height: containerHeight,
      };
    },
  }));

  // Attach the Transformer to the currently-selected Konva node.
  useEffect(() => {
    const transformer = transformerRef.current;
    const layer = objectsLayerRef.current;
    if (!transformer || !layer) return;
    if (!editor.selectedId) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }
    const node = layer.findOne(`#${editor.selectedId}`);
    if (node) {
      transformer.nodes([node]);
      transformer.getLayer()?.batchDraw();
    } else {
      transformer.nodes([]);
    }
  }, [editor.selectedId, doc.objects]);

  const handleStageMouseMove = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const world = toWorld(stage, pos);
    editor.setPointerWorld(world);
  };

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Clicks that hit an interactive node bubble through Konva; we only care
    // about clicks on empty canvas here.
    if (e.target !== e.target.getStage()) {
      // Click on an object — leave it to the Group's own handler unless we're
      // in an "add" tool (in which case the user still wants to add).
      if (isAddTool(editor.tool)) {
        const stage = stageRef.current;
        if (!stage) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;
        onCanvasClick(toWorld(stage, pos));
      }
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const world = toWorld(stage, pos);
    if (editor.tool === "select") {
      onSelect(null);
      return;
    }
    if (editor.tool === "pan") {
      return;
    }
    onCanvasClick(world);
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = editor.viewport.scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const factor = direction > 0 ? 1.08 : 0.92;
    const newScale = clamp(oldScale * factor, 0.1, 8);
    const mousePointTo = {
      x: (pointer.x - editor.viewport.x) / oldScale,
      y: (pointer.y - editor.viewport.y) / oldScale,
    };
    editor.setViewport({
      scale: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  return (
    <Stage
      ref={stageRef}
      width={containerWidth}
      height={containerHeight}
      x={editor.viewport.x}
      y={editor.viewport.y}
      scaleX={editor.viewport.scale}
      scaleY={editor.viewport.scale}
      draggable={editor.tool === "pan"}
      onClick={handleStageClick}
      onTap={handleStageClick}
      onMouseMove={handleStageMouseMove}
      onWheel={handleWheel}
      onDragEnd={(e) => {
        // Stage drag emits position changes — keep our state in sync so
        // wheel-zoom anchors correctly afterwards.
        if (editor.tool !== "pan") return;
        const stage = e.target;
        editor.setViewport({
          scale: stage.scaleX(),
          x: stage.x(),
          y: stage.y(),
        });
      }}
      style={{ background: "#f5f6f8" }}
    >
      <Layer listening={false}>
        <CanvasBackground doc={doc} />
      </Layer>
      <BackgroundImageLayer doc={doc} workspacePath={workspacePath} />

      <Layer ref={objectsLayerRef}>
        {doc.objects.map((obj) => (
          <ObjectNode
            key={obj.id}
            obj={obj}
            doc={doc}
            tool={editor.tool}
            selected={editor.selectedId === obj.id}
            onSelect={() => onSelect(obj.id)}
            onChange={(patch) => onObjectChange(obj.id, patch)}
          />
        ))}
        <Transformer
          ref={transformerRef}
          rotateEnabled
          enabledAnchors={[
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
          ]}
          boundBoxFunc={(_old, next) => {
            // Reject negative size to avoid flips during scaling.
            if (Math.abs(next.width) < 4 || Math.abs(next.height) < 4) return _old;
            return next;
          }}
        />
      </Layer>

      <Layer listening={false}>
        <PendingTwoClickPreview editor={editor} />
      </Layer>
    </Stage>
  );
});

// ===========================================================================
// Background (color + grid) — drawn on its own non-listening layer.

function CanvasBackground({ doc }: { doc: SicroCroquiDoc }) {
  const { width_px, height_px, background_color, grid } = doc.canvas;
  const gridSize = grid?.size_px ?? 50;
  const gridEnabled = grid?.enabled ?? true;

  const lines = useMemo(() => {
    if (!gridEnabled) return [] as number[][];
    const out: number[][] = [];
    for (let x = 0; x <= width_px; x += gridSize) {
      out.push([x, 0, x, height_px]);
    }
    for (let y = 0; y <= height_px; y += gridSize) {
      out.push([0, y, width_px, y]);
    }
    return out;
  }, [width_px, height_px, gridSize, gridEnabled]);

  return (
    <>
      <Rect
        x={0}
        y={0}
        width={width_px}
        height={height_px}
        fill={background_color}
        stroke="#1f2937"
        strokeWidth={1}
      />
      {lines.map((pts, i) => (
        <Line key={i} points={pts} stroke="#e5e7eb" strokeWidth={1} listening={false} />
      ))}
    </>
  );
}

// ===========================================================================
// Background image (separate layer so the user can toggle visibility).

function BackgroundImageLayer({
  doc,
  workspacePath,
}: {
  doc: SicroCroquiDoc;
  workspacePath: string;
}) {
  const bg = doc.background_image;
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!bg) {
      setImage(null);
      return;
    }
    const path = resolveAssetPath(workspacePath, bg.source_path);
    if (!path) return;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = path;
    img.onload = () => setImage(img);
    img.onerror = () => setImage(null);
  }, [bg, workspacePath]);

  if (!bg || !image) {
    return <Layer listening={false} />;
  }

  return (
    <Layer listening={false}>
      <KonvaImage
        image={image}
        x={bg.x}
        y={bg.y}
        width={bg.width || image.width}
        height={bg.height || image.height}
        opacity={bg.opacity}
      />
    </Layer>
  );
}

// ===========================================================================
// Per-object rendering

function ObjectNode({
  obj,
  doc,
  tool,
  selected,
  onSelect,
  onChange,
}: {
  obj: SicroObject;
  doc: SicroCroquiDoc;
  tool: Tool;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<SicroObject>) => void;
}) {
  // Only allow drag when the "select" tool is active.
  const draggable = tool === "select";

  switch (obj.kind) {
    case "vehicle":
      return (
        <VehicleNode
          obj={obj}
          draggable={draggable}
          selected={selected}
          onSelect={onSelect}
          onChange={onChange}
        />
      );
    case "line":
      return (
        <LineNode
          obj={obj}
          draggable={draggable}
          selected={selected}
          onSelect={onSelect}
          onChange={onChange}
        />
      );
    case "marker":
      return (
        <MarkerNode
          obj={obj}
          draggable={draggable}
          selected={selected}
          onSelect={onSelect}
          onChange={onChange}
        />
      );
    case "text":
      return (
        <TextNode
          obj={obj}
          draggable={draggable}
          selected={selected}
          onSelect={onSelect}
          onChange={onChange}
        />
      );
    case "measurement":
      return (
        <MeasurementNode
          obj={obj}
          doc={doc}
          draggable={draggable}
          selected={selected}
          onSelect={onSelect}
          onChange={onChange}
        />
      );
  }
}

function VehicleNode({
  obj,
  draggable,
  selected,
  onSelect,
  onChange,
}: {
  obj: SicroVehicleObject;
  draggable: boolean;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<SicroObject>) => void;
}) {
  return (
    <Group
      id={obj.id}
      x={obj.x}
      y={obj.y}
      rotation={obj.rotation}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) =>
        onChange({ x: e.target.x(), y: e.target.y() } as Partial<SicroObject>)
      }
      onTransformEnd={(e) => {
        const node = e.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onChange({
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          width: Math.max(8, obj.width * scaleX),
          height: Math.max(6, obj.height * scaleY),
        } as Partial<SicroObject>);
      }}
    >
      <Rect
        width={obj.width}
        height={obj.height}
        offsetX={obj.width / 2}
        offsetY={obj.height / 2}
        fill={obj.color ?? "#3b82f6"}
        stroke={selected ? "#0ea5e9" : "#1e3a8a"}
        strokeWidth={selected ? 2 : 1.5}
        cornerRadius={4}
      />
      {/* Small triangle to indicate "front" of the vehicle. */}
      <Line
        points={[
          obj.width / 2,
          0,
          obj.width / 2 - 8,
          -obj.height / 2 - 6,
          obj.width / 2 + 8,
          -obj.height / 2 - 6,
        ]}
        closed
        fill={obj.color ?? "#3b82f6"}
        opacity={0.5}
        listening={false}
      />
      {obj.label && (
        <KonvaText
          text={obj.label}
          fontSize={12}
          fontStyle="bold"
          fill="#ffffff"
          width={obj.width}
          align="center"
          y={-6}
          offsetX={obj.width / 2}
          listening={false}
        />
      )}
    </Group>
  );
}

function LineNode({
  obj,
  draggable,
  selected,
  onSelect,
  onChange,
}: {
  obj: SicroLineObject;
  draggable: boolean;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<SicroObject>) => void;
}) {
  return (
    <Group
      id={obj.id}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => {
        // Translate the entire polyline by the drag offset.
        const dx = e.target.x();
        const dy = e.target.y();
        const next = obj.points.map((v, i) => v + (i % 2 === 0 ? dx : dy));
        e.target.position({ x: 0, y: 0 });
        onChange({ points: next } as Partial<SicroObject>);
      }}
    >
      <Line
        points={obj.points}
        stroke={obj.color ?? "#1f2937"}
        strokeWidth={obj.stroke_width}
        dash={obj.dashed ? [12, 6] : undefined}
        lineCap="round"
        opacity={selected ? 1 : 0.95}
        hitStrokeWidth={Math.max(obj.stroke_width, 12)}
      />
      {obj.label && (
        <KonvaText
          text={obj.label}
          fontSize={12}
          fontStyle="bold"
          fill={obj.color ?? "#1f2937"}
          x={obj.points[0] ?? 0}
          y={(obj.points[1] ?? 0) - 16}
          listening={false}
        />
      )}
    </Group>
  );
}

function MarkerNode({
  obj,
  draggable,
  selected,
  onSelect,
  onChange,
}: {
  obj: SicroMarkerObject;
  draggable: boolean;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<SicroObject>) => void;
}) {
  const size = obj.size;
  // Render a crossing X with two diagonal strokes, centred at (x,y).
  if (obj.subtype === "collision_x") {
    return (
      <Group
        id={obj.id}
        x={obj.x}
        y={obj.y}
        draggable={draggable}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) =>
          onChange({ x: e.target.x(), y: e.target.y() } as Partial<SicroObject>)
        }
      >
        <Line
          points={[-size / 2, -size / 2, size / 2, size / 2]}
          stroke={obj.color ?? "#dc2626"}
          strokeWidth={3}
        />
        <Line
          points={[-size / 2, size / 2, size / 2, -size / 2]}
          stroke={obj.color ?? "#dc2626"}
          strokeWidth={3}
        />
        {obj.label && (
          <KonvaText
            text={obj.label}
            fontSize={11}
            fontStyle="bold"
            fill={obj.color ?? "#dc2626"}
            x={size / 2 + 4}
            y={-size / 2}
            listening={false}
          />
        )}
        {selected && (
          <Rect
            x={-size / 2 - 4}
            y={-size / 2 - 4}
            width={size + 8}
            height={size + 8}
            stroke="#0ea5e9"
            strokeWidth={1}
            dash={[4, 3]}
          />
        )}
      </Group>
    );
  }
  // Other marker subtypes — a circle for now.
  return (
    <Group
      id={obj.id}
      x={obj.x}
      y={obj.y}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) =>
        onChange({ x: e.target.x(), y: e.target.y() } as Partial<SicroObject>)
      }
    >
      <Rect
        x={-size / 2}
        y={-size / 2}
        width={size}
        height={size}
        cornerRadius={size / 2}
        fill={obj.color ?? "#7c3aed"}
        stroke={selected ? "#0ea5e9" : "transparent"}
        strokeWidth={2}
      />
      {obj.label && (
        <KonvaText
          text={obj.label}
          fontSize={11}
          fill="#ffffff"
          width={size}
          align="center"
          y={-6}
          offsetX={size / 2 - 0}
          listening={false}
        />
      )}
    </Group>
  );
}

function TextNode({
  obj,
  draggable,
  selected,
  onSelect,
  onChange,
}: {
  obj: SicroTextObject;
  draggable: boolean;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<SicroObject>) => void;
}) {
  return (
    <Group
      id={obj.id}
      x={obj.x}
      y={obj.y}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) =>
        onChange({ x: e.target.x(), y: e.target.y() } as Partial<SicroObject>)
      }
    >
      <KonvaText
        text={obj.text}
        fontSize={obj.font_size}
        fill={obj.color ?? "#111827"}
      />
      {selected && (
        <Rect
          x={-2}
          y={-2}
          width={obj.text.length * obj.font_size * 0.55 + 4}
          height={obj.font_size + 6}
          stroke="#0ea5e9"
          dash={[4, 3]}
          listening={false}
        />
      )}
    </Group>
  );
}

function MeasurementNode({
  obj,
  doc,
  draggable,
  selected,
  onSelect,
  onChange,
}: {
  obj: SicroMeasurementObject;
  doc: SicroCroquiDoc;
  draggable: boolean;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<SicroObject>) => void;
}) {
  const px = distancePx(obj.p1, obj.p2);
  const mid = midpoint(obj.p1, obj.p2);
  const angle = angleDeg(obj.p1, obj.p2);
  const label =
    obj.label_override ?? formatMeasurement(px, doc.scale?.px_per_m);

  return (
    <Group
      id={obj.id}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => {
        const dx = e.target.x();
        const dy = e.target.y();
        e.target.position({ x: 0, y: 0 });
        onChange({
          p1: { x: obj.p1.x + dx, y: obj.p1.y + dy },
          p2: { x: obj.p2.x + dx, y: obj.p2.y + dy },
        } as Partial<SicroObject>);
      }}
    >
      <Line
        points={[obj.p1.x, obj.p1.y, obj.p2.x, obj.p2.y]}
        stroke={obj.color ?? "#dc2626"}
        strokeWidth={selected ? 2.5 : 1.5}
        dash={[8, 4]}
        hitStrokeWidth={12}
      />
      <KonvaText
        text={label}
        x={mid.x}
        y={mid.y}
        offsetX={0}
        offsetY={14}
        rotation={angle}
        fontSize={11}
        fontStyle="bold"
        fill={obj.color ?? "#dc2626"}
        listening={false}
      />
    </Group>
  );
}

// ===========================================================================
// Two-click "first point" preview

function PendingTwoClickPreview({ editor }: { editor: EditorState }) {
  if (!editor.pending) return null;
  const first = editor.pending.first;
  const cursor = editor.pointerWorld;
  return (
    <Group listening={false}>
      <Line
        points={[first.x, first.y, cursor.x, cursor.y]}
        stroke="#0ea5e9"
        strokeWidth={1}
        dash={[6, 4]}
      />
      <Rect
        x={first.x - 3}
        y={first.y - 3}
        width={6}
        height={6}
        fill="#0ea5e9"
      />
    </Group>
  );
}

// ===========================================================================
// helpers

function toWorld(stage: Konva.Stage, screen: SicroPoint): SicroPoint {
  const scale = stage.scaleX();
  const x = (screen.x - stage.x()) / scale;
  const y = (screen.y - stage.y()) / scale;
  return { x, y };
}

function isAddTool(tool: Tool): boolean {
  return (
    tool === "vehicle" ||
    tool === "line_road" ||
    tool === "line_r1" ||
    tool === "line_r2" ||
    tool === "marker_x" ||
    tool === "text" ||
    tool === "measurement" ||
    tool === "set_scale"
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function resolveAssetPath(workspacePath: string, src: string): string | null {
  // Absolute-looking path → resolve through Tauri's asset protocol.
  // Workspace-relative → join with workspacePath.
  try {
    const sep = workspacePath.includes("\\") ? "\\" : "/";
    const looksAbsolute =
      /^([a-zA-Z]:)?[\\/]/.test(src) || src.startsWith("file://");
    const abs = looksAbsolute
      ? src.replace(/^file:\/\//, "")
      : `${workspacePath}${sep}${src.replace(/\//g, sep)}`;
    return convertFileSrc(abs);
  } catch {
    return null;
  }
}
