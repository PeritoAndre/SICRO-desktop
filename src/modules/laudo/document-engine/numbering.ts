/**
 * Walk a TipTap JSON doc and inject sequential numbers into every `figure`
 * node (prepending "Figura N — " / "Croqui N — " to the figcaption) and into
 * every `table` node (prepending "Tabela N — " to the table `caption` attr).
 *
 * Numbering is computed at render time (not persisted) so reordering blocks
 * in the editor doesn't require a save. Mirrors the live `AutoNumbering`
 * decoration of the editor so the exported PDF/DOCX matches the screen.
 */

import type { JSONContent } from "@tiptap/core";

interface Counters {
  image: number;
  croqui: number;
  table: number;
}

export function numberFigures(content: JSONContent): JSONContent {
  const counters: Counters = { image: 0, croqui: 0, table: 0 };
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

  // F4 — Tabela: numera "Tabela N — " no attr `caption` (renderizado como
  // `<caption>` pelo SicroTable). Numeração por ORDEM de aparição, igual ao
  // AutoNumbering vivo. NÃO desce nas linhas (counters de tabela aninhada
  // não fazem sentido aqui).
  //
  // EXCEÇÃO: tabelas SEM bordas (`borderStyle: "none"`) são tabelas de
  // LAYOUT (bloco de registro/timbre), não exibições numeradas — não
  // recebem número nem legenda automática.
  //
  // F4.1 — Legenda REMOVIDA (captionVisible=false, estilo Word): também não
  // numera. Em AMBOS os casos o caption é zerado no JSON numerado — cinto
  // extra pra qualquer consumidor deste JSON não vazar texto órfão. (O DOCX
  // NÃO passa por aqui: ele anda o .sicrodoc cru no Rust; a defesa
  // equivalente vive em exporters/docx.rs::render_table.) Espelha
  // SicroTableView.isNumerable.
  if (node.type === "table") {
    if (
      (node.attrs?.borderStyle as string | undefined) === "none" ||
      node.attrs?.captionVisible === false
    ) {
      return {
        ...node,
        attrs: { ...(node.attrs ?? {}), caption: "" },
      };
    }
    counters.table += 1;
    const number = counters.table;
    const existing = String(node.attrs?.caption ?? "");
    const caption = prependCaptionText(existing, `Tabela ${number} — `);
    return {
      ...node,
      attrs: { ...(node.attrs ?? {}), caption },
    };
  }

  if (!node.content) return node;
  return {
    ...node,
    content: node.content.map((child) => walk(child, counters)),
  };
}

/** Regex de prefixo já-presente (evita duplicar "Tabela 1 — Tabela 1 — …"). */
const LABEL_PREFIX_RE = /^(Figura|Croqui|Tabela|Imagem|Quadro)\s+\d+\s*—/;

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
    LABEL_PREFIX_RE.test(firstText.text)
  ) {
    return figcaption;
  }

  return {
    ...figcaption,
    content: [{ type: "text", text: prefix }, ...existing],
  };
}

/** Versão pra string pura (attr `caption` da tabela). */
function prependCaptionText(existing: string, prefix: string): string {
  if (LABEL_PREFIX_RE.test(existing)) return existing;
  return existing ? `${prefix}${existing}` : prefix.replace(/\s*—\s*$/, "");
}
