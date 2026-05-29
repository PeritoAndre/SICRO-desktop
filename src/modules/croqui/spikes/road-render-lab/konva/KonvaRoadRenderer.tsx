/**
 * Road Render Lab — implementação Konva.
 *
 * Renderiza uma `LabScene` usando react-konva em 4 passes Python-style:
 *   1. Calçadas — Konva.Line(closed=true, tension=0.5, fill="#7C7460").
 *   2. Asfalto — idem com cor da superfície.
 *   3. Rotatórias — Konva.Circle ovals concêntricos.
 *   4. Marcações — Konva.Line abertas com dash, recortadas via
 *      `clipPolylineAgainstPolygons` contra polígonos de OUTRAS vias e
 *      contra o disco da rotatória.
 *   5. Handles (quando uma via está selecionada).
 *
 * Sem detector de junção topológica. Sem patches X/T/Y. Sem flares.
 * O clipping per-polygon resolve TUDO.
 */

import { useMemo } from "react";
import { Circle, Group, Layer, Line, Stage } from "react-konva";
import {
  bezierArcLength,
  buildEdges,
  buildRibbonOffset,
  buildRibbonPolygon,
  flattenPoints,
  projectPolyline,
  sampleBezier,
} from "../geometry";
import { clipPolylineAgainstPolygons } from "../clipping";
import {
  LAB_COLORS,
  LAB_DASH_PX,
  LAB_SIDEWALK_WIDTH_M,
  LAB_STROKE_WIDTH_PX,
  type LabRoad,
  type LabRoundabout,
  type LabScene,
  type Vec2,
} from "../model";

export interface KonvaLabRendererProps {
  scene: LabScene;
  selectedRoadId?: string | null;
  onSelectRoad?: (id: string | null) => void;
}

/**
 * Cor do asfalto/calçada/terra para uma via, baseada na `superficie`.
 */
function surfaceFill(road: LabRoad): string {
  switch (road.superficie) {
    case "asfalto":
      return LAB_COLORS.asphalt;
    case "calcada":
      return LAB_COLORS.sidewalk;
    case "terra":
      return LAB_COLORS.earth;
    default:
      return LAB_COLORS.asphalt;
  }
}

function centerLineColor(road: LabRoad): string {
  if (road.marcacao === "amarela") return LAB_COLORS.yellow;
  if (road.marcacao === "branca") return LAB_COLORS.white;
  return LAB_COLORS.edge;
}

/**
 * Estrutura pré-computada: para cada via, samples + polígono de asfalto
 * (mundo) + polígono de calçada (mundo). Usado tanto para render quanto
 * para clipping cruzado.
 */
interface RoadMesh {
  road: LabRoad;
  samplesWorld: Vec2[];
  asphaltPolyWorld: Vec2[];
  sidewalkPolyWorld: Vec2[];
  arcLengthM: number;
}

function buildRoadMesh(road: LabRoad): RoadMesh {
  const samples = sampleBezier(road, 48);
  const halfWidth = road.largura_m / 2;
  const asphaltPoly = buildRibbonPolygon(samples, halfWidth);
  const sidewalkPoly = buildRibbonOffset(
    samples,
    halfWidth,
    LAB_SIDEWALK_WIDTH_M,
  );
  return {
    road,
    samplesWorld: samples,
    asphaltPolyWorld: asphaltPoly,
    sidewalkPolyWorld: sidewalkPoly,
    arcLengthM: bezierArcLength(samples),
  };
}

/**
 * Disco do anel de uma rotatória (mundo) — usado como obstáculo para
 * clipping de marcações.
 */
function roundaboutDiskPolygon(rb: LabRoundabout, segments = 48): Vec2[] {
  const out: Vec2[] = [];
  const outerR = rb.r_m;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    out.push({
      x: rb.cx + outerR * Math.cos(t),
      y: rb.cy + outerR * Math.sin(t),
    });
  }
  return out;
}

/**
 * Renderer principal. Recebe uma cena e produz um <Stage> Konva.
 */
