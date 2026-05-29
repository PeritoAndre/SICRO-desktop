/**
 * Helpers compartilhados entre os templates de laudo.
 *
 * F5 — Substituem os helpers internos do `templates.ts` legado. A
 * principal mudança: em vez de `systemData` materializado, os
 * templates agora emitem `fieldPlaceholder` reativo. Quando o perito
 * atualizar o caso, todos os placeholders se atualizam.
 */

import type { JSONContent } from "@tiptap/core";

/** Heading com `data-laudo-style` ligado ao Título correspondente. */
export function heading(level: 1 | 2 | 3, text: string): JSONContent {
  const styleByLevel = {
    1: "titulo_1",
    2: "titulo_2",
    3: "titulo_3",
  } as const;
  return {
    type: "heading",
    attrs: { level, laudoStyle: styleByLevel[level] },
    content: [{ type: "text", text }],
  };
}

/** Subtítulo (paragraph com data-laudo-style="subtitulo"). */
export function subtitulo(text: string): JSONContent {
  return {
    type: "paragraph",
    attrs: { laudoStyle: "subtitulo" },
    content: [{ type: "text", text }],
  };
}

/** Parágrafo simples (corpo do laudo). */
export function paragraph(content: string | JSONContent[]): JSONContent {
  if (typeof content === "string") {
    return {
      type: "paragraph",
      content: [{ type: "text", text: content }],
    };
  }
  return { type: "paragraph", content };
}

/** Parágrafo estilizado (aplica `data-laudo-style`). */
export function styledParagraph(
  style: string,
  content: string | JSONContent[],
): JSONContent {
  const inlineContent =
    typeof content === "string"
      ? [{ type: "text", text: content }]
      : content;
  return {
    type: "paragraph",
    attrs: { laudoStyle: style },
    content: inlineContent,
  };
}

/** Texto puro (run inline). */
export function text(s: string): JSONContent {
  return { type: "text", text: s };
}

/** Placeholder `{{key}}` que será resolvido pelo runtime. */
export function field(key: string): JSONContent {
  return { type: "fieldPlaceholder", attrs: { field: key } };
}

/**
 * Helper de "frase com placeholders" — devolve um array de inline nodes
 * misturando texto e campos. Ex:
 *
 *   sentence([
 *     "Aos cuidados da autoridade requisitante, BO nº ",
 *     { field: "numero_bo" },
 *     ", referente a ocorrência ocorrida no município de ",
 *     { field: "municipio" },
 *     ".",
 *   ])
 */
export type SentencePart =
  | string
  | { field: string };

export function sentence(parts: SentencePart[]): JSONContent[] {
  return parts.map((p) =>
    typeof p === "string" ? text(p) : field(p.field),
  );
}

/** Lista numerada de quesito + resposta — bloco padrão pericial. */
export function quesitoList(
  items: Array<{ question: string; answer?: string }>,
): JSONContent {
  return {
    type: "quesitoList",
    content: items.map(({ question, answer }) => ({
      type: "quesitoItem",
      content: [
        {
          type: "quesitoQuestion",
          content: [{ type: "text", text: question }],
        },
        {
          type: "quesitoAnswer",
          content: [
            {
              type: "text",
              text: answer ?? "(resposta a ser preenchida pelo perito)",
            },
          ],
        },
      ],
    })),
  };
}

/** Bloco de assinatura — usa campos para data, perito, etc. */
export function signatureBlock(): JSONContent[] {
  return [
    heading(2, "ASSINATURA"),
    {
      type: "paragraph",
      attrs: { laudoStyle: "assinatura" },
      content: [
        text("Macapá-AP, "),
        field("data_hoje"),
        text("."),
      ],
    },
    {
      type: "paragraph",
      attrs: { laudoStyle: "assinatura" },
      content: [
        text("__________________________________"),
      ],
    },
    {
      type: "paragraph",
      attrs: { laudoStyle: "assinatura" },
      content: [
        field("nome_perito"),
      ],
    },
    {
      type: "paragraph",
      attrs: { laudoStyle: "assinatura" },
      content: [
        field("cargo_perito"),
        text(" — Matrícula "),
        field("matricula_perito"),
      ],
    },
  ];
}
