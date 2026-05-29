/**
 * Template "Constatação" — exame rápido para confirmar presença/natureza
 * de determinada substância ou objeto.
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

export const constatacao: LaudoTemplate = {
  id: "constatacao",
  name: "Constatação",
  description:
    "Laudo de constatação — exame rápido confirmando natureza de material.",
  category: "Genérico",
  build: (title) => ({
    type: "doc",
    content: [
      heading(1, title || "Laudo Pericial de Constatação"),

      heading(2, "PREÂMBULO"),
      {
        type: "paragraph",
        content: sentence([
          "Atendendo à requisição nº ",
          { field: "numero_requisicao" },
          " relativa ao BO ",
          { field: "numero_bo" },
          ", o perito apresenta laudo de constatação.",
        ]),
      },

      heading(2, "1 — DO MATERIAL EXAMINADO"),
      paragraph(
        "Descrever o material entregue à perícia: invólucro, lacre, " +
          "quantidade, características visíveis.",
      ),

      heading(2, "2 — DOS EXAMES"),
      paragraph(
        "Relatar os procedimentos realizados (testes preliminares, " +
          "exame visual, pesagem etc.).",
      ),

      heading(2, "3 — CONCLUSÃO"),
      styledParagraph(
        "conclusao",
        "Constata-se que o material examinado apresenta " +
          "características compatíveis com [descrever].",
      ),

      heading(2, "4 — QUESITOS"),
      quesitoList([
        { question: "Trata-se de substância ilícita?" },
        { question: "Qual a quantidade aproximada do material?" },
      ]),

      ...signatureBlock(),
    ],
  }),
};
