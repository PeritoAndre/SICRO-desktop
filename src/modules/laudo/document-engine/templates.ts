/**
 * Content templates for new laudos.
 *
 * Each template returns a TipTap document JSON (`type: "doc"`, `content: […]`)
 * pré-povoado com a espinha dorsal do laudo. O perito edita o conteúdo
 * livremente em seguida — o template é apenas o ponto de partida.
 *
 * A função `build` recebe a `Occurrence` ativa (quando disponível) para
 * injetar `systemData` inline em pontos óbvios (BO, município, tipo de
 * perícia, peritos, datas). Esses systemData nodes ficam destacados no
 * editor (estado `pending`) até o perito aceitar.
 */

import type { JSONContent } from "@tiptap/core";

/** Loose shape of an Occurrence — keeps this module independent of the
 *  typed `@domain/occurrence` so it can also be invoked from tests. */
export interface OccurrenceContext {
  numero_bo?: string | null;
  protocolo?: string | null;
  requisicao?: string | null;
  oficio?: string | null;
  tipo_pericia?: string | null;
  municipio?: string | null;
  data_fato?: string | null;
  peritos?: string[];
}

export interface LaudoTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  /** Build the initial TipTap document. `title` becomes the document
   *  heading; `occurrence` (when present) feeds the systemData inline
   *  injections. */
  build: (title: string, occurrence?: OccurrenceContext | null) => JSONContent;
}

// ===========================================================================
// Documento Livre

const documentoLivre: LaudoTemplate = {
  id: "documento_livre",
  name: "Documento livre",
  description:
    "Modelo em branco com um único cabeçalho. O perito decide o resto.",
  category: "Genérico",
  build: (title, _occurrence) => ({
    type: "doc",
    content: [
      headingNode(1, title || "Laudo Pericial"),
      paragraphNode(
        "Este é um modelo livre. Comece a escrever ou insira blocos pela barra de ferramentas.",
      ),
    ],
  }),
};

// ===========================================================================
// Sinistro de Trânsito Simples

const sinistroTransitoSimples: LaudoTemplate = {
  id: "sinistro_transito_simples",
  name: "Sinistro de Trânsito Simples",
  description:
    "Espinha dorsal para laudo de sinistro de trânsito — preâmbulo, histórico, exames, análise, conclusão, quesitos e assinatura.",
  category: "Trânsito",
  build: (title, occurrence) => {
    const oc = occurrence ?? {};
    return {
      type: "doc",
      content: [
        // Título
        headingNode(1, title || "Laudo Pericial — Sinistro de Trânsito"),

        // PREÂMBULO
        headingNode(2, "PREÂMBULO"),
        paragraphNode(
          buildPreambuloRuns(oc),
        ),

        // 1 – DO HISTÓRICO
        headingNode(2, "1 – DO HISTÓRICO"),
        paragraphNode(
          "Descrever de forma sucinta a comunicação que originou o atendimento pericial, a data e a hora do fato, bem como os primeiros dados recebidos pela equipe.",
        ),
        paragraphNode(
          buildHistoricoRuns(oc),
        ),

        // 2 – DOS EXAMES
        headingNode(2, "2 – DOS EXAMES"),
        paragraphNode(
          "Relatar de forma objetiva o que foi examinado no local: posição final dos veículos, vestígios materiais, condições da via, sinalização, iluminação e demais elementos pertinentes.",
        ),
        paragraphNode(
          "Inserir aqui figuras, croqui esquemático e tabelas técnicas conforme necessário.",
        ),

        // 3 – DA ANÁLISE TÉCNICO-PERICIAL
        headingNode(2, "3 – DA ANÁLISE TÉCNICO-PERICIAL"),
        paragraphNode(
          "Apresentar a análise técnica do perito sobre os elementos examinados. Esta seção deve ser preenchida exclusivamente pelo profissional responsável e não admite interpretação automatizada.",
        ),
        paragraphNode(
          "Caso haja vídeo, anexar storyboard no item correspondente.",
        ),

        // 4 – DA CONCLUSÃO
        headingNode(2, "4 – DA CONCLUSÃO"),
        paragraphNode(
          "Síntese conclusiva do perito a partir das análises anteriores. O SICRO não preenche este campo automaticamente — a conclusão é autoral.",
        ),

        // 5 – DOS QUESITOS
        headingNode(2, "5 – DOS QUESITOS"),
        paragraphNode(
          "Responder, de forma individual e objetiva, aos quesitos formulados pela autoridade requisitante.",
        ),
        {
          type: "quesitoList",
          content: [
            {
              type: "quesitoItem",
              content: [
                {
                  type: "quesitoQuestion",
                  content: [{ type: "text", text: "Houve sinistro de trânsito no local examinado?" }],
                },
                {
                  type: "quesitoAnswer",
                  content: [{ type: "text", text: "(resposta a ser preenchida pelo perito)" }],
                },
              ],
            },
            {
              type: "quesitoItem",
              content: [
                {
                  type: "quesitoQuestion",
                  content: [{ type: "text", text: "Quais os vestígios materiais identificados?" }],
                },
                {
                  type: "quesitoAnswer",
                  content: [{ type: "text", text: "(resposta a ser preenchida pelo perito)" }],
                },
              ],
            },
          ],
        },

        // ASSINATURA
        headingNode(2, "ASSINATURA"),
        {
          type: "signature",
          attrs: {
            city: oc.municipio ?? "Macapá",
            uf: "AP",
            date: new Date().toISOString().slice(0, 10),
            name: (oc.peritos ?? [])[0] ?? "",
            role: "Perito Criminal",
          },
        },
      ],
    };
  },
};

