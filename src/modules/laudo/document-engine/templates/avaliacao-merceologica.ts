/**
 * Template "Avaliação Merceológica" — avaliação técnica de valor de bens.
 */

import type { LaudoTemplate } from "./types";
import {
  heading,
  paragraph,
  quesitoList,
  sentence,
  signatureBlock,
  styledParagraph,
} from "./helpers";

export const avaliacaoMerceologica: LaudoTemplate = {
  id: "avaliacao_merceologica",
  name: "Avaliação Merceológica",
  description:
    "Avaliação técnica do valor de bens (furto, roubo, apreensão).",
  category: "Avaliação",
  build: (title) => ({
    type: "doc",
    content: [
      heading(1, title || "Laudo Pericial de Avaliação Merceológica"),

      heading(2, "PREÂMBULO"),
      {
        type: "paragraph",
        content: sentence([
          "Em atenção à requisição nº ",
          { field: "numero_requisicao" },
          " (BO ",
          { field: "numero_bo" },
          "), o perito apresenta laudo de avaliação merceológica.",
        ]),
      },

      heading(2, "1 — DOS BENS EXAMINADOS"),
      paragraph(
        "Relacionar e descrever cada bem submetido à avaliação: marca, " +
          "modelo, número de série, estado de conservação, quantidade.",
      ),

      heading(2, "2 — METODOLOGIA"),
      paragraph(
        "Indicar fontes de pesquisa (sites especializados, lojas, " +
          "tabelas FIPE, etc.) e critérios de depreciação aplicados " +
          "conforme o estado de conservação.",
      ),

      heading(2, "3 — VALORAÇÃO"),
      paragraph(
        "Tabela de valoração — use Inserir Tabela (F7) para listar bem " +
          "por bem, com valor unitário e total.",
      ),

      heading(2, "4 — CONCLUSÃO"),
      styledParagraph(
        "conclusao",
        "Valor total estimado dos bens avaliados, com base na " +
          "metodologia descrita.",
      ),

      heading(2, "5 — QUESITOS"),
      quesitoList([
        { question: "Qual o valor estimado dos bens avaliados?" },
        {
          question:
            "Os bens apresentam características compatíveis com os descritos no BO?",
        },
      ]),

      ...signatureBlock(),
    ],
  }),
};
