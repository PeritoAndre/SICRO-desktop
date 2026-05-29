/**
 * Template "Sinistro de Trânsito" — espinha completa do laudo pericial
 * típico de sinistro de trânsito.
 *
 * F5 — Substitui o `sinistro_transito_simples` legado. Mudanças:
 *   - 100% de placeholders `{{var}}` reativos (nada de `systemData`).
 *   - Estrutura ampliada: Preâmbulo, Histórico, Local, Exames, Análise,
 *     Discussão, Conclusão, Quesitos, Anexos, Assinatura.
 *   - Cada heading carrega `data-laudo-style` casando com o catálogo.
 *   - Blocos de Conclusão / Quesitos usam os estilos visuais do F4.
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

export const sinistroTransito: LaudoTemplate = {
  id: "sinistro_transito",
  name: "Sinistro de Trânsito",
  description:
    "Modelo completo para laudo de sinistro de trânsito: preâmbulo, " +
    "histórico, local, exames, análise, conclusão, quesitos e assinatura.",
  category: "Trânsito",
  build: (title) => ({
    type: "doc",
    content: [
      heading(1, title || "Laudo Pericial — Sinistro de Trânsito"),

      // PREÂMBULO
      heading(2, "PREÂMBULO"),
      {
        type: "paragraph",
        content: sentence([
          "Aos cuidados da autoridade requisitante (",
          { field: "autoridade_requisitante" },
          "), atendendo à requisição nº ",
          { field: "numero_requisicao" },
          " relativa ao Boletim de Ocorrência nº ",
          { field: "numero_bo" },
          ", referente a ocorrência registrada no município de ",
          { field: "municipio" },
          "/",
          { field: "uf" },
          ", o perito signatário apresenta o presente laudo pericial " +
            "referente a ",
          { field: "tipo_exame" },
          ".",
        ]),
      },

      // 1 — HISTÓRICO
      heading(2, "1 — DO HISTÓRICO"),
      {
        type: "paragraph",
        content: sentence([
          "A presente perícia foi realizada em ",
          { field: "data_pericia" },
          ", às ",
          { field: "hora_pericia" },
          ", no endereço ",
          { field: "local_pericia" },
          ". Conforme registrado, a ocorrência foi acionada pelo BO nº ",
          { field: "numero_bo" },
          ".",
        ]),
      },
      paragraph(
        "Descrever brevemente os primeiros dados recebidos pela equipe " +
          "e a sequência de eventos que originou o atendimento pericial.",
      ),

      // 2 — DO LOCAL
      heading(2, "2 — DO LOCAL"),
      {
        type: "paragraph",
        content: sentence([
          "Município: ",
          { field: "municipio" },
          " (",
          { field: "uf" },
          "). Coordenadas: ",
          { field: "coordenadas" },
          ".",
        ]),
      },
      {
        type: "paragraph",
        content: sentence([
          "Condições climáticas: ",
          { field: "condicoes_climaticas" },
          ". Condições de iluminação: ",
          { field: "condicoes_iluminacao" },
          ".",
        ]),
      },
      paragraph(
        "Descrever características da via, sinalização, pavimento, " +
          "obstáculos e demais elementos relevantes do local.",
      ),

      // 3 — DOS EXAMES
      heading(2, "3 — DOS EXAMES"),
      paragraph(
        "Relatar de forma objetiva o que foi examinado: posição final " +
          "dos veículos, vestígios materiais, condições da via, " +
          "sinalização, iluminação e demais elementos pertinentes.",
      ),
      paragraph(
        "Inserir figuras, croqui esquemático e tabelas técnicas " +
          "conforme necessário — use a aba Evidências.",
      ),

      // 4 — DOS VEÍCULOS
      heading(3, "3.1 — Dos veículos examinados"),
      {
        type: "paragraph",
        content: sentence([
          "Veículos: ",
          { field: "veiculos" },
          ". Placas: ",
          { field: "placas" },
          ".",
        ]),
      },

      // 5 — DOS VESTÍGIOS
      heading(3, "3.2 — Dos vestígios identificados"),
      {
        type: "paragraph",
        content: sentence([
          "Vestígios: ",
          { field: "vestigios" },
          ".",
        ]),
      },

      // 6 — ANÁLISE
      heading(2, "4 — DA ANÁLISE TÉCNICO-PERICIAL"),
      paragraph(
        "Apresentar a análise técnica do perito sobre os elementos " +
          "examinados. Esta seção é de elaboração autoral; não é " +
          "passível de preenchimento automático.",
      ),

      // 7 — DISCUSSÃO
      heading(2, "5 — DISCUSSÃO TÉCNICO-PERICIAL"),
      paragraph(
        "Discutir a correlação entre vestígios, dinâmica e elementos " +
          "examinados, fundamentando os pontos a serem concluídos.",
      ),

      // 8 — CONCLUSÃO
      heading(2, "6 — DA CONCLUSÃO"),
      styledParagraph(
        "conclusao",
        "Síntese conclusiva do perito. O SICRO não preenche este campo " +
          "automaticamente — a conclusão é autoral.",
      ),

      // 9 — QUESITOS
      heading(2, "7 — DOS QUESITOS"),
      paragraph(
        "Responder, de forma individual e objetiva, aos quesitos " +
          "formulados pela autoridade requisitante.",
      ),
      quesitoList([
        { question: "Houve sinistro de trânsito no local examinado?" },
        { question: "Quais os vestígios materiais identificados?" },
        { question: "Qual a dinâmica provável do sinistro?" },
      ]),

      // 10 — ANEXOS
      heading(2, "8 — ANEXOS"),
      paragraph(
        "Croquis, fotografias, frames de vídeo e demais documentos " +
          "complementares. Use a aba Evidências para inserir.",
      ),

      // ASSINATURA
      ...signatureBlock(),
    ],
  }),
};
