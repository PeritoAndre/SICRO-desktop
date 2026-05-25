/**
 * Walk a TipTap JSON doc and inject sequential numbers into every `figure`
 * node, then prepend "Figura N — " / "Croqui N — " to the existing caption.
 *
 * Numbering is computed at render time (not persisted) so reordering blocks
 * in the editor doesn't require a save.
 */

import type { JSONContent } from "@tiptap/core";

interface Counters {
  image: number;
  croqui: number;
}

export function numberFigures(content: JSONContent): JSONContent {
  const counters: Counters = { image: 0, croqui: 0 };
  return walk(content, counters);
}

function walk(node: JSONContent, counters: Counters): JSONContent {
  if (node.type === "figure") {
    const kind: "image" | "croqui" =
      (node.attrs?.kind as "image" | "croqui" | undefined) ?? "image";
    counters[kind] += 1;
    const label = kind === "croqui" ? "Croqui" : "Figura";
    const number = counters[kind];

    return {
      ...node,
      content: (node.content ?? []).map((child) => {
        if (child.type !== "figcaption") return child;
        return prependCaption(child, `${label} ${number} — `);
      }),
    };
  }

  if (!node.content) return node;
  return {
    ...node,
    content: node.content.map((child) => walk(child, counters)),
  };
}

function prependCaption(
  figcaption: JSONContent,
  prefix: string,
): JSONContent {
  const existing = figcaption.content ?? [];
  // If a label is already there (e.g. user pasted), don't double up.
  const firstText = existing[0];
  if (
    firstText &&
    firstText.type === "text" &&
    typeof firstText.text === "string" &&
    /^(Figura|Croqui|Tabela|Imagem)\s+\d+\s*—/.test(firstText.text)
  ) {
    return figcaption;
  }

  return {
    ...figcaption,
    content: [{ type: "text", text: prefix }, ...existing],
  };
}
