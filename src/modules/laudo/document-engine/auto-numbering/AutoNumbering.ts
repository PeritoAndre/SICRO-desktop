/**
 * AutoNumbering — plugin ProseMirror que numera figuras/tabelas/quesitos
 * automaticamente baseado em ordem do doc, e expõe o map IDs→ordinal
 * para o resto do app via PluginState.
 *
 * F12.1 — Cada figure (que tem `id` UUID) recebe um número visual via
 * Decoration.widget no início do figcaption: "Figura 1 — ", "Croqui 2 — ",
 * etc. Re-numeração automática quando inserir/remover/reordenar.
 *
 * F12.2 — O map `idToOrdinal` é exposto no plugin state. O node
 * `CrossReference` consulta esse map para renderizar "Figura 3" etc.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

export type NumberedKind = "image" | "croqui" | "video_frame" | "table" | "quesito";

export interface AutoNumberingState {
  /** Map de ID estável → ordinal (1, 2, 3...) por tipo. */
  idToOrdinal: Map<string, { kind: NumberedKind; ordinal: number; label: string }>;
  /** DecorationSet com widgets de numeração. */
  decorations: DecorationSet;
}

export const AUTO_NUMBERING_PLUGIN_KEY = new PluginKey<AutoNumberingState>(
  "sicroAutoNumbering",
);

/** Label visual de cada tipo. */
function labelForKind(kind: NumberedKind, ordinal: number): string {
  switch (kind) {
    case "image":
      return `Figura ${ordinal}`;
    case "croqui":
      return `Croqui ${ordinal}`;
    case "video_frame":
      return `Frame ${ordinal}`;
    case "table":
      return `Tabela ${ordinal}`;
    case "quesito":
      return `Quesito ${ordinal}`;
  }
}

export const AutoNumbering = Extension.create({
  name: "autoNumbering",

  addProseMirrorPlugins() {
    return [createAutoNumberingPlugin()];
  },
});

function createAutoNumberingPlugin(): Plugin<AutoNumberingState> {
  return new Plugin<AutoNumberingState>({
    key: AUTO_NUMBERING_PLUGIN_KEY,
    state: {
      init: (_config, state) => compute(state.doc),
      apply: (tr, old, _oldState, newState) => {
        if (!tr.docChanged) return old;
        return compute(newState.doc);
      },
    },
    props: {
      decorations(state) {
        return AUTO_NUMBERING_PLUGIN_KEY.getState(state)?.decorations;
      },
    },
  });
}

interface ProseMirrorNode {
  type: { name: string };
  attrs: Record<string, unknown>;
  content: { size: number };
  nodeSize: number;
  forEach?(callback: (child: ProseMirrorNode, offset: number, index: number) => void): void;
  descendants?(callback: (node: ProseMirrorNode, pos: number) => boolean | void): void;
}

function compute(doc: ProseMirrorNode): AutoNumberingState {
  const idToOrdinal = new Map<
    string,
    { kind: NumberedKind; ordinal: number; label: string }
  >();
  const decorations: Decoration[] = [];

  // Contadores por kind.
  const counters: Record<NumberedKind, number> = {
    image: 0,
    croqui: 0,
    video_frame: 0,
    table: 0,
    quesito: 0,
  };

  doc.descendants?.((node, pos) => {
    if (node.type.name === "figure") {
      const kind = ((node.attrs["kind"] as string) ?? "image") as NumberedKind;
      const id = node.attrs["id"] as string | undefined;
      counters[kind] += 1;
      const ordinal = counters[kind];
      const label = labelForKind(kind, ordinal);
      if (id) {
        idToOrdinal.set(id, { kind, ordinal, label });
      }
      // Widget no início do figcaption: a posição é `pos + 1` (entrando
      // no figure) + 1 (entrando no figcaption) = pos + 2.
      // Mas como esse cálculo é frágil, vamos buscar o figcaption no
      // próprio nó.
      let figcaptionPos: number | null = null;
      node.forEach?.((child, offset) => {
        if (child.type.name === "figcaption" && figcaptionPos === null) {
          figcaptionPos = pos + 1 + offset + 1; // +1 entra na figure, +1 entra na figcaption
        }
      });
      if (figcaptionPos != null) {
        decorations.push(
          Decoration.widget(
            figcaptionPos,
            () => makeLabel(label),
            {
              side: -1,
              key: `autonum-${id ?? `figure-${pos}`}-${label}`,
              ignoreSelection: true,
            },
          ),
        );
      }
      return false; // não desce pra dentro
    }

    if (node.type.name === "table") {
      // Tabelas de LAYOUT (bloco de registro/timbre, `borderStyle: "none"`)
      // e tabelas com legenda REMOVIDA (captionVisible=false, estilo Word)
      // não são exibições numeradas — não entram na contagem nem no map de
      // cross-refs (espelha numberFigures + SicroTableView).
      if (
        (node.attrs["borderStyle"] as string | undefined) === "none" ||
        node.attrs["captionVisible"] === false
      ) {
        return false;
      }
      counters.table += 1;
      const ordinal = counters.table;
      const id = node.attrs["id"] as string | undefined;
      const label = labelForKind("table", ordinal);
      if (id) {
        idToOrdinal.set(id, { kind: "table", ordinal, label });
      }
      // F4 — A numeração da tabela passou a viver DENTRO da legenda
      // ("Tabela N — …"), renderizada pelo NodeView (SicroTableView) e pelo
      // renderer (numberFigures). NÃO emitimos mais o widget acima da tabela
      // pra não duplicar o número. O `idToOrdinal` continua exposto pra
      // cross-references (F12.2) e pra lista de tabelas.
      //
      // F4.1 — Decoração de NÓ (invisível) carregando o ordinal: quando
      // remover/adicionar uma legenda renumera as IRMÃS, o nó delas não muda
      // e o ProseMirror não chamaria update() nos NodeViews — o prefixo
      // "Tabela N — " ficaria obsoleto na tela (o export já estaria certo).
      // A mudança do attr da decoração marca o nó como dirty → update() →
      // syncCaption() recalcula o prefixo.
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          "data-table-ordinal": String(ordinal),
        }),
      );
      return false; // não desce em tableRow/tableCell
    }

    if (node.type.name === "quesitoItem") {
      counters.quesito += 1;
      const ordinal = counters.quesito;
      const id = node.attrs["id"] as string | undefined;
      const label = labelForKind("quesito", ordinal);
      if (id) {
        idToOrdinal.set(id, { kind: "quesito", ordinal, label });
      }
      // O quesitoQuestion já tem ::before counter, mas mantemos no map
      // pra cross-refs.
    }

    return undefined; // continua descendo
  });

  return {
    idToOrdinal,
    decorations: DecorationSet.create(doc as never, decorations),
  };
}

function makeLabel(label: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "sicro-auto-number";
  span.textContent = `${label} — `;
  span.contentEditable = "false";
  span.setAttribute("data-auto-number", "true");
  return span;
}

/** Helper público para consumidores. */
export function getAutoNumberingMap(
  view: EditorView | null,
): Map<string, { kind: NumberedKind; ordinal: number; label: string }> | null {
  if (!view) return null;
  return AUTO_NUMBERING_PLUGIN_KEY.getState(view.state)?.idToOrdinal ?? null;
}
