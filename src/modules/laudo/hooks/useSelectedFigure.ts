/**
 * P3 — Hook que detecta a figura atualmente selecionada no editor.
 *
 * Funciona por observação direta do estado do TipTap: a cada update,
 * verifica se `editor.state.selection` é uma NodeSelection sobre um
 * `figure`. Se sim, devolve { pos, attrs, domEl } pro overlay React
 * posicionar handles. Caso contrário, retorna null.
 *
 * Clique no figure já dispara seleção (TipTap aceita por padrão); clique
 * fora desseleciona. O overlay também escuta scroll/resize do scroll
 * container pra reposicionar.
 */

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";

export interface SelectedFigure {
  /** Posição PM do início do nó figure. */
  pos: number;
  /** Snapshot dos attrs do nó (pra renderização sem nova lookup). */
  attrs: Record<string, unknown>;
  /** Elemento DOM correspondente. Refresh quando muda. */
  domEl: HTMLElement;
}

export function useSelectedFigure(editor: Editor | null): SelectedFigure | null {
  const [selected, setSelected] = useState<SelectedFigure | null>(null);

  useEffect(() => {
    if (!editor) {
      setSelected(null);
      return undefined;
    }

    /** P19 — Defensivo: se nodeDOM falhar momentaneamente (transient state
     *  durante PM DOM update), reusa o domEl do `prev` em vez de retornar
     *  null. Sem isso, o overlay piscava (some/aparece) quando o wrap_mode
     *  mudava e PM mexia no DOM da figure. */
    const compute = (prev: SelectedFigure | null): SelectedFigure | null => {
      const sel = editor.state.selection;
      if (!(sel instanceof NodeSelection)) return null;
      const node = sel.node;
      if (node.type.name !== "figure") return null;
      // Mapeia pos PM → DOM element.
      let domEl: HTMLElement | null = null;
      try {
        const dom = editor.view.nodeDOM(sel.from);
        if (dom instanceof HTMLElement) domEl = dom;
      } catch {
        // ignore — vamos cair no fallback abaixo
      }
      // Fallback: se nodeDOM falhou mas tínhamos uma seleção anterior
      // no MESMO pos, mantemos o domEl antigo enquanto o PM termina de
      // atualizar o DOM (será refrescado no próximo transaction).
      if (!domEl && prev && prev.pos === sel.from) {
        domEl = prev.domEl;
      }
      if (!domEl) return null;
      return {
        pos: sel.from,
        attrs: { ...node.attrs },
        domEl,
      };
    };

    const update = () => {
      // Compara: mesmo pos + mesmos attrs → sem update.
      setSelected((prev) => {
        const next = compute(prev);
        if (!next && !prev) return prev;
        if (!next || !prev) return next;
        if (
          prev.pos === next.pos &&
          prev.domEl === next.domEl &&
          JSON.stringify(prev.attrs) === JSON.stringify(next.attrs)
        ) {
          return prev;
        }
        return next;
      });
    };

    // Update inicial.
    update();
    editor.on("transaction", update);
    editor.on("selectionUpdate", update);

    return () => {
      editor.off("transaction", update);
      editor.off("selectionUpdate", update);
    };
  }, [editor]);

  return selected;
}
