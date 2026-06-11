/**
 * Testes da numeração de blocos no render (numberFigures).
 *
 * F4 — Além das figuras (prefixo "Figura N — " no figcaption), agora a
 * função também numera TABELAS, prefixando "Tabela N — " no attr `caption`.
 * Cobre numeração sequencial, idempotência (não duplica prefixo) e a
 * preservação do texto livre da legenda.
 */

import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { numberFigures } from "../numbering";

function doc(...children: JSONContent[]): JSONContent {
  return { type: "doc", content: children };
}

function table(caption?: string): JSONContent {
  return {
    type: "table",
    attrs: caption !== undefined ? { caption } : {},
    content: [
      {
        type: "tableRow",
        content: [
          { type: "tableCell", content: [{ type: "paragraph" }] },
        ],
      },
    ],
  };
}

function figure(caption: string, kind = "image"): JSONContent {
  return {
    type: "figure",
    attrs: { kind },
    content: [
      { type: "figcaption", content: [{ type: "text", text: caption }] },
    ],
  };
}

function captionOf(node: JSONContent): string {
  return String((node.attrs as { caption?: string } | undefined)?.caption ?? "");
}

describe("numberFigures — tabelas", () => {
  it("prefixa 'Tabela N — ' sequencialmente nas legendas", () => {
    const out = numberFigures(
      doc(table("Dados do local"), table("Medições")),
    );
    const tables = out.content!.filter((n) => n.type === "table");
    expect(captionOf(tables[0]!)).toBe("Tabela 1 — Dados do local");
    expect(captionOf(tables[1]!)).toBe("Tabela 2 — Medições");
  });

  it("tabela sem legenda recebe só o rótulo 'Tabela N'", () => {
    const out = numberFigures(doc(table()));
    const t = out.content!.find((n) => n.type === "table")!;
    expect(captionOf(t)).toBe("Tabela 1");
  });

  it("não duplica o prefixo se já estiver presente (idempotente)", () => {
    const out = numberFigures(doc(table("Tabela 1 — Já numerada")));
    const t = out.content!.find((n) => n.type === "table")!;
    expect(captionOf(t)).toBe("Tabela 1 — Já numerada");
  });

  it("numera figuras e tabelas com contadores independentes", () => {
    const out = numberFigures(
      doc(figure("Foto A"), table("Tab A"), figure("Foto B"), table("Tab B")),
    );
    const figs = out.content!.filter((n) => n.type === "figure");
    const tables = out.content!.filter((n) => n.type === "table");
    // Figuras: 1, 2 — o prefixo é prependido como NOVO text node, então
    // concatenamos todos os text nodes do figcaption.
    const figText = (f: JSONContent) =>
      (f.content?.[0]?.content ?? [])
        .map((t) => String(t.text ?? ""))
        .join("");
    expect(figText(figs[0]!)).toBe("Figura 1 — Foto A");
    expect(figText(figs[1]!)).toBe("Figura 2 — Foto B");
    // Tabelas: 1, 2
    expect(captionOf(tables[0]!)).toBe("Tabela 1 — Tab A");
    expect(captionOf(tables[1]!)).toBe("Tabela 2 — Tab B");
  });

  it("preserva a estrutura das linhas (não desce na tabela)", () => {
    const out = numberFigures(doc(table("X")));
    const t = out.content!.find((n) => n.type === "table")!;
    expect(t.content).toHaveLength(1);
    expect(t.content![0]!.type).toBe("tableRow");
  });

  it("ignora tabelas de layout (borderStyle 'none') na numeração", () => {
    const layout: JSONContent = {
      type: "table",
      attrs: { borderStyle: "none", caption: "" },
      content: [
        {
          type: "tableRow",
          content: [{ type: "tableCell", content: [{ type: "paragraph" }] }],
        },
      ],
    };
    const out = numberFigures(doc(layout, table("Real")));
    const tables = out.content!.filter((n) => n.type === "table");
    // A tabela de layout NÃO recebe legenda automática…
    expect(captionOf(tables[0]!)).toBe("");
    // …e a tabela real começa em 1 (não 2).
    expect(captionOf(tables[1]!)).toBe("Tabela 1 — Real");
  });
});
