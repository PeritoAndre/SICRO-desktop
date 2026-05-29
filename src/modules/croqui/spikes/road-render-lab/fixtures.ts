/**
 * Road Render Lab — fixtures de teste.
 *
 * Cada fixture é uma `LabScene` autocontida com posicionamento
 * pré-calculado no mundo (metros) e parâmetros de canvas que produzem
 * uma vista razoável.
 *
 * 6 cenas obrigatórias (pedidas pelo perito):
 *   1. via curva única
 *   2. via em U (retorno)
 *   3. cruzamento X (4 vias)
 *   4. cruzamento T (3 vias)
 *   5. rotatória 4 vias
 *   6. Macapá-like (rotatória + Avenida Manoel Torrinha divided +
 *      Renascimento + Principal + Socialismo)
 */

import {
  makeLabRoad,
  makeLabRoadReta,
  makeLabRoundabout,
  type LabScene,
} from "./model";

const CANVAS_BASE = {
  width_px: 1200,
  height_px: 800,
  zoom: 6, // px/m — 1 m do mundo = 6 px no canvas
  offset_x: 600, // mundo (0, 0) → canvas (600, 400)
  offset_y: 400,
};

/**
 * 1. Via curva única — Bezier com controle deslocado verticalmente.
 *    Cobre o caso "uma via dobra de um lado pro outro do canvas".
 */
export const FIXTURE_CURVA: LabScene = {
  name: "Via curva",
  description:
    "Uma via tertiary fazendo curva em S leve. Testa: ribbon polygon em curva, " +
    "edges suaves, tracejado amarelo seguindo a curva sem distorção.",
  roads: [
    makeLabRoad("road_curva", -60, -20, 60, 20, -30, -40, 30, 40, {
      largura_m: 7.5,
      mao_dupla: true,
      marcacao: "amarela",
      label: "Avenida curva",
    }),
  ],
  roundabouts: [],
  canvas: CANVAS_BASE,
};

/**
 * 2. Via em U (retorno) — Bezier dobra 180°.
 *    Cobre o caso difícil de auto-cruzamento em retorno apertado.
 */
export const FIXTURE_U_TURN: LabScene = {
  name: "Via em U (retorno)",
  description:
    "Retorno em U apertado. Testa: ribbon não auto-cruza, edges não " +
    "geram triângulos invertidos no ápice da curva.",
  roads: [
    makeLabRoad(
      "road_u",
      -40,
      -30,
      -40,
      30,
      40,
      -30, // C1 puxa pra direita
      40,
      30, // C2 também
      {
        largura_m: 7.0,
        mao_dupla: true,
        marcacao: "amarela",
        label: "Retorno",
      },
    ),
  ],
  roundabouts: [],
  canvas: CANVAS_BASE,
};

/**
 * 3. Cruzamento X — 4 vias retas convergindo no centro.
 *    Cada via é uma `LabRoad` separada começando no centro e indo pra
 *    um dos pontos cardeais. Junção é resolvida pelo clipping de
 *    marcações (cada eixo amarelo é cortado dentro do polígono das
 *    outras vias).
 */
export const FIXTURE_CRUZ_X: LabScene = {
  name: "Cruzamento X",
  description:
    "4 vias arteriais convergindo no centro. Testa: clipping de " +
    "marcações nas junções, asfalto contínuo, sem triângulos espúrios.",
  roads: [
    makeLabRoadReta(
      "x_norte",
      { x: 0, y: 0 },
      { x: 0, y: -60 },
      { largura_m: 7.5, label: "Norte" },
    ),
    makeLabRoadReta(
      "x_sul",
      { x: 0, y: 0 },
      { x: 0, y: 60 },
      { largura_m: 7.5, label: "Sul" },
    ),
    makeLabRoadReta(
      "x_leste",
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { largura_m: 7.5, label: "Leste" },
    ),
    makeLabRoadReta(
      "x_oeste",
      { x: 0, y: 0 },
      { x: -80, y: 0 },
      { largura_m: 7.5, label: "Oeste" },
    ),
  ],
  roundabouts: [],
  canvas: CANVAS_BASE,
};

/**
 * 4. Cruzamento T — 3 vias. Uma horizontal contínua + uma vertical
 *    chegando no meio.
 */
export const FIXTURE_CRUZ_T: LabScene = {
  name: "Cruzamento T",
  description:
    "Via horizontal contínua + via vertical chegando no meio. Testa: " +
    "clipping do eixo central da horizontal contra a vertical.",
  roads: [
    makeLabRoadReta(
      "t_horiz",
      { x: -80, y: 0 },
      { x: 80, y: 0 },
      { largura_m: 7.5, label: "Horizontal" },
    ),
    makeLabRoadReta(
      "t_vert",
      { x: 0, y: 0 },
      { x: 0, y: 60 },
      {
        largura_m: 6.0,
        marcacao: "branca",
        label: "Vertical (residencial)",
      },
    ),
  ],
  roundabouts: [],
  canvas: CANVAS_BASE,
};

/**
 * 5. Rotatória 4 vias — anel central + 4 vias chegando pelos cardeais.
 *    Vias TERMINAM no perímetro do anel (não atravessam).
 */
