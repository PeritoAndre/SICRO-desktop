/**
 * Pranchas de corpo humano — ARTE ORIGINAL (line-art esquemático).
 *
 * §13 / direito autoral: desenhos ORIGINAIS do SICRO. NÃO reproduzem figuras de
 * POP/LEME nem formulários específicos (protegidos). São esquemas ILUSTRATIVOS
 * — não escala anatômica métrica; servem pra LOCALIZAR lesões/achados.
 *
 * Prancha principal "corpo_completo": frente + costas na MESMA prancha, com as
 * subdivisões anatômicas NUMERADAS (nômina, vide regions.ts) e a legenda das
 * regiões impressa ao lado — padrão do croqui de morte violenta. As pranchas
 * individuais (anterior/posterior/cabeça) seguem disponíveis pra detalhe.
 */

import { REGIOES_ANTERIOR, REGIOES_POSTERIOR } from "../engine/regions";

export type BodyView =
  | "corpo_completo"
  | "anterior"
  | "posterior"
  | "cabeca_frontal";

export interface BodyTemplate {
  id: BodyView;
  label: string;
  width: number;
  height: number;
  svg: string;
}

const STROKE = "#334155";
const FILL = "#f1f5f9";
const GUIDE = "#cbd5e1";

/** Silhueta de corpo inteiro (contorno fechado, simétrico, viewBox 240×620). */
function fullBodyOutline(): string {
  return `M120 12
    C150 12 162 36 162 58 C162 80 150 92 140 98 L138 110
    C160 114 182 124 188 150 L196 250 L192 318
    C191 330 185 332 182 320 L172 250 L165 165 L160 250 L158 312 L166 360
    L160 470 L156 585 C156 596 140 596 138 586 L132 470 L124 372 L120 366
    L116 372 L108 470 L102 586 C100 596 84 596 84 585 L80 470 L74 360
    L82 312 L80 250 L75 165 L68 250 L58 320
    C55 332 49 330 48 318 L44 250 L52 150 C58 124 80 114 102 110 L100 98
    C90 92 78 80 78 58 C78 36 90 12 120 12 Z`.replace(/\s+/g, " ");
}

const ANTERIOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 620" width="240" height="620">
  <path d="${fullBodyOutline()}" fill="${FILL}" stroke="${STROKE}" stroke-width="2.4" stroke-linejoin="round"/>
  <line x1="120" y1="100" x2="120" y2="600" stroke="${GUIDE}" stroke-width="1" stroke-dasharray="4 4"/>
</svg>`;

const POSTERIOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 620" width="240" height="620">
  <path d="${fullBodyOutline()}" fill="${FILL}" stroke="${STROKE}" stroke-width="2.4" stroke-linejoin="round"/>
  <line x1="120" y1="118" x2="120" y2="330" stroke="${GUIDE}" stroke-width="1.4"/>
  <line x1="120" y1="330" x2="120" y2="362" stroke="${GUIDE}" stroke-width="1.2"/>
</svg>`;

const CABECA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 360" width="300" height="360">
  <path d="M150 24 C206 24 232 78 232 150 C232 226 198 322 150 332 C102 322 68 226 68 150 C68 78 94 24 150 24 Z"
    fill="${FILL}" stroke="${STROKE}" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M68 150 C54 146 52 178 70 184" fill="${FILL}" stroke="${STROKE}" stroke-width="2.2"/>
  <path d="M232 150 C246 146 248 178 230 184" fill="${FILL}" stroke="${STROKE}" stroke-width="2.2"/>
  <line x1="150" y1="40" x2="150" y2="320" stroke="${GUIDE}" stroke-width="1" stroke-dasharray="5 5"/>
  <line x1="80" y1="150" x2="220" y2="150" stroke="${GUIDE}" stroke-width="1" stroke-dasharray="5 5"/>
