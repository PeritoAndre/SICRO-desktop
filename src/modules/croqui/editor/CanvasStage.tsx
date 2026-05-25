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
  Circle,
  Ellipse,
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
  type VehicleBodyType,
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
  const body: VehicleBodyType = obj.body_type ?? "car";
  const isTwoWheel = body === "moto" || body === "bike";
  return (
    <Group
      id={obj.id}
      x={obj.x}
      y={obj.y}
      rotation={obj.rotation}
      draggable={draggable && !obj.locked}
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
      <VehicleSilhouette
        body={body}
        width={obj.width}
        height={obj.height}
        color={obj.color ?? "#3b82f6"}
        selected={selected}
      />
      {/* "Frente" do veículo — pequeno triângulo apontando para +x. */}
      {!isTwoWheel && (
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
      )}
      {obj.label && (
        <KonvaText
          text={obj.label}
          fontSize={isTwoWheel ? 10 : 12}
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

/**
 * Vector silhouettes for each vehicle body subtype (MVP 6). Drawn as
 * primitives so we don't ship raster assets and the canvas stays
 * resolution-independent. Top-down orientation: +x = "front".
 */
function VehicleSilhouette({
  body,
  width,
  height,
  color,
  selected,
}: {
  body: VehicleBodyType;
  width: number;
  height: number;
  color: string;
  selected: boolean;
}) {
  const stroke = selected ? "#0ea5e9" : "#1e3a8a";
  const strokeWidth = selected ? 2 : 1.5;

  if (body === "moto" || body === "bike") {
    const wheelR = height * 0.45;
    return (
      <Group>
        <Rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          fill={color}
          stroke={stroke}
          strokeWidth={strokeWidth}
          cornerRadius={Math.min(width, height) / 2}
        />
        <Circle x={-width / 2 + wheelR} y={0} radius={wheelR * 0.4} fill="#111827" />
        <Circle x={width / 2 - wheelR} y={0} radius={wheelR * 0.4} fill="#111827" />
      </Group>
    );
  }

  if (body === "truck" || body === "caminhao") {
    // Cabin (1/3 da frente) + carroceria (2/3 atrás).
    const cabinW = width * 0.32;
    return (
      <Group>
        <Rect
          x={-width / 2}
          y={-height / 2}
          width={width - cabinW}
          height={height}
          fill="#52525b"
          stroke={stroke}
          strokeWidth={strokeWidth}
          cornerRadius={3}
        />
        <Rect
          x={width / 2 - cabinW}
          y={-height / 2}
          width={cabinW}
          height={height}
          fill={color}
          stroke={stroke}
          strokeWidth={strokeWidth}
          cornerRadius={3}
        />
      </Group>
    );
  }

  // sedan / suv / hatch / car / other — corpo arredondado com vidros
  // simulando teto.
  const radius = body === "sedan" ? 6 : body === "hatch" ? 8 : 5;
  return (
    <Group>
      <Rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        fill={color}
        stroke={stroke}
        strokeWidth={strokeWidth}
        cornerRadius={radius}
      />
      {/* Teto (vidros) — retângulo interno. */}
      <Rect
        x={-width / 2 + width * 0.18}
        y={-height / 2 + height * 0.18}
        width={width * 0.5}
        height={height * 0.64}
        fill="rgba(255,255,255,0.32)"
        listening={false}
      />
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
  const isR = obj.subtype === "r1" || obj.subtype === "r2";
  const labelFontSize = isR ? 14 : 12;
  return (
    <Group
      id={obj.id}
      draggable={draggable && !obj.locked}
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
      {obj.subtype === "arrow" && obj.points.length >= 4 && (
        <ArrowHead
          x1={obj.points[obj.points.length - 4]!}
          y1={obj.points[obj.points.length - 3]!}
          x2={obj.points[obj.points.length - 2]!}
          y2={obj.points[obj.points.length - 1]!}
          color={obj.color ?? "#111827"}
          size={Math.max(obj.stroke_width * 4, 12)}
        />
      )}
      {obj.label && (
        <KonvaText
          text={obj.label}
          fontSize={labelFontSize}
          fontStyle="bold"
          fill={obj.color ?? "#1f2937"}
          x={obj.points[0] ?? 0}
          y={(obj.points[1] ?? 0) - 18}
          listening={false}
        />
      )}
    </Group>
  );
}

function ArrowHead({
  x1,
  y1,
  x2,
  y2,
  color,
  size,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  size: number;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return null;
  const ux = dx / len;
  const uy = dy / len;
  // 30° on each side of the tip.
  const rad = (30 * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const back1x = x2 - size * (ux * cos - uy * sin);
  const back1y = y2 - size * (uy * cos + ux * sin);
  const back2x = x2 - size * (ux * cos + uy * sin);
  const back2y = y2 - size * (uy * cos - ux * sin);
  return (
    <Line
      points={[x2, y2, back1x, back1y, back2x, back2y]}
      closed
      fill={color}
      stroke={color}
      strokeWidth={1}
      listening={false}
    />
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
  return (
    <Group
      id={obj.id}
      x={obj.x}
      y={obj.y}
      rotation={obj.rotation ?? 0}
      draggable={draggable && !obj.locked}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) =>
        onChange({ x: e.target.x(), y: e.target.y() } as Partial<SicroObject>)
      }
    >
      <MarkerGlyph obj={obj} selected={selected} />
      {obj.label && (
        <KonvaText
          text={obj.label}
          fontSize={11}
          fontStyle="bold"
          fill={obj.color ?? "#1f2937"}
          x={obj.size / 2 + 6}
          y={-obj.size / 2}
          listening={false}
        />
      )}
      {selected && (
        <Rect
          x={-obj.size / 2 - 4}
          y={-obj.size / 2 - 4}
          width={obj.size + 8}
          height={obj.size + 8}
          stroke="#0ea5e9"
          strokeWidth={1}
          dash={[4, 3]}
          listening={false}
        />
      )}
    </Group>
  );
}

/**
 * Per-subtype glyph for `marker` objects. Drawn centred at (0,0) — the
 * parent `Group` handles position/rotation/drag.
 */
function MarkerGlyph({
  obj,
  selected,
}: {
  obj: SicroMarkerObject;
  selected: boolean;
}) {
  const size = obj.size;
  const color = obj.color ?? "#1f2937";
  const subtype = obj.subtype;

  if (subtype === "collision_x") {
    return (
      <Group>
        <Line
          points={[-size / 2, -size / 2, size / 2, size / 2]}
          stroke={color}
          strokeWidth={3}
        />
        <Line
          points={[-size / 2, size / 2, size / 2, -size / 2]}
          stroke={color}
          strokeWidth={3}
        />
      </Group>
    );
  }

  if (subtype === "brake_mark" || subtype === "drag_mark") {
    // Faixa retangular tracejada (frenagem) ou listras curtas (arrasto).
    const dash = subtype === "brake_mark" ? [16, 8] : [4, 6];
    return (
      <Group>
        <Line
          points={[-size / 2, -3, size / 2, -3]}
          stroke={color}
          strokeWidth={4}
          dash={dash}
          lineCap="butt"
        />
        <Line
          points={[-size / 2, 3, size / 2, 3]}
          stroke={color}
          strokeWidth={4}
          dash={dash}
          lineCap="butt"
        />
      </Group>
    );
  }

  if (subtype === "fluid" || subtype === "blood") {
    // Mancha — elipse irregular com cor saturada e contorno suave.
    return (
      <Group>
        <Ellipse
          radiusX={size * 0.55}
          radiusY={size * 0.42}
          rotation={20}
          fill={color}
          opacity={0.55}
          stroke={color}
          strokeWidth={1}
        />
        <Ellipse
          x={size * 0.18}
          y={-size * 0.12}
          radiusX={size * 0.18}
          radiusY={size * 0.14}
          fill={color}
          opacity={0.65}
        />
      </Group>
    );
  }

  if (subtype === "debris") {
    // Cluster de triângulos pequenos.
    const tri = (cx: number, cy: number, s: number) => (
      <Line
        key={`${cx},${cy}`}
        points={[cx, cy - s, cx + s, cy + s, cx - s, cy + s]}
        closed
        fill={color}
        opacity={0.7}
      />
    );
    return (
      <Group>
        {tri(-size * 0.25, -size * 0.05, 4)}
        {tri(size * 0.12, size * 0.15, 5)}
        {tri(size * 0.32, -size * 0.18, 3.5)}
        {tri(-size * 0.05, size * 0.3, 3)}
      </Group>
    );
  }

  if (subtype === "pedestrian") {
    // Cabeça + corpo simples vista de cima.
    return (
      <Group>
        <Circle radius={size * 0.32} fill={color} />
        <Rect
          x={-size * 0.18}
          y={size * 0.15}
          width={size * 0.36}
          height={size * 0.5}
          fill={color}
          cornerRadius={3}
        />
      </Group>
    );
  }

  if (subtype === "body") {
    // Vítima em decúbito — corpo elíptico horizontal.
    return (
      <Group>
        <Ellipse
          radiusX={size * 0.65}
          radiusY={size * 0.28}
          fill={color}
          opacity={0.85}
        />
        <Circle x={-size * 0.55} radius={size * 0.18} fill={color} />
      </Group>
    );
  }

  if (subtype === "victim_point" || subtype === "trace_point") {
    return (
      <Circle
        radius={size / 2}
        fill={color}
        stroke={selected ? "#0ea5e9" : "transparent"}
        strokeWidth={2}
      />
    );
  }

  // Fallback: círculo sólido.
  return <Circle radius={size / 2} fill={color} />;
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
      rotation={obj.rotation ?? 0}
      draggable={draggable && !obj.locked}
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
      draggable={draggable && !obj.locked}
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
    tool.startsWith("vehicle") ||
    tool.startsWith("line_") ||
    tool.startsWith("marker_") ||
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
