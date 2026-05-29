/**
 * Template "Arrombamento" — modelo para laudo pericial de exame em local
 * de arrombamento (furto/roubo qualificado).
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

export const arrombamento: LaudoTemplate = {
  id: "arrombamento",
  name: "Arrombamento",
  description:
    "Exame pericial de local de arrombamento (furto/roubo qualificado).",
  category: "Local de crime",
  build: (title) => ({
    type: "doc",
    content: [
      heading(1, title || "Laudo Pericial de Arrombamento"),

      heading(2, "PREÂMBULO"),
      {
        type: "paragraph",
        content: sentence([
          "Atendendo à requisição nº ",
          { field: "numero_requisicao" },
          " relativa ao BO ",
          { field: "numero_bo" },
          " (",
          { field: "municipio" },
          "/",
          { field: "uf" },
          "), o perito apresenta laudo de exame em local de ",
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
          ".",
        ]),
      },
      paragraph(
        "Descrever características do imóvel: tipo de edificação, " +
          "número de pavimentos, sistema de acesso, presença de muros, " +
          "grades, alarmes e demais elementos relevantes.",
      ),

      heading(2, "2 — DOS EXAMES"),
      heading(3, "2.1 — Ponto de acesso"),
      paragraph(
        "Descrever onde houve a quebra do invólucro: porta, janela, " +
          "telhado, parede, etc. Indicar dimensões, tipo de material e " +
          "ferramentas indicadas pelos vestígios.",
      ),
      heading(3, "2.2 — Vestígios identificados"),
      {
        type: "paragraph",
        content: sentence([
          "Vestígios: ",
          { field: "vestigios" },
          ".",
        ]),
      },

      heading(2, "3 — ANÁLISE TÉCNICO-PERICIAL"),
      paragraph(
        "Análise técnica das ferramentas/instrumentos utilizados, do " +
          "modus operandi e da provável sequência de eventos.",
      ),

      heading(2, "4 — CONCLUSÃO"),
      styledParagraph(
        "conclusao",
        "Síntese da análise: houve ou não arrombamento, instrumento " +
          "provável e demais elementos relevantes.",
      ),

      heading(2, "5 — QUESITOS"),
      quesitoList([
        { question: "Houve arrombamento?" },
        { question: "Qual o ponto de acesso utilizado?" },
        { question: "Qual instrumento foi provavelmente empregado?" },
      ]),

      ...signatureBlock(),
    ],
  }),
};