// ===========================================================================
// Helpers

function headingNode(level: 1 | 2 | 3, text: string): JSONContent {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

/**
 * Build a paragraph node from either a plain string or an array of inline
 * nodes (so callers can mix text + systemData injections).
 */
function paragraphNode(content: string | JSONContent[]): JSONContent {
  if (typeof content === "string") {
    return {
      type: "paragraph",
      content: [{ type: "text", text: content }],
    };
  }
  return { type: "paragraph", content };
}

function systemDataNode(
  source: string,
  field: string,
  value: string,
): JSONContent {
  return {
    type: "systemData",
    attrs: { source, field, value, review_status: "pending" },
  };
}

function textNode(text: string): JSONContent {
  return { type: "text", text };
}

/** Build the PREÂMBULO paragraph with systemData injected for the obvious
 *  occurrence fields. Whenever a field is empty, falls back to a neutral
 *  Portuguese placeholder so the resulting paragraph still reads cleanly. */
function buildPreambuloRuns(oc: OccurrenceContext): JSONContent[] {
  const runs: JSONContent[] = [
    textNode(
      "Aos cuidados da autoridade requisitante, atendendo à solicitação de exame pericial referente ao Boletim de Ocorrência ",
    ),
  ];
  if (oc.numero_bo && oc.numero_bo.trim()) {
    runs.push(systemDataNode("occurrence", "numero_bo", String(oc.numero_bo)));
  } else {
    runs.push(textNode("nº ____________"));
  }
  runs.push(textNode(", referente a ocorrência ocorrida no município de "));
  if (oc.municipio && oc.municipio.trim()) {
    runs.push(systemDataNode("occurrence", "municipio", String(oc.municipio)));
  } else {
    runs.push(textNode("____________"));
  }
  runs.push(textNode(", o perito signatário apresenta o presente laudo pericial referente a "));
  if (oc.tipo_pericia && oc.tipo_pericia.trim()) {
    runs.push(
      systemDataNode("occurrence", "tipo_pericia", String(oc.tipo_pericia)),
    );
  } else {
    runs.push(textNode("__________________________"));
  }
  runs.push(textNode("."));
  return runs;
}

function buildHistoricoRuns(oc: OccurrenceContext): JSONContent[] {
  const runs: JSONContent[] = [
    textNode("Conforme registrado, a ocorrência foi acionada referente ao BO "),
  ];
  if (oc.numero_bo && oc.numero_bo.trim()) {
    runs.push(systemDataNode("occurrence", "numero_bo", String(oc.numero_bo)));
  } else {
    runs.push(textNode("____________"));
  }
  if (oc.requisicao && String(oc.requisicao).trim()) {
    runs.push(textNode(", requisição "));
    runs.push(
      systemDataNode("occurrence", "requisicao", String(oc.requisicao)),
    );
  } else if (oc.oficio && String(oc.oficio).trim()) {
    runs.push(textNode(", ofício "));
    runs.push(systemDataNode("occurrence", "oficio", String(oc.oficio)));
  }
  if (oc.data_fato) {
    const dt = String(oc.data_fato).slice(0, 10);
    runs.push(textNode(", com data registrada em "));
    runs.push(systemDataNode("occurrence", "data_fato", dt));
  }
  runs.push(textNode("."));
  return runs;
}

// ===========================================================================
// Registry

export const TEMPLATES: ReadonlyArray<LaudoTemplate> = [
  documentoLivre,
  sinistroTransitoSimples,
];

export function findTemplate(id: string): LaudoTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? documentoLivre;
}
