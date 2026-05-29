/**
 * Road Render Lab — geometria compartilhada entre todos os renderers.
 *
 * Tudo aqui é PURO (sem React, sem Konva, sem SVG). Cada renderer
 * importa essas funções para construir polígonos / polilinhas;
 * o que muda entre Konva e SVG é APENAS como os pontos finais são
 * desenhados, não como são calculados.
 *
 * Paridade com `desenho/spline_via.py` do Python:
 *   - `sampleBezier`           ≡ `bezier_pontos`
 *   - `buildRibbonPolygon`     ≡ `faixa_para_canvas`
 *   - `buildRibbonOffset`      ≡ `faixa_offset`
 *   - `buildEdges`             ≡ `bordas_canvas`
 */

import type { LabRoad, Vec2 } from "./model";

// ---------------------------------------------------------------------------
// Bezier cúbica.

/**
 * Amostra a Bezier cúbica em `n + 1` pontos. Retorna lista de Vec2.
 *
 * Python:
 *   B(t) = u³ P0 + 3u²t P1 + 3ut² P2 + t³ P3
 *
 * onde u = 1 - t, P0 = (ax, ay), P1 = (cx1, cy1),
 * P2 = (cx2, cy2), P3 = (bx, by).
 */
export function sampleBezier(road: LabRoad, n = 48): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const b0 = u * u * u;
    const b1 = 3 * u * u * t;
    const b2 = 3 * u * t * t;
    const b3 = t * t * t;
    out.push({
      x: b0 * road.ax + b1 * road.cx1 + b2 * road.cx2 + b3 * road.bx,
      y: b0 * road.ay + b1 * road.cy1 + b2 * road.cy2 + b3 * road.by,
    });
  }
  return out;
}

/**
 * Comprimento aproximado da Bezier — soma dos segmentos das amostras.
 */
export function bezierArcLength(samples: ReadonlyArray<Vec2>): number {
  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1] as Vec2;
    const b = samples[i] as Vec2;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Ribbon (polígono da pista de asfalto).

/**
 * Calcula bordas esquerda e direita da via, offset perpendicular do
 * eixo. Equivalente a `bordas_canvas` do Python (linhas 92-119 do
 * `spline_via.py`).
 *
 * Para cada ponto da centerline:
 *   1. tangente local (vetor diferença centrado entre vizinhos).
 *   2. normal = perpendicular × meia-largura.
 *   3. ponto esq = centro + normal; ponto dir = centro - normal.
 *
 * @param samples Centerline da Bezier (em mundo, metros).
 * @param halfWidth Meia-largura da pista, na mesma unidade dos samples.
 */
export function buildEdges(
  samples: ReadonlyArray<Vec2>,
  halfWidth: number,
): { left: Vec2[]; right: Vec2[] } {
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  const n = samples.length;
  if (n < 2) return { left, right };

  for (let i = 0; i < n; i++) {
    const p = samples[i] as Vec2;
    let tx = 0;
    let ty = 0;
    if (i === 0) {
      const next = samples[1] as Vec2;
      tx = next.x - p.x;
      ty = next.y - p.y;
    } else if (i === n - 1) {
      const prev = samples[i - 1] as Vec2;
      tx = p.x - prev.x;
      ty = p.y - prev.y;
    } else {
      const next = samples[i + 1] as Vec2;
      const prev = samples[i - 1] as Vec2;
      tx = next.x - prev.x;
      ty = next.y - prev.y;
    }
    const len = Math.hypot(tx, ty) || 1;
    // Perpendicular = rotaciona 90° anti-horário: (-ty, tx) escala.
    const nx = (-ty / len) * halfWidth;
    const ny = (tx / len) * halfWidth;
    left.push({ x: p.x + nx, y: p.y + ny });
    right.push({ x: p.x - nx, y: p.y - ny });
  }
  return { left, right };
}

