/**
 * Python Parity Engine — geometria pura.
 *
 * Funções sem dependência de Konva ou React. Tudo em coordenadas
 * de **mundo (metros)** + um `pxPerM` aplicado ao final para
 * gerar coordenadas de canvas.
 *
 * Paridade direta com `desenho/spline_via.py` do SICRO 1.0:
 *   - `sampleCubicBezier`    ≡ `bezier_pontos`
 *   - `buildRoadEdges`       ≡ `bordas_canvas`
 *   - `buildRoadRibbon`      ≡ `faixa_para_canvas`
 *   - `buildRoadSidewalk`    ≡ `faixa_offset`
 *
 * Adicional ao Python (para rotatória):
 *   - `buildRoundaboutRings` — raios externo, interno e calçada
 *     pré-computados para o renderer.
 */

import {
  PARITY_DEFAULT_PX_PER_M,
  PARITY_SIDEWALK_WIDTH_M,
  type SicroRoadObject_parity,
  type SicroRoundaboutObject_parity,
} from "./types";

// ---------------------------------------------------------------------------
// Tipo Vec2 local — não importamos de road-v2/types para isolar o motor.

export interface Vec2World {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Cubic Bezier sampling.

/**
 * Amostra a Cubic Bezier da via em `n + 1` pontos. Retorna lista de
 * Vec2 em coordenadas de mundo (metros).
 *
 * B(t) = u³ P0 + 3u²t P1 + 3ut² P2 + t³ P3
 *
 * onde u = 1 - t, P0 = (ax, ay), P1 = (cx1, cy1),
 * P2 = (cx2, cy2), P3 = (bx, by).
 *
 * Default `n = 32` — denso o suficiente para curvas suaves, leve
 * o suficiente para 30+ vias num croqui.
 */
export function sampleCubicBezier(
  road: SicroRoadObject_parity,
  n = 32,
): Vec2World[] {
  const out: Vec2World[] = [];
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
 * Comprimento aproximado de uma centerline já amostrada.
 */
export function polylineLength(samples: ReadonlyArray<Vec2World>): number {
  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1] as Vec2World;
    const b = samples[i] as Vec2World;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Bordas perpendiculares da pista.

/**
 * Para cada ponto da centerline, calcula a tangente local e a
 * perpendicular, e produz dois pontos: um deslocado para a esquerda,
 * outro para a direita, ambos a uma distância `halfWidthM` do centro.
 *
 * Retorna em coords de **mundo (metros)**, igual à entrada.
 *
 * Paridade Python: `bordas_canvas`.
 */
export function buildRoadEdges(
  samples: ReadonlyArray<Vec2World>,
  halfWidthM: number,
): { left: Vec2World[]; right: Vec2World[] } {
  const left: Vec2World[] = [];
  const right: Vec2World[] = [];
  const n = samples.length;
  if (n < 2) return { left, right };

  for (let i = 0; i < n; i++) {
    const p = samples[i] as Vec2World;
    let tx = 0;
    let ty = 0;
    if (i === 0) {
      const next = samples[1] as Vec2World;
      tx = next.x - p.x;
      ty = next.y - p.y;
    } else if (i === n - 1) {
      const prev = samples[i - 1] as Vec2World;
      tx = p.x - prev.x;
      ty = p.y - prev.y;
    } else {
      const next = samples[i + 1] as Vec2World;
      const prev = samples[i - 1] as Vec2World;
      tx = next.x - prev.x;
      ty = next.y - prev.y;
    }
    const len = Math.hypot(tx, ty) || 1;
    // Perpendicular (-ty, tx) × halfWidth.
    const nx = (-ty / len) * halfWidthM;
    const ny = (tx / len) * halfWidthM;
    left.push({ x: p.x + nx, y: p.y + ny });
    right.push({ x: p.x - nx, y: p.y - ny });
  }
  return { left, right };
}

// ---------------------------------------------------------------------------
// Ribbon polygon.

/**
 * Polígono fechado da pista de asfalto (mundo, metros). Combina
 * borda esquerda (forward) com borda direita (reverse).
 *
 * Paridade Python: `faixa_para_canvas`.
 */
export function buildRoadRibbon(
  samples: ReadonlyArray<Vec2World>,
  halfWidthM: number,
): Vec2World[] {
  const { left, right } = buildRoadEdges(samples, halfWidthM);
  return [...left, ...right.slice().reverse()];
}

/**
 * Polígono offset (mundo, metros) usado para calçada. Acrescenta
 * `extraM` à meia-largura.
 *
 * Paridade Python: `faixa_offset`.
 */
export function buildRoadSidewalk(
  samples: ReadonlyArray<Vec2World>,
  halfWidthM: number,
  extraM: number = PARITY_SIDEWALK_WIDTH_M,
): Vec2World[] {
  return buildRoadRibbon(samples, halfWidthM + extraM);
}

// ---------------------------------------------------------------------------
// Rotatória — raios pré-computados.

/**
 * Calcula os 3 raios da rotatória em **pixels de canvas**:
 *   - calçada externa (`r_m + largura_m/2 + 2m`)
 *   - asfalto externo (`r_m + largura_m/2`)
 *   - asfalto interno = ilha (`r_m - largura_m/2`)
 *
 * Retorna também o centro projetado (assumindo translação zero —
 * caller aplica offset_x/offset_y se necessário).
 */
export interface RoundaboutRingsPx {
  cx_px: number;
  cy_px: number;
  sidewalk_r_px: number;
  outer_r_px: number;
  inner_r_px: number; // pode ser 0 se ilha some
  /** Para uso em clipping de marcações — disco do asfalto. */
  outer_r_m: number;
}

export function buildRoundaboutRings(
  rb: SicroRoundaboutObject_parity,
  pxPerM: number,
): RoundaboutRingsPx {
  const safePx = Math.max(pxPerM, 0.0001);
  const halfLargM = rb.largura_m / 2;
  const inner_r_m = Math.max(0, rb.r_m - halfLargM);
  return {
    cx_px: rb.cx * safePx,
    cy_px: rb.cy * safePx,
    sidewalk_r_px:
      (rb.r_m + halfLargM + PARITY_SIDEWALK_WIDTH_M) * safePx,
    outer_r_px: (rb.r_m + halfLargM) * safePx,
    inner_r_px: inner_r_m * safePx,
    outer_r_m: rb.r_m + halfLargM,
  };
}

/**
 * Polígono discreto do disco da rotatória em coords mundo (metros).
 * Usado como obstáculo para clipping de marcações.
 *
 * `segments = 48` é suficiente para visual + clipping geométrico.
 */
export function buildRoundaboutDiskPolygon(
  rb: SicroRoundaboutObject_parity,
  segments = 48,
): Vec2World[] {
  const r = rb.r_m + rb.largura_m / 2;
  const out: Vec2World[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    out.push({ x: rb.cx + r * Math.cos(t), y: rb.cy + r * Math.sin(t) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Conversão de coords mundo → canvas.

/**
 * Resolve `pxPerM` efetivo a partir do scale do documento. Quando
 * nulo ou inválido, cai no default seguro.
 */
export function resolvePxPerM(scalePxPerM: number | null | undefined): number {
  if (typeof scalePxPerM !== "number") return PARITY_DEFAULT_PX_PER_M;
  if (!Number.isFinite(scalePxPerM) || scalePxPerM <= 0) {
    return PARITY_DEFAULT_PX_PER_M;
  }
  return scalePxPerM;
}

/**
 * Projeta uma lista de Vec2 do mundo (metros) para canvas (pixels).
 * Aplica translação `(offsetX, offsetY)` ao final.
 */
export function projectWorldPoints(
  worldPts: ReadonlyArray<Vec2World>,
  pxPerM: number,
  offsetX: number,
  offsetY: number,
): Vec2World[] {
  const scale = Math.max(pxPerM, 0.0001);
  return worldPts.map((p) => ({
    x: p.x * scale + offsetX,
    y: p.y * scale + offsetY,
  }));
}

/**
 * Flat array para Konva.Line.points: `[x1, y1, x2, y2, ...]`.
 */
export function flattenVec2(pts: ReadonlyArray<Vec2World>): number[] {
  const out: number[] = [];
  for (const p of pts) {
    out.push(p.x, p.y);
  }
  return out;
}