</svg>`;

// --- Prancha combinada (frente + costas + nômina numerada + legenda) ---
const COMBINED_W = 1040;
const COMBINED_H = 700;

function regionDot(x: number, y: number, n: number): string {
  return `<circle cx="${x}" cy="${y}" r="7" fill="#eef2f7" stroke="#94a3b8" stroke-width="1"/><text x="${x}" y="${y}" font-size="9" fill="#475569" text-anchor="middle" dominant-baseline="central">${n}</text>`;
}

function legendBlock(
  title: string,
  items: { n: number; label: string }[],
  x0: number,
  y0: number,
): string {
  const colSize = Math.ceil(items.length / 2);
  const lineH = 13;
  const colW = 168;
  let out = `<text x="${x0}" y="${y0}" font-size="11" font-weight="bold" fill="#0f172a">${title}</text>`;
  items.forEach((it, i) => {
    const col = Math.floor(i / colSize);
    const row = i % colSize;
    const lx = x0 + col * colW;
    const ly = y0 + 16 + row * lineH;
    out += `<text x="${lx}" y="${ly}" font-size="9" fill="#334155">${it.n}. ${it.label}</text>`;
  });
  return out;
}

function buildCombinedSvg(): string {
  const dotsAnt = REGIOES_ANTERIOR.map((r) => regionDot(r.x, r.y, r.n)).join("");
  const dotsPost = REGIOES_POSTERIOR.map((r) => regionDot(r.x, r.y, r.n)).join("");
  const legAnt = legendBlock(
    "ANTERIOR (frente)",
    REGIOES_ANTERIOR.map((r) => ({ n: r.n, label: r.label })),
    590,
    30,
  );
  const legPost = legendBlock(
    "POSTERIOR (costas)",
    REGIOES_POSTERIOR.map((r) => ({ n: r.n, label: r.label })),
    590,
    260,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COMBINED_W} ${COMBINED_H}" width="${COMBINED_W}" height="${COMBINED_H}">
    <rect x="0" y="0" width="${COMBINED_W}" height="${COMBINED_H}" fill="#ffffff"/>
    <text x="160" y="24" font-size="12" font-weight="bold" fill="#0f172a" text-anchor="middle">FRENTE</text>
    <text x="440" y="24" font-size="12" font-weight="bold" fill="#0f172a" text-anchor="middle">COSTAS</text>
    <g transform="translate(40,40)">
      <path d="${fullBodyOutline()}" fill="${FILL}" stroke="${STROKE}" stroke-width="2.2" stroke-linejoin="round"/>
      <line x1="120" y1="100" x2="120" y2="600" stroke="${GUIDE}" stroke-width="1" stroke-dasharray="4 4"/>
    </g>
    <g transform="translate(320,40)">
      <path d="${fullBodyOutline()}" fill="${FILL}" stroke="${STROKE}" stroke-width="2.2" stroke-linejoin="round"/>
      <line x1="120" y1="118" x2="120" y2="362" stroke="${GUIDE}" stroke-width="1.4"/>
    </g>
    ${dotsAnt}
    ${dotsPost}
    <line x1="575" y1="20" x2="575" y2="680" stroke="#e2e8f0" stroke-width="1"/>
    ${legAnt}
    ${legPost}
  </svg>`;
}

const COMBINED_SVG = buildCombinedSvg();

export const BODY_TEMPLATES: Record<BodyView, BodyTemplate> = {
  corpo_completo: {
    id: "corpo_completo",
    label: "Completo (frente + costas)",
    width: COMBINED_W,
    height: COMBINED_H,
    svg: COMBINED_SVG,
  },
  anterior: {
    id: "anterior",
    label: "Anterior (frente)",
    width: 240,
    height: 620,
    svg: ANTERIOR_SVG,
  },
  posterior: {
    id: "posterior",
    label: "Posterior (costas)",
    width: 240,
    height: 620,
    svg: POSTERIOR_SVG,
  },
  cabeca_frontal: {
    id: "cabeca_frontal",
    label: "Cabeça (frontal)",
    width: 300,
    height: 360,
    svg: CABECA_SVG,
  },
};

export const BODY_VIEW_ORDER: BodyView[] = [
  "corpo_completo",
  "anterior",
  "posterior",
  "cabeca_frontal",
];

export function bodyTemplateDataUri(view: BodyView): string {
  const tpl = BODY_TEMPLATES[view];
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(tpl.svg)}`;
}
