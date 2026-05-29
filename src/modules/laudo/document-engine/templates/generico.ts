/**
 * Template "Genérico" — estrutura mínima para qualquer tipo de exame
 * pericial não coberto pelos templates específicos.
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

export const generico: LaudoTemplate = {
  id: "generico",
  name: "Laudo genérico",
  description:
    "Estrutura mínima: preâmbulo, exames, análise, conclusão, quesitos, assinatura.",
  category: "Genérico",
  build: (title) => ({
    type: "doc",
    content: [
      heading(1, title || "Laudo Pericial"),

      heading(2, "PREÂMBULO"),
      {
        type: "paragraph",
        content: sentence([
          "Atendendo à requisição nº ",
          { field: "numero_requisicao" },
          " (BO ",
          { field: "numero_bo" },
          ", município de ",
          { field: "municipio" },
          "), o perito apresenta laudo referente a ",
          { field: "tipo_exame" },
          ".",
        ]),
      },

      heading(2, "1 — DOS EXAMES"),
      paragraph("Descrever o que foi examinado e os procedimentos adotados."),

      heading(2, "2 — ANÁLISE TÉCNICO-PERICIAL"),
      paragraph("Análise técnica dos elementos examinados."),

      heading(2, "3 — CONCLUSÃO"),
      styledParagraph(
        "conclusao",
        "Síntese conclusiva do perito.",
      ),

      heading(2, "4 — QUESITOS"),
      quesitoList([
        { question: "Quesito 1." },
        { question: "Quesito 2." },
      ]),

      ...signatureBlock(),
    ],
  }),
};
