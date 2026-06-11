/**
 * Construção da LEGENDA numerada a partir dos marcadores. Função PURA e
 * determinística (testável) — vira a tabela exibida no painel e embutida no
 * PNG exportado. Ordena por número crescente.
 */

import { lesaoMeta } from "./lesions";
import { regiaoComLado } from "./regions";
import type { SicroCorpoDoc, SicroLesaoMarker } from "./schema";

export interface LegendRow {
  number: number;
  tipo: string; // rótulo do tipo de lesão
  regiao: string; // região + lateralidade (pode ser vazio)
  instrumento: string;
  dimensoes: string;
  observacao: string;
  color: string; // cor do marcador (do tipo, ou override)
}

function rowFromMarker(m: SicroLesaoMarker): LegendRow {
  const meta = lesaoMeta(m.tipo);
  return {
    number: m.number,
    tipo: meta.label,
    regiao: regiaoComLado(m.regiao, m.lateralidade),
    instrumento: m.instrumento ?? "",
    dimensoes: m.dimensoes_cm ?? "",
    observacao: m.observacao ?? "",
    color: m.color || meta.color,
  };
}

export function buildLegend(doc: SicroCorpoDoc): LegendRow[] {
  return doc.markers
    .map(rowFromMarker)
    .sort((a, b) => a.number - b.number);
}

/** Resumo "3 FAF entrada, 1 arma branca…" para o cabeçalho/feedback. */
export function summarizeLesoes(doc: SicroCorpoDoc): string {
  if (doc.markers.length === 0) return "Nenhuma lesão marcada";
  const counts = new Map<string, number>();
  for (const m of doc.markers) {
    const label = lesaoMeta(m.tipo).label;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, n]) => `${n}× ${label}`)
    .join(" · ");
}