export function KonvaLabRenderer({
  scene,
  selectedRoadId = null,
  onSelectRoad,
}: KonvaLabRendererProps) {
  const { width_px, height_px, zoom, offset_x, offset_y } = scene.canvas;

  // Pré-computa meshes (compartilhados entre passes).
  const meshes = useMemo<RoadMesh[]>(
    () => scene.roads.map(buildRoadMesh),
    [scene.roads],
  );

  // Lista de polígonos de obstáculo para clipping cruzado: asfalto de
  // outras vias + discos de rotatórias.
  const allRoadAsphaltPolys = meshes.map((m) => m.asphaltPolyWorld);
  const allRoundaboutDisks = scene.roundabouts.map((rb) =>
    roundaboutDiskPolygon(rb),
  );

  return (
    <Stage width={width_px} height={height_px}>
      {/* Camada única (background é o div pai). Konva.Stage não tem
          background nativo — desenhamos um retângulo "grass" como
          primeiro shape. */}
      <Layer listening={false}>
        {/* Fundo cinza-claro para destacar o asfalto. */}
        <Line
          points={[0, 0, width_px, 0, width_px, height_px, 0, height_px]}
          closed
          fill="#e5e7eb"
        />
      </Layer>

      {/* Pass 1 — Calçadas das vias. */}
      <Layer listening={false}>
        {meshes.map((m) => {
          const canvasPts = projectPolyline(
            m.sidewalkPolyWorld,
            zoom,
            offset_x,
            offset_y,
          );
          return (
            <Line
              key={`sidewalk_${m.road.id}`}
              points={flattenPoints(canvasPts)}
              closed
              tension={0.5}
              fill={LAB_COLORS.sidewalk}
            />
          );
        })}
        {/* Calçadas externas das rotatórias. */}
        {scene.roundabouts.map((rb) => {
          const cx = rb.cx * zoom + offset_x;
          const cy = rb.cy * zoom + offset_y;
          const rOuter = (rb.r_m + rb.largura_m / 2 + LAB_SIDEWALK_WIDTH_M) * zoom;
          return (
            <Circle
              key={`sidewalk_${rb.id}`}
              x={cx}
              y={cy}
              radius={rOuter}
              fill={LAB_COLORS.sidewalk}
            />
          );
        })}
      </Layer>

      {/* Pass 2 — Asfalto das vias. */}
      <Layer>
        {meshes.map((m) => {
          const canvasPts = projectPolyline(
            m.asphaltPolyWorld,
            zoom,
            offset_x,
            offset_y,
          );
          return (
            <Line
              key={`asphalt_${m.road.id}`}
              points={flattenPoints(canvasPts)}
              closed
              tension={0.5}
              fill={surfaceFill(m.road)}
              onClick={() => onSelectRoad?.(m.road.id)}
              onTap={() => onSelectRoad?.(m.road.id)}
            />
          );
        })}
      </Layer>

      {/* Pass 3 — Rotatórias (asfalto + ilha + bordas brancas). */}
      <Layer listening={false}>
        {scene.roundabouts.map((rb) => {
          const cx = rb.cx * zoom + offset_x;
          const cy = rb.cy * zoom + offset_y;
          const rOuter = (rb.r_m + rb.largura_m / 2) * zoom;
          const rInner = Math.max(0, (rb.r_m - rb.largura_m / 2) * zoom);
          return (
            <Group key={`rb_${rb.id}`}>
              {/* Asfalto do anel. */}
              <Circle x={cx} y={cy} radius={rOuter} fill={LAB_COLORS.asphalt} />
              {/* Ilha verde. */}
              {rInner > 1 && (
                <Circle
                  x={cx}
                  y={cy}
                  radius={rInner}
                  fill={LAB_COLORS.island}
                />
              )}
              {/* Borda externa branca. */}
              <Circle
                x={cx}
                y={cy}
                radius={rOuter}
                stroke={LAB_COLORS.edge}
                strokeWidth={LAB_STROKE_WIDTH_PX}
                fillEnabled={false}
              />
              {/* Borda interna branca. */}
              {rInner > 1 && (
                <Circle
                  x={cx}
                  y={cy}
                  radius={rInner}
                  stroke={LAB_COLORS.edge}
                  strokeWidth={LAB_STROKE_WIDTH_PX}
                  fillEnabled={false}
                />
              )}
            </Group>
          );
        })}
      </Layer>

      {/* Pass 4 — Marcações (bordas brancas + eixo central tracejado),
          recortadas via boolean clipping. */}
      <Layer listening={false}>
        {meshes.map((m) => {
          // Obstáculos = polígonos das OUTRAS vias + todos os discos
          // de rotatória.
          const obstacles: Vec2[][] = [
            ...allRoadAsphaltPolys.filter(
              (_, idx) => meshes[idx]?.road.id !== m.road.id,
            ),
            ...allRoundaboutDisks,
          ];
          const { left, right } = buildEdges(
            m.samplesWorld,
            m.road.largura_m / 2,
          );

          const leftSegments = clipPolylineAgainstPolygons(left, obstacles);
          const rightSegments = clipPolylineAgainstPolygons(right, obstacles);

          const drawEdgeSegments = (
            segs: Vec2[][],
            key: string,
          ): JSX.Element[] =>
            segs.map((seg, i) => {
              const canvasSeg = projectPolyline(seg, zoom, offset_x, offset_y);
              return (
                <Line
                  key={`${key}_${i}`}
                  points={flattenPoints(canvasSeg)}
                  stroke={LAB_COLORS.edge}
                  strokeWidth={LAB_STROKE_WIDTH_PX}
                  lineCap="butt"
                  lineJoin="round"
                />
              );
            });

          const centerlineNodes: JSX.Element[] = [];
          if (m.road.marcacao !== "nenhuma") {
            const centerSegments = clipPolylineAgainstPolygons(
              m.samplesWorld,
              obstacles,
            );
            for (let i = 0; i < centerSegments.length; i++) {
              const seg = centerSegments[i] as Vec2[];
              const canvasSeg = projectPolyline(seg, zoom, offset_x, offset_y);
              if (m.road.mao_dupla) {
                centerlineNodes.push(
                  <Line
                    key={`center_${m.road.id}_${i}`}
                    points={flattenPoints(canvasSeg)}
                    stroke={centerLineColor(m.road)}
                    strokeWidth={LAB_STROKE_WIDTH_PX}
                    dash={[LAB_DASH_PX[0], LAB_DASH_PX[1]]}
                    lineCap="butt"
                  />,
                );
              }
            }
          }

          return (
            <Group key={`marks_${m.road.id}`}>
              {drawEdgeSegments(leftSegments, `edge_l_${m.road.id}`)}
              {drawEdgeSegments(rightSegments, `edge_r_${m.road.id}`)}
              {centerlineNodes}
            </Group>
          );
        })}
      </Layer>

      {/* Pass 5 — Handles da via selecionada. */}
      {selectedRoadId && (
        <Layer>
          {meshes
            .filter((m) => m.road.id === selectedRoadId)
            .map((m) => {
              const ax = m.road.ax * zoom + offset_x;
              const ay = m.road.ay * zoom + offset_y;
              const bx = m.road.bx * zoom + offset_x;
              const by = m.road.by * zoom + offset_y;
              const c1x = m.road.cx1 * zoom + offset_x;
              const c1y = m.road.cy1 * zoom + offset_y;
              const c2x = m.road.cx2 * zoom + offset_x;
              const c2y = m.road.cy2 * zoom + offset_y;
              return (
                <Group key={`handles_${m.road.id}`}>
                  {/* Linhas tracejadas conectando âncora-controle. */}
                  <Line
                    points={[ax, ay, c1x, c1y]}
                    stroke={LAB_COLORS.selection}
                    strokeWidth={1}
                    dash={[3, 3]}
                  />
                  <Line
                    points={[bx, by, c2x, c2y]}
                    stroke={LAB_COLORS.selection}
                    strokeWidth={1}
                    dash={[3, 3]}
                  />
                  {/* Âncoras grandes. */}
                  <Circle
                    x={ax}
                    y={ay}
                    radius={6}
                    fill={LAB_COLORS.selection}
                    stroke="#1a1a1a"
                    strokeWidth={2}
                  />
                  <Circle
                    x={bx}
                    y={by}
                    radius={6}
                    fill={LAB_COLORS.selection}
                    stroke="#1a1a1a"
                    strokeWidth={2}
                  />
                  {/* Controles menores. */}
                  <Circle x={c1x} y={c1y} radius={4} fill="#4F72E0" />
                  <Circle x={c2x} y={c2y} radius={4} fill="#4F72E0" />
                </Group>
              );
            })}
        </Layer>
      )}
    </Stage>
  );
}
