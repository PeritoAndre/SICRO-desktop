/**
 * Template "Exame Veicular" — perícia em veículo (autenticidade,
 * adulteração, dano material).
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

export const exameVeicular: LaudoTemplate = {
  id: "exame_veicular",
  name: "Exame Veicular",
  description:
    "Exame pericial em veículo: identificação, adulteração, danos.",
  category: "Trânsito",
  build: (title) => ({
    type: "doc",
    content: [
      heading(1, title || "Laudo Pericial de Exame Veicular"),

      heading(2, "PREÂMBULO"),
      {
        type: "paragraph",
        content: sentence([
          "Atendendo à requisição nº ",
          { field: "numero_requisicao" },
          " (BO ",
          { field: "numero_bo" },
          "), o perito apresenta laudo de exame veicular.",
        ]),
      },

      heading(2, "1 — DO VEÍCULO EXAMINADO"),
      {
        type: "paragraph",
        content: sentence([
          "Veículo: ",
          { field: "veiculos" },
          ". Placa: ",
          { field: "placas" },
          ". Chassi: ",
          { field: "chassis" },
          ".",
        ]),
      },

      heading(2, "2 — DOS EXAMES"),
      heading(3, "2.1 — Numeração de chassi"),
      paragraph("Local da gravação, técnica empregada, comparação com base."),
      heading(3, "2.2 — Numeração do motor"),
      paragraph("Verificação da gravação no bloco do motor."),
      heading(3, "2.3 — Placas"),
      paragraph("Material, técnica de fabricação, lacres e tarjetas."),

      heading(2, "3 — DANOS / ADULTERAÇÃO"),
      paragraph("Descrever sinais de adulteração ou danos relevantes."),

      heading(2, "4 — CONCLUSÃO"),
      styledParagraph(
        "conclusao",
        "Síntese: presença ou ausência de adulteração e demais " +
          "achados relevantes.",
      ),

      heading(2, "5 — QUESITOS"),
      quesitoList([
        { question: "O veículo apresenta sinais de adulteração?" },
        {
          question:
            "Os identificadores (chassi, motor, placa) são originais ou foram remarcados?",
        },
      ]),

      ...signatureBlock(),
    ],
  }),
};
