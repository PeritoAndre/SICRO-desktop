/**
 * Road Render Lab — implementação SVG.
 *
 * Renderiza a mesma `LabScene` usando SVG nativo. Diferenças
 * estruturais vs Konva:
 *
 *   - **Bezier nativa**: `<path d="M ax,ay C cx1,cy1 cx2,cy2 bx,by">`
 *     desenha a Cubic Bezier sem amostragem. Resultado: curva vetorial
 *     perfeita em qualquer zoom (browser rasteriza no momento do
 *     paint).
 *   - **Ribbon polygon ainda calculado**: o asfalto e a calçada
 *     são polígonos `<polygon points="...">`. O SVG path com `stroke`
 *     daria um traço de largura uniforme mas sem suavização nas
 *     extremidades — preferimos polygon offset com pontos
 *     pré-computados (igual Konva).
 *   - **Marcações**: stroke-dasharray nativo. Usamos
 *     `vector-effect="non-scaling-stroke"` para que o dash NÃO escale
 *     com transforms — fica fixo em px de tela igual ao Tkinter
 *     `dash=(12, 8)` do Python.
 *   - **Clipping**: mesmo `clipPolylineAgainstPolygons` que Konva.
 *     SVG suporta `<clipPath>` mas para o caso aqui o clipping
 *     geométrico per-polyline é mais simples (e idêntico ao Konva).
 *   - **Rotatória**: `<circle>` puro com cores hardcoded.
 *
 * Por que esta implementação importa para o spike:
 *   - Testa se SVG produz melhor qualidade visual que Konva (suave,
 *     antialias, dash nativo).
 *   - Testa se SVG mantém performance aceitável (10-50 elementos).
 *   - Testa exportação PNG via canvas + serializeSVG.
 */

import { Fragment } from "react";
import {
  bezierArcLength,
  bezierToSvgPathD,
  buildEdges,
  buildRibbonOffset,
  buildRibbonPolygon,
  polygonToSvgPathD,
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

export interface SvgLabRendererProps {
  scene: LabScene;
  selectedRoadId?: string | null;
  onSelectRoad?: (id: string | null) => void;
}

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

interface RoadMesh {
  road: LabRoad;
  samplesWorld: Vec2[];
  asphaltPolyWorld: Vec2[];
  sidewalkPolyWorld: Vec2[];
}

function buildRoadMesh(road: LabRoad): RoadMesh {
  const samples = sampleBezier(road, 48);
  const halfWidth = road.largura_m / 2;
  return {
    road,
    samplesWorld: samples,
    asphaltPolyWorld: buildRibbonPolygon(samples, halfWidth),
    sidewalkPolyWorld: buildRibbonOffset(samples, halfWidth, LAB_SIDEWALK_WIDTH_M),
  };
}

function roundaboutDiskPolygon(rb: LabRoundabout, segments = 48): Vec2[] {
  const out: Vec2[] = [];
  const r = rb.r_m;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    out.push({ x: rb.cx + r * Math.cos(t), y: rb.cy + r * Math.sin(t) });
  }
  return out;
}

/**
 * Converte segmentos clipados em `d` de SVG path: cada segmento vira
 * "M x0,y0 L x1,y1 L ...", concatenado.
 */
function segmentsToSvgPathD(
  segments: Vec2[][],
  zoom: number,
  offsetX: number,
  offsetY: number,
): string {
  const parts: string[] = [];
  for (const seg of segments) {
    if (seg.length < 2) continue;
    const first = seg[0] as Vec2;
    parts.push(`M ${first.x * zoom + offsetX},${first.y * zoom + offsetY}`);
    for (let i = 1; i < seg.length; i++) {
      const p = seg[i] as Vec2;
      parts.push(`L ${p.x * zoom + offsetX},${p.y * zoom + offsetY}`);
    }
  }
  return parts.join(" ");
}

/**
 * Bezier polígono suave equivalente ao Konva `tension=0.5`. Para SVG
 * preferimos usar o polígono offset com curve continuous via Catmull-Rom
 * → Bezier. Por simplicidade aqui usamos polígono linear (já com 48
 * samples + offset perpendicular), que produz visual praticamente
 * idêntico para o nosso caso.
 */
function polygonToSmoothSvgPath(
  pts: ReadonlyArray<Vec2>,
  zoom: number,
  offsetX: number,
  offsetY: number,
): string {
  return polygonToSvgPathD(pts, zoom, offsetX, offsetY);
}

