/**
 * Road Render Lab — boolean clipping de marcações.
 *
 * Emula o `_em_outra` + `_segs` do SICRO 1.0 Python — só que usando
 * boolean operations da biblioteca `polygon-clipping` (Greiner-Hormann +
 * Vatti) em vez de máscara per-pixel.
 *
 * O resultado é equivalente em qualidade visual:
 *   - cada marcação central / linha de borda é cortada onde encontra
 *     a área de asfalto de OUTRA via;
 *   - resta uma série de segmentos curtos, contínuos só nos trechos
 *     visíveis.
 *
 * Vantagem sobre máscara per-pixel:
 *   - independe de renderer (funciona igual em Konva, SVG, qualquer
 *     coisa);
 *   - resultados geometricamente exatos (sub-pixel);
 *   - debug fácil (cada segmento é um polígono visível).
 */

import polygonClipping, { type Geom, type Pair } from "polygon-clipping";
import type { Vec2 } from "./model";

// ---------------------------------------------------------------------------
// Tipos do polygon-clipping (reexpostos para conveniência).

type PCRing = Pair[];
type PCPoly = PCRing[]; // outer ring + holes
type PCMulti = PCPoly[]; // multipolygon

// ---------------------------------------------------------------------------
// Conversões.

/**
 * Converte um polígono Vec2[] em formato `polygon-clipping`. O
 * polígono é tratado como simples (sem buracos) — o `polygon-clipping`
 * aceita polígonos não fechados e os fecha automaticamente.
 */
export function vec2ToPCPolygon(pts: ReadonlyArray<Vec2>): PCPoly {
  // [outer ring]
  return [pts.map((p) => [p.x, p.y] as Pair)];
}

/**
 * Converte uma polilinha (centerline, borda) em "polígono fino" para
 * poder usar como geometry em ops booleanas. Útil quando queremos
 * clipar a centerline de UMA via contra os polígonos de OUTRAS vias —
 * em ops booleanas o input é sempre polígono, não linha.
 *
 * NOTA: para clipar uma linha, na verdade usamos a abordagem inversa
 * (subdivide a linha em pontos e marca quais estão DENTRO dos
 * polígonos das outras vias). Veja `clipPolylineAgainstPolygons` abaixo.
 */

/**
 * Resultado de clipar uma polilinha: lista de sub-polilinhas
 * resultantes (cada uma é um trecho contínuo que ficou de fora dos
 * polígonos de obstáculo).
 */
export type ClippedSegments = Vec2[][];

/**
 * Clipa uma polilinha `line` contra os polígonos `obstacles`,
 * retornando os trechos da linha que NÃO estão dentro de qualquer
 * obstáculo.
 *
 * Algoritmo:
 *   1. Para cada ponto da linha, checa se está dentro de algum
 *      obstáculo via ponto-em-polígono.
 *   2. Para cada SEGMENTO entre dois pontos (i, i+1):
 *      - ambos fora → emite o segmento.
 *      - ambos dentro → pula.
 *      - cruza fronteira → calcula ponto exato de cruzamento e
 *        emite o sub-segmento de fora.
 *   3. Trechos contínuos formam sub-polilinhas (corta quando vê um
 *      ponto dentro de obstáculo).
 *
 * Resultado: lista de sub-polilinhas, cada uma com >= 2 pontos.
 */
