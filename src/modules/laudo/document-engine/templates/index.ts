/**
 * Registry de templates de laudo — barrel público.
 *
 * F5 — Substitui o `templates.ts` legado (que continha apenas 2
 * templates). Agora temos 8:
 *
 *   - Documento livre        (genérico)
 *   - Em branco              (genérico — só título)
 *   - Laudo genérico         (genérico — estrutura mínima)
 *   - Sinistro de Trânsito   (trânsito — completo)
 *   - Arrombamento           (local de crime)
 *   - Local de Crime         (local de crime)
 *   - Avaliação Merceológica (avaliação)
 *   - Constatação            (genérico)
 *   - Exame Veicular         (trânsito)
 *
 * O caller chama `findTemplate(id)` para obter um template ou cai no
 * default ("Documento livre").
 */

import { arrombamento } from "./arrombamento";
import { avaliacaoMerceologica } from "./avaliacao-merceologica";
import { constatacao } from "./constatacao";
import { documentoLivre } from "./documento-livre";
import { emBranco } from "./em-branco";
import { exameVeicular } from "./exame-veicular";
import { generico } from "./generico";
import { localCrime } from "./local-crime";
import { sinistroTransito } from "./sinistro-transito";

export type { LaudoTemplate, OccurrenceContext } from "./types";

export const TEMPLATES = [
  documentoLivre,
  emBranco,
  generico,
  sinistroTransito,
  arrombamento,
  localCrime,
  avaliacaoMerceologica,
  constatacao,
  exameVeicular,
] as const;

export function findTemplate(id: string) {
  return TEMPLATES.find((t) => t.id === id) ?? documentoLivre;
}

// F5 — Mantemos o alias `sinistro_transito_simples` no registry para
// que laudos LEGADOS (criados antes do F5) continuem encontrando seu
// template ao reabrir. Caso novo: usa `sinistro_transito`.
export function findTemplateWithLegacyAlias(id: string) {
  if (id === "sinistro_transito_simples") return sinistroTransito;
  return findTemplate(id);
}
