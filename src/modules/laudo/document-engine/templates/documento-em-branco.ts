/**
 * Template "Documento em branco" — único modelo atual.
 *
 * Conteúdo do CORPO: vazio (apenas o título do laudo).
 *
 * O cabeçalho oficial (Governo do Amapá / Polícia Científica /
 * Departamento de Criminalística) NÃO entra no `build()` desta
 * função — ele é injetado em camada separada via
 * `layout.institutional_template = "pca_padrao_v1"` e o
 * `header.content` semeado pela própria criação do laudo (ver
 * `NewLaudoDialog`).
 *
 * Para criar novos templates no futuro, basta acrescentar um
 * arquivo irmão exportando `LaudoTemplate` e registrá-lo em
 * `index.ts` na lista `TEMPLATES`.
 */

import type { LaudoTemplate } from "./types";
import { heading, paragraph } from "./helpers";

export const documentoEmBranco: LaudoTemplate = {
  id: "documento_em_branco",
  name: "Documento em branco",
  description:
    "Modelo base com o cabeçalho oficial da Polícia Científica do Amapá. " +
    "O corpo começa vazio — você escreve o laudo do zero.",
  category: "Genérico",
  build: (title) => ({
    type: "doc",
    content: [
      heading(1, title || "Laudo Pericial"),
      paragraph(""),
    ],
  }),
};
