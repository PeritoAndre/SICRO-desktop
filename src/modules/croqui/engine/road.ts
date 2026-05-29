/**
 * Road v1 — STUB pós-Fase S.
 *
 * O renderer Road v1 (RoadNode em CanvasStage) e seus helpers de geometria
 * foram removidos quando a Fase S decidiu manter apenas o Python Parity
 * Engine como motor de via.
 *
 * Este arquivo expõe **apenas os stubs mínimos** que CanvasStage e
 * outros consumidores ainda importam, todos no-op:
 *
 *   - `ClipCircle` (tipo): mantido pra preservar APIs internas, mas
 *     nunca populado.
 *   - `polylineIntersectionsDetailed`, `junctionPolygonFromSegments`,
 *     `clipPolylineAgainstCircles`, `offsetPolyline`, `endcapBasis`,
 *     `pairsOf`: funções no-op que retornam arrays vazios.
 *
 * O fluxo real de v1 (intersection patches, clip zones) está
 * curto-circuitado em CanvasStage — esses imports só sobrevivem pra
 * preservar tipagem do código legado que iremos remover gradualmente.
 *
 * NÃO ADICIONE nova lógica aqui. Se algum recurso de via for
 * necessário, faça em `road-parity/`.
 */

import type { SicroPoint } from "./schema";

/**
 * Tipo histórico — círculo de clip usado pelo RoadNode v1 pra evitar
 * desenhar marcações dentro de interseções. Mantido pra compile compat.
 */
export interface ClipCircle {
  x: number;
  y: number;
  r: number;
}

/**
 * Tipo histórico — informação de cruzamento entre duas polylines.
 * Mantido pra compile compat (nunca populado mais).
 */
export interface PolylineIntersectionDetail {
  point: SicroPoint;
  iSegment: number;
  jSegment: number;
}

// ---------------------------------------------------------------------------
// Stubs — sempre retornam vazio. v1 não renderiza mais.

export function polylineIntersectionsDetailed(
  _a: ReadonlyArray<number>,
  _b: ReadonlyArray<number>,
): PolylineIntersectionDetail[] {
  return [];
}

export function junctionPolygonFromSegments(
  _ptsA: ReadonlyArray<number>,
  _segA: number,
  _halfA: number,
  _ptsB: ReadonlyArray<number>,
  _segB: number,
  _halfB: number,
  hit: SicroPoint,
): SicroPoint[] {
  // Retorna polígono degenerado (todos no ponto de cruzamento) —
  // o CanvasStage trata array vazio/degenerado como "sem patch".
  return [hit, hit, hit, hit];
}

/**
 * STUB. Originalmente fragmentava uma polyline em segmentos que evitam
 * círculos de clip de interseções. Sem v1 ativo, devolve a polyline
 * inteira como uma única sub-polyline.
 */
export function clipPolylineAgainstCircles(
  points: ReadonlyArray<number>,
  _zones: ReadonlyArray<ClipCircle>,
): number[][] {
  if (points.length < 4) return [];
  return [points.slice()];
}

/**
 * STUB. Calculava offset paralelo de polyline (lado esquerdo/direito da
 * via). Sem v1 ativo, devolve a polyline original sem offset.
 */
export function offsetPolyline(
  points: ReadonlyArray<number>,
  _offset: number,
): number[] {
  return points.slice();
}

/**
 * Basis vetorial pra desenhar endcap (faixa de pedestre, parada) num
 * terminal da via. STUB pós-Fase S — devolve null pra que o consumer
 * pule o render do endcap silenciosamente.
 *
 * Assinatura preservada do v1 original:
 *   - `center`: ponto do endcap.
 *   - `along`: vetor unitário pra dentro do corpo da via.
 *   - `across`: vetor unitário perpendicular ("largura" da via).
 */
export function endcapBasis(
  _points: ReadonlyArray<number>,
  _end: "start" | "end",
): {
  center: SicroPoint;
  along: SicroPoint;
  across: SicroPoint;
} | null {
  return null;
}

/**
 * Converte uma polyline plana (x0,y0,x1,y1,...) em array de pontos
 * {x,y}. Usado pelo RoadNode v1 pra desenhar handles de control point.
 * Não é stub — é genuinamente útil em outras callsites; manteve o nome
 * legacy mesmo após Fase S.
 */
export function pairsOf(points: ReadonlyArray<number>): SicroPoint[] {
  const out: SicroPoint[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    out.push({ x: points[i] as number, y: points[i + 1] as number });
  }
  return out;
}