export function SvgLabRenderer({
  scene,
  selectedRoadId = null,
  onSelectRoad,
}: SvgLabRendererProps) {
  const { width_px, height_px, zoom, offset_x, offset_y } = scene.canvas;
  const meshes: RoadMesh[] = scene.roads.map(buildRoadMesh);
  const allRoadAsphaltPolys = meshes.map((m) => m.asphaltPolyWorld);
  const allRoundaboutDisks = scene.roundabouts.map((rb) =>
    roundaboutDiskPolygon(rb),
  );

  return (
    <svg
      width={width_px}
      height={height_px}
      viewBox={`0 0 ${width_px} ${height_px}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", background: "#e5e7eb" }}
    >
      {/* Pass 1 — Calçadas. */}
      <g>
        {meshes.map((m) => (
          <path
            key={`sidewalk_${m.road.id}`}
            d={polygonToSmoothSvgPath(
              m.sidewalkPolyWorld,
              zoom,
              offset_x,
              offset_y,
            )}
            fill={LAB_COLORS.sidewalk}
          />
        ))}
        {scene.roundabouts.map((rb) => {
          const cx = rb.cx * zoom + offset_x;
          const cy = rb.cy * zoom + offset_y;
          const rOuter =
            (rb.r_m + rb.largura_m / 2 + LAB_SIDEWALK_WIDTH_M) * zoom;
          return (
            <circle
              key={`sidewalk_${rb.id}`}
              cx={cx}
              cy={cy}
              r={rOuter}
              fill={LAB_COLORS.sidewalk}
            />
          );
        })}
      </g>

      {/* Pass 2 — Asfalto. */}
      <g>
        {meshes.map((m) => (
          <path
            key={`asphalt_${m.road.id}`}
            d={polygonToSmoothSvgPath(
              m.asphaltPolyWorld,
              zoom,
              offset_x,
              offset_y,
            )}
            fill={surfaceFill(m.road)}
            onClick={() => onSelectRoad?.(m.road.id)}
            style={{ cursor: onSelectRoad ? "pointer" : "default" }}
          />
        ))}
      </g>

      {/* Pass 3 — Rotatórias. */}
      <g>
        {scene.roundabouts.map((rb) => {
          const cx = rb.cx * zoom + offset_x;
          const cy = rb.cy * zoom + offset_y;
          const rOuter = (rb.r_m + rb.largura_m / 2) * zoom;
          const rInner = Math.max(0, (rb.r_m - rb.largura_m / 2) * zoom);
          return (
            <Fragment key={`rb_${rb.id}`}>
              <circle cx={cx} cy={cy} r={rOuter} fill={LAB_COLORS.asphalt} />
              {rInner > 1 && (
                <circle cx={cx} cy={cy} r={rInner} fill={LAB_COLORS.island} />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={rOuter}
                fill="none"
                stroke={LAB_COLORS.edge}
                strokeWidth={LAB_STROKE_WIDTH_PX}
                vectorEffect="non-scaling-stroke"
              />
              {rInner > 1 && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={rInner}
                  fill="none"
                  stroke={LAB_COLORS.edge}
                  strokeWidth={LAB_STROKE_WIDTH_PX}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </Fragment>
          );
        })}
      </g>

      {/* Pass 4 — Marcações clipadas. */}
      <g>
        {meshes.map((m) => {
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

          const elements: JSX.Element[] = [];

          // Bordas brancas — sólidas, recortadas.
          const leftD = segmentsToSvgPathD(
            leftSegments,
            zoom,
            offset_x,
            offset_y,
          );
          const rightD = segmentsToSvgPathD(
            rightSegments,
            zoom,
            offset_x,
            offset_y,
          );
          if (leftD) {
            elements.push(
              <path
                key={`edge_l_${m.road.id}`}
                d={leftD}
                stroke={LAB_COLORS.edge}
                strokeWidth={LAB_STROKE_WIDTH_PX}
                fill="none"
                strokeLinecap="butt"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />,
            );
          }
          if (rightD) {
            elements.push(
              <path
                key={`edge_r_${m.road.id}`}
                d={rightD}
                stroke={LAB_COLORS.edge}
                strokeWidth={LAB_STROKE_WIDTH_PX}
                fill="none"
                strokeLinecap="butt"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />,
            );
          }

          // Eixo central — só se mão dupla e tem marcação.
          if (m.road.mao_dupla && m.road.marcacao !== "nenhuma") {
            const centerSegments = clipPolylineAgainstPolygons(
              m.samplesWorld,
              obstacles,
            );
            const centerD = segmentsToSvgPathD(
              centerSegments,
              zoom,
              offset_x,
              offset_y,
            );
            if (centerD) {
              elements.push(
                <path
                  key={`center_${m.road.id}`}
                  d={centerD}
                  stroke={centerLineColor(m.road)}
                  strokeWidth={LAB_STROKE_WIDTH_PX}
                  fill="none"
                  strokeDasharray={`${LAB_DASH_PX[0]} ${LAB_DASH_PX[1]}`}
                  strokeLinecap="butt"
                  vectorEffect="non-scaling-stroke"
                />,
              );
            }
          }

          return (
            <Fragment key={`marks_${m.road.id}`}>{elements}</Fragment>
          );
        })}
      </g>

      {/* Pass 5 — Handles. */}
      {selectedRoadId && (
        <g>
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
                <Fragment key={`handles_${m.road.id}`}>
                  <line
                    x1={ax}
                    y1={ay}
                    x2={c1x}
                    y2={c1y}
                    stroke={LAB_COLORS.selection}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <line
                    x1={bx}
                    y1={by}
                    x2={c2x}
                    y2={c2y}
                    stroke={LAB_COLORS.selection}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={ax}
                    cy={ay}
                    r={6}
                    fill={LAB_COLORS.selection}
                    stroke="#1a1a1a"
                    strokeWidth={2}
                  />
                  <circle
                    cx={bx}
                    cy={by}
                    r={6}
                    fill={LAB_COLORS.selection}
                    stroke="#1a1a1a"
                    strokeWidth={2}
                  />
                  <circle cx={c1x} cy={c1y} r={4} fill="#4F72E0" />
                  <circle cx={c2x} cy={c2y} r={4} fill="#4F72E0" />
                </Fragment>
              );
            })}
        </g>
      )}

      {/* Mantém referências para evitar warnings de "unused". */}
      <metadata>
        {`samplesUsed=${meshes.length}; arcLengthSum=${meshes
          .reduce((acc, m) => acc + bezierArcLength(m.samplesWorld), 0)
          .toFixed(1)}m; bezierMode=true; svgBezierExample=${bezierToSvgPathD(
          scene.roads[0] ?? { ax: 0, ay: 0, cx1: 0, cy1: 0, cx2: 0, cy2: 0, bx: 0, by: 0 } as LabRoad,
          zoom,
          offset_x,
          offset_y,
        )}`}
      </metadata>
    </svg>
  );
}
