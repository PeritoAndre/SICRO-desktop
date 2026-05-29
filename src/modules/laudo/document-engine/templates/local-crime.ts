/**
 * Template "Local de Crime" — laudo de exame em local de crime contra
 * a pessoa (homicídio, lesão corporal).
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

export const localCrime: LaudoTemplate = {
  id: "local_crime",
  name: "Local de Crime",
  description:
    "Exame pericial em local de crime contra a pessoa.",
  category: "Local de crime",
  build: (title) => ({
    type: "doc",
    content: [
      heading(1, title || "Laudo Pericial — Local de Crime"),

      heading(2, "PREÂMBULO"),
      {
        type: "paragraph",
        content: sentence([
          "Atendendo à requisição nº ",
          { field: "numero_requisicao" },
          " (BO ",
          { field: "numero_bo" },
          "), no município de ",
          { field: "municipio" },
          ", o perito apresenta laudo de ",
          { field: "tipo_exame" },
          ".",
        ]),
      },

      heading(2, "1 — DO LOCAL"),
      {
        type: "paragraph",
        content: sentence([
          "Endereço: ",
          { field: "local_pericia" },
          ". Coordenadas: ",
          { field: "coordenadas" },
          ".",
        ]),
      },
      paragraph(
        "Descrever características gerais do local: ambiente fechado " +
          "ou aberto, dimensões aproximadas, iluminação, ventilação, " +
          "demais elementos contextuais.",
      ),

      heading(2, "2 — DOS EXAMES"),
      heading(3, "2.1 — Posição da vítima"),
      paragraph("Descrever posição, vestimenta e demais aspectos visíveis."),
      heading(3, "2.2 — Vestígios identificados"),
      {
        type: "paragraph",
        content: sentence([
          "Vestígios: ",
          { field: "vestigios" },
          ".",
        ]),
      },
      heading(3, "2.3 — Cronologia de eventos"),
      paragraph("Sequência provável dos eventos com base nos vestígios."),

      heading(2, "3 — ANÁLISE TÉCNICO-PERICIAL"),
      paragraph(
        "Correlação entre vestígios, posição da vítima e demais " +
          "elementos para reconstituição dos fatos.",
      ),

      heading(2, "4 — CONCLUSÃO"),
      styledParagraph(
        "conclusao",
        "Síntese conclusiva da dinâmica reconstituída.",
      ),

      heading(2, "5 — QUESITOS"),
      quesitoList([
        { question: "Qual a provável dinâmica dos fatos?" },
        { question: "Há indícios de luta corporal ou movimento de corpo?" },
        { question: "Quais vestígios materiais foram identificados?" },
      ]),

      ...signatureBlock(),
    ],
  }),
};
