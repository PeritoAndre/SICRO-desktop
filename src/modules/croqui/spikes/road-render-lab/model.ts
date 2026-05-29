/**
 * Road Render Lab — modelo de dados simplificado.
 *
 * 8 campos por via, 6 por rotatória — paridade direta com o SICRO 1.0
 * Python (`desenho/spline_via.py`).
 *
 * Todas as coordenadas e larguras são em **mundo (metros)**. O renderer
 * aplica `zoom` (px/m) na hora de desenhar. Isso é diferente do
 * SicroRoadObject real (que tem `width` em pixels) e é proposital — é
 * uma das simplificações em teste.
 *
 * Este modelo **não é parte do schema real do .sicrocroqui**. Vive só
 * dentro do spike `spikes/road-render-lab/`.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export type LabSurface = "asfalto" | "calcada" | "terra";

export type LabMarcacao = "amarela" | "branca" | "nenhuma";

/**
 * Via Bezier 4-point — 1:1 com o `_via_spline` do Python:
 *
 *   - A, B = âncoras inicial/final (mundo, metros).
 *   - C1, C2 = controles Bezier (mundo, metros).
 *   - largura_m = espessura do asfalto, em metros (não pixels).
 *   - superficie = paleta do polígono.
 *   - mao_dupla = true → renderer desenha eixo central tracejado.
 *   - marcacao = cor do eixo (amarelo arterial, branco residencial).
 */
export interface LabRoad {
  id: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  largura_m: number;
  superficie: LabSurface;
  mao_dupla: boolean;
  marcacao: LabMarcacao;
  /** Optional human label — não afeta render. */
  label?: string;
}

/**
 * Rotatória — 1:1 com o `_rotatoria` do Python:
 *
 *   - cx, cy = centro (mundo, metros).
 *   - r_m = raio externo do anel (metros).
 *   - largura_m = espessura do anel (metros).
 *   - superficie = só asfalto na prática; deixado configurável.
 *
 * Sem `inner_color` (verde `#3A6535` hardcoded no renderer).
 * Sem `border_color` (branco hardcoded).
 * Sem `lane_count`, sem `flares` parametrizados.
 */
export interface LabRoundabout {
  id: string;
  cx: number;
  cy: number;
  r_m: number;
  largura_m: number;
  superficie: LabSurface;
  label?: string;
}

/**
 * Uma cena de teste — vias + rotatórias + parâmetros do canvas.
 *
 * `zoom` aqui é fixo na fixture (pixels por metro) para que todos os
 * renderers usem o MESMO zoom e a comparação visual seja honesta.
 * O usuário pode ajustar via slider no LabApp, mas o default vem da
 * fixture.
 */
export interface LabScene {
  name: string;
  description: string;
  roads: LabRoad[];
  roundabouts: LabRoundabout[];
  canvas: {
    width_px: number;
    height_px: number;
    /** Pixels por metro. Aplicado pelo renderer. */
    zoom: number;
    /** Translação opcional do mundo para deixar a cena centrada. */
    offset_x: number;
    offset_y: number;
  };
}

// ---------------------------------------------------------------------------
// Paleta SICRO 1.0 (Python `editor_croqui.py` linhas 2810-3020) — hardcoded
// no spike. Cada renderer importa daqui para garantir paridade visual entre
// implementações.

export const LAB_COLORS = {
  /** Asfalto preto (linha 2950). */
  asphalt: "#1C1C1C",
  /** Calçada cinza-amarelado quente (linha 2927, 2938). */
  sidewalk: "#7C7460",
  /** Terra (`superficies.py` linha 44). */
  earth: "#9C7A4E",
  /** Ilha central rotatória — verde canteiro (linha 2964). */
  island: "#3A6535",
  /** Linhas de borda da via (linhas 2982, 3013). */
  edge: "#FFFFFF",
  /** Eixo amarelo arterial (linha 2991). */
  yellow: "#F5C518",
  /** Eixo branco residencial. */
  white: "#FFFFFF",
  /** Stroke de seleção (handles). */
  selection: "#4A80FF",
  /** Fundo "grama" do canvas Python (linha 3096). */
  grass: "#2B5020",
} as const;

/**
 * Largura do tracejado em pixels de TELA (não escala com zoom).
 * Python: `dash_mc = (12, 8)` (linha 2969).
 *
 * IMPORTANTE: para emular exatamente o Python, o dash deve ser fixo
 * em px de tela. Em SVG isso requer cuidado porque o `stroke-dasharray`
 * escala junto com o stroke. Em Konva é trivial.
 */
export const LAB_DASH_PX: readonly [number, number] = [12, 8];

/**
 * Largura da linha de borda + linha de marcação em px de tela.
 * Python: `lw_b = 2`, `lw_mc = 2` (linhas 2967-2968).
 */
export const LAB_STROKE_WIDTH_PX = 2;

/** Largura padrão da calçada em metros. */
export const LAB_SIDEWALK_WIDTH_M = 2.0;

// ---------------------------------------------------------------------------
// Helpers de criação rápida — útil para fixtures.

/**
 * Cria uma via reta entre dois pontos do mundo. Controles a 1/3 e 2/3
 * (= reta visual), mas pode ser arrastado depois.
 */
export function makeLabRoadReta(
  id: string,
  a: Vec2,
  b: Vec2,
  opts: Partial<LabRoad> = {},
): LabRoad {
  return {
    id,
    ax: a.x,
    ay: a.y,
    bx: b.x,
    by: b.y,
    cx1: a.x + (b.x - a.x) / 3,
    cy1: a.y + (b.y - a.y) / 3,
    cx2: a.x + (2 * (b.x - a.x)) / 3,
    cy2: a.y + (2 * (b.y - a.y)) / 3,
    largura_m: 7.0,
    superficie: "asfalto",
    mao_dupla: true,
    marcacao: "amarela",
    ...opts,
  };
}

/**
 * Cria uma via curva entre dois pontos com controles explícitos.
 */
export function makeLabRoad(
  id: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx1: number,
  cy1: number,
  cx2: number,
  cy2: number,
  opts: Partial<LabRoad> = {},
): LabRoad {
  return {
    id,
    ax,
    ay,
    bx,
    by,
    cx1,
    cy1,
    cx2,
    cy2,
    largura_m: 7.0,
    superficie: "asfalto",
    mao_dupla: true,
    marcacao: "amarela",
    ...opts,
  };
}

/**
 * Cria uma rotatória.
 */
export function makeLabRoundabout(
  id: string,
  cx: number,
  cy: number,
  r_m: number,
  largura_m = 7.0,
  opts: Partial<LabRoundabout> = {},
): LabRoundabout {
  return {
    id,
    cx,
    cy,
    r_m,
    largura_m,
    superficie: "asfalto",
    ...opts,
  };
}