/**
 * Polígono fechado da pista (ribbon): left + reverse(right).
 * Equivalente a `faixa_para_canvas` do Python (linhas 154-182).
 *
 * O polígono retornado é uma lista de Vec2 em ORDEM (não flat).
 * Renderer converte para o formato nativo (Konva flat array,
 * SVG path "M ... L ... Z").
 */
export function buildRibbonPolygon(
  samples: ReadonlyArray<Vec2>,
  halfWidth: number,
): Vec2[] {
  const { left, right } = buildEdges(samples, halfWidth);
  const reversed = right.slice().reverse();
  return [...left, ...reversed];
}

/**
 * Polígono offset com extra (usado para calçada). Equivalente a
 * `faixa_offset` do Python.
 */
export function buildRibbonOffset(
  samples: ReadonlyArray<Vec2>,
  halfWidth: number,
  extra: number,
): Vec2[] {
  return buildRibbonPolygon(samples, halfWidth + extra);
}

// ---------------------------------------------------------------------------
// Utilidades para mundo → canvas.

/**
 * Converte um ponto do mundo (metros) para canvas (px).
 * Aplica zoom + offset uniforme.
 */
export function worldToCanvas(
  p: Vec2,
  zoom: number,
  offsetX: number,
  offsetY: number,
): Vec2 {
  return {
    x: p.x * zoom + offsetX,
    y: p.y * zoom + offsetY,
  };
}

/**
 * Converte uma lista de pontos do mundo para canvas. Útil quando o
 * renderer só consegue lidar com array flat.
 */
export function projectPolyline(
  pts: ReadonlyArray<Vec2>,
  zoom: number,
  offsetX: number,
  offsetY: number,
): Vec2[] {
  return pts.map((p) => worldToCanvas(p, zoom, offsetX, offsetY));
}

/**
 * Converte lista de Vec2 para flat array `[x1, y1, x2, y2, ...]`.
 * Útil para Konva.Line.points.
 */
export function flattenPoints(pts: ReadonlyArray<Vec2>): number[] {
  const out: number[] = [];
  for (const p of pts) {
    out.push(p.x, p.y);
  }
  return out;
}

/**
 * Constrói string `d` de SVG path a partir da Bezier. Usa M + C
 * nativos do SVG — sem sampleia, sem aproximação. O navegador renderiza
 * a curva vetorial perfeita.
 *
 * `M ax,ay C cx1,cy1 cx2,cy2 bx,by`
 *
 * Esta é uma vantagem ESTRUTURAL do SVG sobre Konva — o SVG tem
 * suporte nativo a Cubic Bezier no path. Konva não tem; precisamos
 * sampleia a centerline e desenhar como polyline.
 */
export function bezierToSvgPathD(
  road: LabRoad,
  zoom: number,
  offsetX: number,
  offsetY: number,
): string {
  const ax = road.ax * zoom + offsetX;
  const ay = road.ay * zoom + offsetY;
  const bx = road.bx * zoom + offsetX;
  const by = road.by * zoom + offsetY;
  const cx1 = road.cx1 * zoom + offsetX;
  const cy1 = road.cy1 * zoom + offsetY;
  const cx2 = road.cx2 * zoom + offsetX;
  const cy2 = road.cy2 * zoom + offsetY;
  return `M ${ax},${ay} C ${cx1},${cy1} ${cx2},${cy2} ${bx},${by}`;
}

/**
 * Polígono fechado para SVG path: `M x0,y0 L x1,y1 L ... Z`.
 */
export function polygonToSvgPathD(
  pts: ReadonlyArray<Vec2>,
  zoom: number,
  offsetX: number,
  offsetY: number,
): string {
  if (pts.length === 0) return "";
  const parts: string[] = [];
  const first = pts[0] as Vec2;
  parts.push(`M ${first.x * zoom + offsetX},${first.y * zoom + offsetY}`);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i] as Vec2;
    parts.push(`L ${p.x * zoom + offsetX},${p.y * zoom + offsetY}`);
  }
  parts.push("Z");
  return parts.join(" ");
}