export const FIXTURE_ROTATORIA: LabScene = {
  name: "Rotatória + 4 vias",
  description:
    "Rotatória central com 4 vias arteriais. Testa: anel + ilha verde, " +
    "vias clipam contra o anel, marcações cortadas perto do anel.",
  roads: [
    makeLabRoadReta(
      "rb_norte",
      { x: 0, y: -15 },
      { x: 0, y: -80 },
      { largura_m: 7.5, label: "Norte" },
    ),
    makeLabRoadReta(
      "rb_sul",
      { x: 0, y: 15 },
      { x: 0, y: 80 },
      { largura_m: 7.5, label: "Sul" },
    ),
    makeLabRoadReta(
      "rb_leste",
      { x: 15, y: 0 },
      { x: 100, y: 0 },
      { largura_m: 7.5, label: "Leste" },
    ),
    makeLabRoadReta(
      "rb_oeste",
      { x: -15, y: 0 },
      { x: -100, y: 0 },
      { largura_m: 7.5, label: "Oeste" },
    ),
  ],
  roundabouts: [
    makeLabRoundabout("rb_central", 0, 0, 12, 8, {
      label: "Rotatória central",
    }),
  ],
  canvas: CANVAS_BASE,
};

/**
 * 6. Fixture Macapá-like — caso real reprovado pelo perito.
 *
 * Cena com:
 *   - Avenida Manoel Torrinha vinda do oeste com **canteiro central**
 *     (duas vias oneway paralelas, gap de ~4 m entre elas);
 *   - Rua Renascimento vinda do nordeste em curva;
 *   - Rua Principal descendo reto para o sul;
 *   - Rua Socialismo no sudeste (curta);
 *   - Rotatória central r=12 m.
 *
 * Critério: a malha tem que aparecer **reconhecível e contínua**, igual
 * a um croqui pericial real. As vias chegam até o perímetro da rotatória
 * (sem atravessar).
 */
export const FIXTURE_MACAPA: LabScene = {
  name: "Macapá-like (rotatória real)",
  description:
    "Rotatória central + Avenida Manoel Torrinha divided carriageway " +
    "(oeste) + Rua Renascimento (NE, curva) + Rua Principal (sul) + " +
    "Rua Socialismo (SE). Critério: malha reconhecível, vias terminam " +
    "no anel.",
  roads: [
    // Avenida Manoel Torrinha — 2 ways oneway com canteiro central de 4 m.
    makeLabRoadReta(
      "mt_norte",
      { x: -18, y: -3 }, // perto da rotatória
      { x: -150, y: -3 }, // oeste
      {
        largura_m: 6.0, // metade de uma arterial tertiary (7.5/2 = 3.75 não fica visível; uso 6 que é um pouco maior)
        mao_dupla: false,
        marcacao: "branca",
        label: "Avenida Manoel Torrinha (norte)",
      },
    ),
    makeLabRoadReta(
      "mt_sul",
      { x: -150, y: 3 },
      { x: -18, y: 3 },
      {
        largura_m: 6.0,
        mao_dupla: false,
        marcacao: "branca",
        label: "Avenida Manoel Torrinha (sul)",
      },
    ),
    // Rua Renascimento — curva NE. Bezier com controle puxado pra
    // simular curva.
    makeLabRoad(
      "rua_renascimento",
      18,
      -3, // start perto da rotatória
      130,
      -90, // fim ao NE distante
      45,
      -3, // C1 sai reto da rotatória pro leste
      80,
      -30, // C2 curva pro norte
      {
        largura_m: 7.5,
        mao_dupla: true,
        marcacao: "amarela",
        label: "Rua Renascimento",
      },
    ),
    // Rua Principal — desce reto pro sul.
    makeLabRoadReta(
      "rua_principal",
      { x: 0, y: 16 },
      { x: 0, y: 120 },
      {
        largura_m: 6.0,
        mao_dupla: false,
        marcacao: "branca",
        label: "Rua Principal",
      },
    ),
    // Rua Socialismo — sudeste curta.
    makeLabRoadReta(
      "rua_socialismo",
      { x: 12, y: 12 },
      { x: 90, y: 80 },
      {
        largura_m: 6.0,
        mao_dupla: false,
        marcacao: "branca",
        label: "Rua Socialismo",
      },
    ),
  ],
  roundabouts: [
    makeLabRoundabout("rb_macapa", 0, 0, 14, 9, {
      label: "Rotatória central",
    }),
  ],
  canvas: {
    width_px: 1200,
    height_px: 800,
    zoom: 4.5,
    offset_x: 600,
    offset_y: 400,
  },
};

// ---------------------------------------------------------------------------
// Registro central — usado pelo LabApp para popular o dropdown.

export const FIXTURES: ReadonlyArray<LabScene> = [
  FIXTURE_CURVA,
  FIXTURE_U_TURN,
  FIXTURE_CRUZ_X,
  FIXTURE_CRUZ_T,
  FIXTURE_ROTATORIA,
  FIXTURE_MACAPA,
];

export function getFixtureByName(name: string): LabScene | null {
  return FIXTURES.find((f) => f.name === name) ?? null;
}
