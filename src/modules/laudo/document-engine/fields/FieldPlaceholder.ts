/**
 * FieldPlaceholder — node TipTap inline para campos automáticos `{{var}}`.
 *
 * F5 — Cada placeholder vira um nó atômico no documento:
 *
 *   <span data-field="numero_laudo" class="sicro-field">{{numero_laudo}}</span>
 *
 * Em runtime no editor, mostramos `{{numero_laudo}}` (placeholder) OU o
 * valor resolvido — escolha do renderer.
 *
 * Diferente do `SystemData` legado (que armazena o valor materializado),
 * o `FieldPlaceholder` armazena APENAS a chave. O valor vem sempre do
 * resolver — então se o perito atualiza o caso (mudando o número do BO,
 * por exemplo), todos os placeholders se atualizam automaticamente.
 *
 * Comandos:
 *   - `insertFieldPlaceholder(key)` — insere um placeholder na seleção.
 *
 * Persistência: `{ type: "fieldPlaceholder", attrs: { field: "numero_bo" } }`.
 *
 * Renderer HTML (renderer.ts em renderização final): chama
 * `resolveFieldValue(attrs.field, ctx)` e substitui o nó pelo texto
 * resolvido. Se vazio, mantém o placeholder visual para indicar pendência.
 *
 * Walker DOCX: mesma lógica — substituir pelo valor resolvido OU manter
 * placeholder textual (`{{key}}`) se sem valor.
 */

import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fieldPlaceholder: {
      /** Insere um `{{key}}` na posição atual da seleção. */
      insertFieldPlaceholder: (key: string) => ReturnType;
    };
  }
}

export const FieldPlaceholder = Node.create({
  name: "fieldPlaceholder",
  group: "inline",
  inline: true,
  atom: true,
  // Selecionável mas não editável internamente — comporta-se como uma
  // "pílula" de campo único, similar a uma menção em apps de chat.
  selectable: true,

  addAttributes() {
    return {
      field: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-field") || "",
        renderHTML: (attrs) => {
          if (!attrs["field"]) return {};
          return { "data-field": attrs["field"] };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-field]',
      },
      // Compatibilidade futura — `<x-field>` se algum exportador usar.
      { tag: "x-field" },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const key = (node.attrs["field"] as string) || "";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "sicro-field sicro-field-placeholder",
        "data-field": key,
        // contentEditable=false garante que o cursor pula o nó inteiro.
        contenteditable: "false",
      }),
      `{{${key}}}`,
    ];
  },

  addCommands() {
    return {
      insertFieldPlaceholder:
        (key: string) =>
        ({ commands }) => {
          if (!key) return false;
          return commands.insertContent({
            type: this.name,
            attrs: { field: key },
          });
        },
    };
  },
});