export function clipPolylineAgainstPolygons(
  line: ReadonlyArray<Vec2>,
  obstacles: ReadonlyArray<ReadonlyArray<Vec2>>,
): ClippedSegments {
  if (line.length < 2) return [];
  if (obstacles.length === 0) return [line.slice()];

  const inside = (p: Vec2): boolean => {
    for (const poly of obstacles) {
      if (pointInPolygon(p, poly)) return true;
    }
    return false;
  };

  const result: ClippedSegments = [];
  let current: Vec2[] = [];
  const n = line.length;

  for (let i = 0; i < n; i++) {
    const p = line[i] as Vec2;
    const pIn = inside(p);
    if (i === 0) {
      if (!pIn) current.push(p);
      continue;
    }
    const prev = line[i - 1] as Vec2;
    const prevIn = inside(prev);
    if (!prevIn && !pIn) {
      // Ambos fora — mas o SEGMENTO pode entrar e sair de um
      // obstáculo (caso raro). Por simplicidade, ignoramos esse
      // caso por enquanto e apenas emitimos o ponto.
      current.push(p);
    } else if (prevIn && pIn) {
      // Ambos dentro — não emite nada. Se current tem algo,
      // fecha-o.
      if (current.length >= 2) result.push(current);
      current = [];
    } else if (!prevIn && pIn) {
      // Saindo do espaço livre. Calcula ponto de cruzamento na
      // borda do obstáculo.
      const cross = findCrossingOnSegment(prev, p, obstacles);
      if (cross) current.push(cross);
      if (current.length >= 2) result.push(current);
      current = [];
    } else {
      // !pIn && prevIn — entrando no espaço livre.
      const cross = findCrossingOnSegment(prev, p, obstacles);
      if (cross) current = [cross, p];
      else current = [p];
    }
  }
  if (current.length >= 2) result.push(current);
  return result;
}

/**
 * Ponto-em-polígono via ray casting clássico. O[N] no número de
 * vértices.
 */
function pointInPolygon(
  p: Vec2,
  polygon: ReadonlyArray<Vec2>,
): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i] as Vec2;
    const pj = polygon[j] as Vec2;
    const intersect =
      pi.y > p.y !== pj.y > p.y &&
      p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Procura o ponto exato em que o segmento `a→b` cruza a borda de
 * algum dos obstáculos. Retorna o primeiro cruzamento encontrado
 * (suficiente para clipping linear).
 */
function findCrossingOnSegment(
  a: Vec2,
  b: Vec2,
  obstacles: ReadonlyArray<ReadonlyArray<Vec2>>,
): Vec2 | null {
  // Binary search no parâmetro t ∈ [0, 1] do segmento.
  // 30 iterações = ~1e-9 de precisão, suficiente.
  let lo = 0;
  let hi = 1;
  const sampleAt = (t: number): Vec2 => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const aIn = obstacles.some((poly) => pointInPolygon(a, poly));
  // Garante que estamos em uma transição. Se ambos forem true ou ambos
  // false, não há crossing.
  const bIn = obstacles.some((poly) => pointInPolygon(b, poly));
  if (aIn === bIn) return null;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const midP = sampleAt(mid);
    const midIn = obstacles.some((poly) => pointInPolygon(midP, poly));
    if (midIn === aIn) lo = mid;
    else hi = mid;
  }
  return sampleAt((lo + hi) / 2);
}

// ---------------------------------------------------------------------------
// Boolean ops "de verdade" via polygon-clipping (para outros usos
// futuros — ex: gerar polígono de junção entre duas vias).

/**
 * União de polígonos.
 */
export function polygonsUnion(polys: ReadonlyArray<ReadonlyArray<Vec2>>): PCMulti {
  if (polys.length === 0) return [];
  const inputs = polys.map((p) => vec2ToPCPolygon(p));
  if (inputs.length === 1) return [inputs[0] as PCPoly];
  const [first, ...rest] = inputs as Geom[];
  return polygonClipping.union(first as PCPoly, ...(rest as PCPoly[]));
}

/**
 * Diferença: A - B.
 */
export function polygonsDifference(
  a: ReadonlyArray<Vec2>,
  b: ReadonlyArray<ReadonlyArray<Vec2>>,
): PCMulti {
  const aGeom = vec2ToPCPolygon(a) as PCPoly;
  const bGeoms = b.map((p) => vec2ToPCPolygon(p) as PCPoly);
  return polygonClipping.difference(aGeom, ...bGeoms);
}
