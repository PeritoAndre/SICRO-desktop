/**
 * Spike B ships exactly one template: `documento_livre`.
 *
 * It seeds the editor with the minimum spine of a pericial laudo so the
 * perito can see the structure (heading + paragraph) immediately, but
 * leaves all content authorial.
 */

import type { JSONContent } from "@tiptap/core";

export interface LaudoTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  build: (title: string) => JSONContent;
}

const documentoLivre: LaudoTemplate = {
  id: "documento_livre",
  name: "Documento livre",
  description: "Modelo em branco com um único cabeçalho. O perito decide o resto.",
  category: "Genérico",
  build: (title: string) => ({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: title || "Laudo Pericial" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text:
              "Este é um modelo livre. Comece a escrever ou insira blocos pela barra de ferramentas.",
          },
        ],
      },
    ],
  }),
};

export const TEMPLATES: ReadonlyArray<LaudoTemplate> = [documentoLivre];

export function findTemplate(id: string): LaudoTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? documentoLivre;
}
