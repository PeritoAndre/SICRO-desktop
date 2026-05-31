/**
 * EditorPage — folha A4 visual com paginação REAL via plugin ProseMirror.
 *
 * F7.3 — Refactor para paginação Word-like:
 *
 *   1. O plugin `Pagination` (registrado em laudoExtensions) insere
 *      `Decoration.widget` de altura `gap + marginBottom + marginTop`
 *      entre blocos que cruzam o limite de página. Esses spacers
 *      empurram o conteúdo visualmente para a "próxima página".
 *
 *   2. Aqui, renderizamos N **page cards reais** (uma `div` absoluta por
 *      página) atrás do `editorWrap`. Cada card tem 21×29.7cm de área
 *      branca com sombra própria. O gap visual entre cards é onde os
 *      spacers do plugin caem — o usuário VÊ a separação física.
 *
 *   3. O `editorWrap` é relative, com `padding` = margens efetivas. Sua
 *      altura natural acompanha o conteúdo + spacers do plugin, e os
 *      cards são posicionados nas mesmas coords (matemática verificada:
 *      `editorWrap.height === N * pageH + (N-1) * gap`).
 *
 *   4. `VerticalRuler` recebe `pageCount` e renderiza N segmentos
 *      independentes de 0–29.7 cm cada, separados pelo gap. Igual ao
 *      Word: cada página tem sua própria régua.
 *
 *   5. `pageCount` é derivado do número de `.sicro-page-spacer` no DOM
 *      do editor (via MutationObserver).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import { undoDepth } from "@tiptap/pm/history";
import { generateHTML, type JSONContent } from "@tiptap/core";
import {
  A4_PAGE,
  clampHeaderHeightCm,
  DEFAULT_HEADER_HEIGHT_CM,
  emptyHeaderContent,
  findInstitutionalTemplate,
  formatCm,
  headerExtensions,
  marginsInCm,
  resolveEffectiveMargins,
  setPaginationOptions,
  type InstitutionalTemplate,
  type SicroDoc,
  type SicroDocHeader,
  type SicroDocLayout,
  type SicroDocPageMargins,
} from "../document-engine";
import { useHeaderEditor } from "../hooks/useHeaderEditor";
import { useLaudoStore } from "../store/laudoStore";
import { PageHeaderRegion } from "./PageHeaderRegion";
// N — `brandingPaths` e `resolveHeaderField` REMOVIDOS: pertenciam ao
// pipeline do header institucional hardcoded (DocHeader). Branding/logos
// agora vivem dentro de `doc.header.content` como `image` nodes do TipTap,
// resolvidos no novo PageHeaderRegion (N7) — sem helper externo.
import type { Occurrence } from "@domain/occurrence";
import { HorizontalRuler } from "./HorizontalRuler";
import { VerticalRuler } from "./VerticalRuler";
import styles from "./EditorPage.module.css";
import "../document-engine/styles/styles.css";

// Gap visual em cm entre cards de página (a paginação do plugin
// considera este mesmo valor para dimensionar os spacers).
const PAGE_GAP_CM = 0.7;

// F11 — Para alternar para Multi-página, não usamos threshold fixo: o
// modo ativa dinamicamente quando 2+ cards no zoom atual cabem na
// largura do viewport. Constantes auxiliares para o cálculo.
const PX_PER_CM_CONST = 96 / 2.54;
// Largura mínima de gap horizontal entre cards no grid (px).
const MULTIPAGE_MIN_GAP_PX = 32;
// Padding interno do scroll container (deve bater com `.multipageScroll` CSS).
const MULTIPAGE_SCROLL_PADDING_PX = 48;

interface EditorPageProps {
  editor: Editor | null;
  doc?: SicroDoc | null;
  occurrence?: Occurrence | null;
  zoom?: number;
  mode?: "edicao" | "leitura" | "foco" | "revisao";
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  /** F11.2 — Reset zoom para um valor específico (usado por click em
   *  thumbnail no multipage para voltar a 100%). */
  onSetZoom?: (zoom: number) => void;
  onExitFoco?: () => void;
  onLayoutChange?: (patch: Partial<SicroDocLayout>) => void;
  /** N — Persistência do cabeçalho (chamado debounced quando o user
   *  edita conteúdo do header). */
  onHeaderChange?: (next: SicroDocHeader) => void;
  /** Pós-laudo S — Notifica o parent quando a instância TipTap do
   *  cabeçalho está pronta (ou volta a `null` no unmount). Usado pela
   *  LaudoEditorView pra atachar uma FigureOverlay também ao header
   *  editor, dando aos figures inseridos no cabeçalho os mesmos
   *  handles/wrap modes que existem no body. */
  onHeaderEditorReady?: (editor: Editor | null) => void;
}

export function EditorPage({
  editor,
  doc,
  occurrence,
  zoom = 1,
  mode = "edicao",
  onZoomIn,
  onZoomOut,
  onSetZoom,
  onExitFoco,
  onLayoutChange,
  onHeaderChange,
  onHeaderEditorReady,
}: EditorPageProps) {
  const template = doc
    ? findInstitutionalTemplate(doc.layout?.institutional_template)
    : null;
  const margins = marginsInCm(resolveEffectiveMargins(doc ?? null, template));

  const orientation: "portrait" | "landscape" =
    doc?.layout?.orientation === "landscape" ? "landscape" : "portrait";
  const isLandscape = orientation === "landscape";
  const pageWidthCm = isLandscape ? A4_PAGE.heightCm : A4_PAGE.widthCm;
  const pageHeightCm = isLandscape ? A4_PAGE.widthCm : A4_PAGE.heightCm;

  // N — Header Word-style: estado + instância TipTap separada.
  // O header vive DENTRO da margem superior (igual ao Word). Por
  // isso a altura efetiva do header é clampada para `margins.top`,
  // evitando que o conteúdo do cabeçalho invada o corpo. A paginação
  // não muda — continua usando marginTopCm para o spacer inicial.
  const editingRegion = useLaudoStore((s) => s.editingRegion);
  const setEditingRegion = useLaudoStore((s) => s.setEditingRegion);
  const headerEnabled = doc?.header?.enabled ?? false;
  const headerContent: JSONContent = useMemo(
    () => doc?.header?.content ?? emptyHeaderContent(),
    [doc?.header?.content],
  );
  const headerHeightRaw = doc?.layout?.header_height_cm ?? DEFAULT_HEADER_HEIGHT_CM;
  // N17 — Limite prático de altura do header pra interação. Mantém o
  // schema MAX de 10cm como hard ceiling, mas o usuário só consegue
  // arrastar até 10cm via UI. Quando ultrapassa `margins.top`, o callback
  // de change auto-expande a margem superior também (modelo Word: o
  // body sempre fica abaixo do header).
  // Pós-laudo S — subido de 5 → 10cm pra cabeçalhos institucionais maiores.
  const HEADER_UI_MAX_CM = 10;
  const headerHeightCm = clampHeaderHeightCm(headerHeightRaw);

  // Instância TipTap dedicada ao header — editable só quando o modo
  // ativo for "header".
  const headerEditor = useHeaderEditor({
    initialContent: headerContent,
    editable: editingRegion === "header" && headerEnabled,
    onContentChange: useCallback(
      (next: JSONContent) => {
        if (!onHeaderChange) return;
        onHeaderChange({
          enabled: headerEnabled,
          content: next,
        });
      },
      [onHeaderChange, headerEnabled],
    ),
  });

  // Pós-laudo S — Notifica o parent (LaudoEditorView) sempre que a
  // referência da instância do header editor muda. Permite que o parent
  // atache uma FigureOverlay também a esse editor.
  useEffect(() => {
    onHeaderEditorReady?.(headerEditor);
    return () => onHeaderEditorReady?.(null);
  }, [headerEditor, onHeaderEditorReady]);

  // HTML estático do header — usado pelos clones visuais em todas as
  // pageCards que não hospedam o editor real (pgs 2+ em modo header,
  // todas em modo body). Recomputado a cada mudança do conteúdo do
  // header para refletir edições em tempo real.
  const headerHtml = useMemo(() => {
    try {
      return generateHTML(headerContent, headerExtensions());
    } catch {
      return "";
    }
  }, [headerContent]);

  // Ativa header (liga enabled se necessário + entra em modo edição).
  const activateHeader = useCallback(() => {
    if (!headerEnabled && onHeaderChange) {
      onHeaderChange({
        enabled: true,
        content: headerContent,
      });
    }
    setEditingRegion("header");
  }, [headerEnabled, headerContent, onHeaderChange, setEditingRegion]);

  // Volta para modo body — chamado pelo botão "✕" (N16) ou Esc.
  const deactivateHeader = useCallback(() => {
    setEditingRegion("body");
  }, [setEditingRegion]);

  // N16 — Desativa o cabeçalho (enabled=false) E sai do modo edição.
  // O conteúdo é preservado em doc.header.content; só a flag liga/desliga.
  const disableHeader = useCallback(() => {
    if (!onHeaderChange) return;
    onHeaderChange({
      enabled: false,
      content: headerContent,
    });
    setEditingRegion("body");
  }, [onHeaderChange, headerContent, setEditingRegion]);

  // Esc dentro do header editor → volta pro body.
  useEffect(() => {
    if (editingRegion !== "header") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        deactivateHeader();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editingRegion, deactivateHeader]);

  // N17 — Duplo clique FORA da área do cabeçalho (em modo header)
  // fecha o modo de edição. Conveniente quando o user quer voltar ao
  // body sem precisar achar o botão "✕". Detecção: walk no DOM
  // procurando algum ancestor com `data-page-index` (= PageHeaderRegion).
  // Se não encontrar, está fora — fecha.
  useEffect(() => {
    if (editingRegion !== "header") return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      let el: Node | null = target;
      while (el) {
        if (el instanceof HTMLElement) {
          // Está dentro de uma PageHeaderRegion → não fecha.
          if (el.dataset.pageIndex !== undefined) return;
          // Está dentro do badge azul (que está dentro do region, mas
          // pode propagar via stopPropagation): igual seguro.
        }
        el = el.parentNode;
      }
      deactivateHeader();
    };
    // Usa capture phase pra rodar antes do dblclick do componente
    // (que ativa o header em modo body — não dispara em modo header
    // porque `onDoubleClick` só é aplicado quando !isEditing).
    document.addEventListener("dblclick", handler, true);
    return () =>
      document.removeEventListener("dblclick", handler, true);
  }, [editingRegion, deactivateHeader]);

  // F3/F9 — Editor read-only quando status final OR mode === leitura.
  useEffect(() => {
    if (!editor) return;
    const lockedByFinal = doc?.status === "final";
    editor.setEditable(!lockedByFinal && mode !== "leitura");
  }, [editor, mode, doc?.status]);

  // F7.5 — Paginação REATIVA. Sempre que margens / orientação mudam, o
  // plugin recalcula spacers com os novos valores e o conteúdo se
  // reorganiza automaticamente (igual ao Word). O `setPaginationOptions`
  // dispatch um setMeta, plugin atualiza opts no state, view.update
  // dispara recompute.
  useEffect(() => {
    if (!editor) return;
    setPaginationOptions(editor.view, {
      pageHeightCm,
      marginTopCm: margins.top,
      marginBottomCm: margins.bottom,
      gapCm: PAGE_GAP_CM,
    });
  }, [editor, margins.top, margins.bottom, pageHeightCm]);

  // M8 — HISTÓRICO UNIFICADO TEXTO+MARGEM PARA Ctrl+Z/Ctrl+Y.
  //
  // O editor TipTap mantém seu próprio histórico (prosemirror-history) só
  // pra mudanças no doc (texto, formato, blocos). Mudanças de margem
  // (via drag da régua) atualizam `doc.layout.page.margins` mas isso vai
  // pela camada do store, NÃO pelo histórico do TipTap. Resultado: Ctrl+Z
  // não desfazia mudança de margem.
  //
  // Solução: mantenho uma fila unificada de eventos em ordem cronológica:
  //   { type: "text" }          — corresponde a 1 step de undo do TipTap
  //   { type: "margin", prev, next } — captura snapshot pra desfazer
  //
  // Sincronia com TipTap: monitoro `undoDepth(view.state)`. Quando aumenta
  // (e não veio do nosso próprio undo/redo), empilho um evento "text" —
  // assim minha fila tem exatamente 1 entrada por step do TipTap.
  //
  // Ctrl+Z: pop do topo. Se "text", chamo `editor.commands.undo()` (que
  // executa o undo do step correspondente no TipTap). Se "margin", aplico
  // `prev` via `onLayoutChange`. Em ambos os casos empilho no redoStack.
  // Ctrl+Y / Ctrl+Shift+Z: simétrico.
  //
  // Capture-phase no document: intercepto o keydown ANTES do TipTap,
  // restringindo ao container do editor (não dispara em outros inputs).
  type UnifiedEvent =
    | { type: "text" }
    | { type: "margin"; prev: SicroDocPageMargins; next: SicroDocPageMargins };

  const unifiedHistoryRef = useRef<UnifiedEvent[]>([]);
  const redoHistoryRef = useRef<UnifiedEvent[]>([]);
  const isInternalUndoRef = useRef(false);
  const prevUndoDepthRef = useRef(0);

  // Subscribe ao editor: cada vez que undoDepth aumenta, é porque o
  // TipTap criou um novo step de history. Empilho "text" — exceto se a
  // transação veio do meu próprio undo/redo (isInternalUndoRef).
  useEffect(() => {
    if (!editor) return;
    prevUndoDepthRef.current = undoDepth(editor.view.state);
    const handler = () => {
      const newDepth = undoDepth(editor.view.state);
      if (newDepth > prevUndoDepthRef.current && !isInternalUndoRef.current) {
        unifiedHistoryRef.current.push({ type: "text" });
        redoHistoryRef.current = [];
      }
      prevUndoDepthRef.current = newDepth;
    };
    editor.on("transaction", handler);
    return () => {
      editor.off("transaction", handler);
    };
  }, [editor]);

  // Aplica o evento no topo da pilha de undo.
  const applyUnifiedUndo = useCallback((): boolean => {
    while (unifiedHistoryRef.current.length > 0) {
      const event = unifiedHistoryRef.current.pop()!;
      if (event.type === "text") {
        if (!editor) {
          redoHistoryRef.current.push(event);
          return true;
        }
        isInternalUndoRef.current = true;
        const ok = editor.commands.undo();
        isInternalUndoRef.current = false;
        if (ok) {
          redoHistoryRef.current.push(event);
          return true;
        }
        // TipTap não pôde desfazer (provavelmente história colapsada).
        // Descarta esse evento e tenta o próximo.
        continue;
      } else {
        // margin
        isInternalUndoRef.current = true;
        onLayoutChange?.({ page: { margins: event.prev } });
        isInternalUndoRef.current = false;
        redoHistoryRef.current.push(event);
        return true;
      }
    }
    return false;
  }, [editor, onLayoutChange]);

  const applyUnifiedRedo = useCallback((): boolean => {
    while (redoHistoryRef.current.length > 0) {
      const event = redoHistoryRef.current.pop()!;
      if (event.type === "text") {
        if (!editor) {
          unifiedHistoryRef.current.push(event);
          return true;
        }
        isInternalUndoRef.current = true;
        const ok = editor.commands.redo();
        isInternalUndoRef.current = false;
        if (ok) {
          unifiedHistoryRef.current.push(event);
          return true;
        }
        continue;
      } else {
        isInternalUndoRef.current = true;
        onLayoutChange?.({ page: { margins: event.next } });
        isInternalUndoRef.current = false;
        unifiedHistoryRef.current.push(event);
        return true;
      }
    }
    return false;
  }, [editor, onLayoutChange]);

  // Keydown global capture-phase, escopado ao container do editor.
  // Atalhos: Ctrl+Z (undo), Ctrl+Y / Ctrl+Shift+Z (redo).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const root = scrollRef.current;
      if (!root) return;
      const target = e.target as Node | null;
      if (!target || (!root.contains(target) && root !== target)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        if (unifiedHistoryRef.current.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        applyUnifiedUndo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        if (redoHistoryRef.current.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        applyUnifiedRedo();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => {
      document.removeEventListener("keydown", handler, true);
    };
  }, [applyUnifiedUndo, applyUnifiedRedo]);

  // F7.3 — pageCount é derivado do número de page-spacers no DOM do editor.
  // O plugin de paginação insere/remove esses spacers conforme o conteúdo;
  // MutationObserver observa mudanças nos children top-level do view.dom.
  const [pageCount, setPageCount] = useState(1);
  useEffect(() => {
    if (!editor) return undefined;
    const dom = editor.view.dom;
    const recount = () => {
      const spacers = dom.querySelectorAll(".sicro-page-spacer").length;
      setPageCount((prev) => (prev === spacers + 1 ? prev : spacers + 1));
    };
    recount();
    const mo = new MutationObserver(recount);
    mo.observe(dom, { childList: true, subtree: false });
    // Backup: o plugin reage a ResizeObserver, então 'update' do editor
    // dispara pouco antes do MutationObserver. Garantimos via 'update'
    // também (no-op quando count não mudou).
    const onUpdate = () => requestAnimationFrame(recount);
    editor.on("update", onUpdate);
    return () => {
      mo.disconnect();
      editor.off("update", onUpdate);
    };
  }, [editor]);

  // N — `brandingPaths()` REMOVIDO. Logos/imagens do cabeçalho passarão a
  // viver como ImageNodes dentro de `doc.header.content` (N7), resolvidas
  // pelo mesmo pipeline de imagens do body.

  // N — `occurrence` prop preservada na assinatura pública porque a
  // migração de docs legados (N12) precisa dela para resolver os campos
  // do `institutional_template` (ex: "occurrence.numero_bo") na primeira
  // abertura. Marcamos como usada para o linter — N12 a consumirá.
  void occurrence;

  // F3 — Zoom aplicado via transform scale.
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const workspaceStyle: React.CSSProperties = {
    transform: safeZoom === 1 ? undefined : `scale(${safeZoom})`,
    transformOrigin: "top center",
  };

  // F11.2 — Callback ref unificado para o scroll container. Reattacha
  // wheel listener (Ctrl+scroll zoom) E ResizeObserver (auto-fit
  // multipage) cada vez que o div muda — necessário porque EditorPage
  // alterna entre single-page e multipage view (refs apontam para divs
  // diferentes). Antes usávamos useEffect com deps [] que capturava o
  // div ORIGINAL no closure e perdia o reference quando o div atual
  // mudava.
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const onZoomInRef = useRef(onZoomIn);
  const onZoomOutRef = useRef(onZoomOut);
  onZoomInRef.current = onZoomIn;
  onZoomOutRef.current = onZoomOut;

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const zin = onZoomInRef.current;
    const zout = onZoomOutRef.current;
    if (!zin && !zout) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.deltaY > 0) zout?.();
    else if (e.deltaY < 0) zin?.();
  }, []);

  const cleanupRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollRefCallback = useCallback(
    (el: HTMLDivElement | null) => {
      // Cleanup do div anterior.
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      scrollRef.current = el;
      if (!el) {
        setViewportWidth(0);
        return;
      }
      el.addEventListener("wheel", handleWheel, { passive: false });
      const ro = new ResizeObserver(() => {
        setViewportWidth(el.clientWidth);
        setViewportHeight(el.clientHeight);
      });
      ro.observe(el);
      setViewportWidth(el.clientWidth);
      setViewportHeight(el.clientHeight);
      cleanupRef.current = () => {
        el.removeEventListener("wheel", handleWheel);
        ro.disconnect();
      };
    },
    [handleWheel],
  );

  // F7.1 — Drag de margem via régua. Regrava o objeto margins completo.
  // M6 — HARDCAP: margens individualmente clampadas 0..8cm (como sempre),
  //       MAIS validação CONJUNTA pra garantir área útil mínima.
  //       Antes era possível combinar margens que esmagavam a área útil
  //       quase a zero — visualmente caótico e podia confundir paginação.
  //       Agora exigimos:
  //         top + bottom <= pageHeight - MIN_USABLE_CM
  //         left + right <= pageWidth  - MIN_USABLE_CM
  //       Se o user arrastar e violar, o lado MUDADO recua para deixar
  //       MIN_USABLE_CM de área útil.
  const MIN_USABLE_CM = 5;
  const handleMarginChange = (
    which: "left" | "right" | "top" | "bottom",
    valueCm: number,
  ) => {
    if (!onLayoutChange) return;
    const individuallyClamped = Math.max(0, Math.min(8, valueCm));

    // Coleta o estado projetado (com a alteração pendente).
    let nextTop = which === "top" ? individuallyClamped : margins.top;
    let nextRight =
      which === "right" ? individuallyClamped : margins.right;
    let nextBottom =
      which === "bottom" ? individuallyClamped : margins.bottom;
    let nextLeft = which === "left" ? individuallyClamped : margins.left;

    // Hardcap conjunto vertical (top + bottom).
    const maxVerticalSum = pageHeightCm - MIN_USABLE_CM;
    if (nextTop + nextBottom > maxVerticalSum) {
      // Recua o lado QUE ESTÁ MUDANDO, mantendo o outro estável.
      if (which === "top") {
        nextTop = Math.max(0, maxVerticalSum - nextBottom);
      } else if (which === "bottom") {
        nextBottom = Math.max(0, maxVerticalSum - nextTop);
      }
    }

    // Hardcap conjunto horizontal (left + right).
    const maxHorizontalSum = pageWidthCm - MIN_USABLE_CM;
    if (nextLeft + nextRight > maxHorizontalSum) {
      if (which === "left") {
        nextLeft = Math.max(0, maxHorizontalSum - nextRight);
      } else if (which === "right") {
        nextRight = Math.max(0, maxHorizontalSum - nextLeft);
      }
    }

    const newMargins: SicroDocPageMargins = {
      top: formatCm(nextTop),
      right: formatCm(nextRight),
      bottom: formatCm(nextBottom),
      left: formatCm(nextLeft),
    };
    const oldMargins: SicroDocPageMargins = {
      top: formatCm(margins.top),
      right: formatCm(margins.right),
      bottom: formatCm(margins.bottom),
      left: formatCm(margins.left),
    };

    // M8 — Empilha evento no histórico unificado se realmente mudou.
    // Sem isso o Ctrl+Z não vê a mudança de margem. Só pula quando o
    // resultado é idêntico ao estado atual (no-op).
    if (
      !isInternalUndoRef.current &&
      (oldMargins.top !== newMargins.top ||
        oldMargins.right !== newMargins.right ||
        oldMargins.bottom !== newMargins.bottom ||
        oldMargins.left !== newMargins.left)
    ) {
      unifiedHistoryRef.current.push({
        type: "margin",
        prev: oldMargins,
        next: newMargins,
      });
      redoHistoryRef.current = [];
    }

    onLayoutChange({
      page: { margins: newMargins },
    });
  };

  // F7.6 — Margens TOP e BOTTOM agora vêm dos SPACERS do plugin de
  // paginação (uniformiza pg1 e pg2+). Padding-top/bottom no editorWrap
  // = 0. Apenas padding LEFT/RIGHT continua aqui (não há quebra
  // horizontal). MinHeight mantém pelo menos 1 página A4 visível mesmo
  // com pouco conteúdo.
  const editorWrapStyle: React.CSSProperties = {
    paddingTop: 0,
    paddingRight: `${margins.right}cm`,
    paddingBottom: 0,
    paddingLeft: `${margins.left}cm`,
    minHeight: `${pageHeightCm}cm`,
  };

  // F11 — Modo Multi-página: ativa dinamicamente quando o zoom atual
  // produz cards que (1) cabem 2+ lado a lado na largura E (2) cabem
  // na altura da viewport com sobra pra régua/hint, E (3) o zoom é
  // <= 100% (estilo Word: zoom in sempre single-page, zoom out
  // pode virar grid).
  const cardWidthPx = pageWidthCm * PX_PER_CM_CONST * safeZoom;
  const cardHeightPx = pageHeightCm * PX_PER_CM_CONST * safeZoom;
  // Reserva ~120px verticais para HorizontalRuler + hint + paddings.
  const MULTIPAGE_VERTICAL_CHROME_PX = 120;

  // R — Recuo da primeira linha do parágrafo atual (rastreia o cursor).
  // Atualiza via selectionUpdate; alimenta o handle azul superior da
  // HorizontalRuler. Callback dispatcha setFirstLineIndent na seleção.
  const [currentIndent, setCurrentIndent] = useState(0);
  useEffect(() => {
    if (!editor) return undefined;
    const update = () => {
      const { $from } = editor.state.selection;
      // Sobe na árvore até achar paragraph/heading.
      for (let d = $from.depth; d >= 0; d--) {
        const node = $from.node(d);
        if (node.type.name === "paragraph" || node.type.name === "heading") {
          const v = Number(node.attrs.first_line_indent_cm) || 0;
          setCurrentIndent(v);
          return;
        }
      }
      setCurrentIndent(0);
    };
    update();
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);
  const onIndentChange = onLayoutChange
    ? (cm: number) => {
        if (!editor) return;
        editor.commands.setFirstLineIndent(cm);
      }
    : undefined;
  const isMultipageView =
    viewportWidth > 0 &&
    viewportHeight > 0 &&
    safeZoom <= 1.0 &&
    cardWidthPx * 2 + MULTIPAGE_MIN_GAP_PX + MULTIPAGE_SCROLL_PADDING_PX * 2 <=
      viewportWidth &&
    cardHeightPx + MULTIPAGE_VERTICAL_CHROME_PX <= viewportHeight;

  // F11.3 — Quando o user clica numa thumbnail do multipage, queremos
  // voltar pra single-page COM scroll para essa página. Como a transição
  // troca o div do scroll container, o scrollTo precisa rodar DEPOIS
  // que o single-page monta. Usamos uma ref pra agendar o target.
  const pendingScrollPageRef = useRef<number | null>(null);
  useEffect(() => {
    if (isMultipageView) return;
    const target = pendingScrollPageRef.current;
    if (target === null) return;
    const el = scrollRef.current;
    if (!el) return;
    // Aguarda 1 frame pra layout assentar com zoom 1.0.
    const raf = requestAnimationFrame(() => {
      const targetPx =
        target * (pageHeightCm + PAGE_GAP_CM) * PX_PER_CM_CONST;
      el.scrollTop = targetPx;
      pendingScrollPageRef.current = null;
    });
    return () => cancelAnimationFrame(raf);
  }, [isMultipageView, pageHeightCm]);

  const handleClickThumb = useCallback(
    (pageIndex: number) => {
      pendingScrollPageRef.current = pageIndex;
      onSetZoom?.(1.0);
    },
    [onSetZoom],
  );

  if (isMultipageView) {
    return (
      <MultipageView
        setScrollRef={scrollRefCallback}
        editor={editor}
        pageCount={pageCount}
        pageWidthCm={pageWidthCm}
        pageHeightCm={pageHeightCm}
        pageGapCm={PAGE_GAP_CM}
        marginTopCm={margins.top}
        marginBottomCm={margins.bottom}
        marginLeftCm={margins.left}
        marginRightCm={margins.right}
        zoom={safeZoom}
        mode={mode}
        onExitFoco={onExitFoco}
        onClickThumb={handleClickThumb}
        finalBanner={doc?.status === "final"}
      />
    );
  }

  return (
    <div
      ref={scrollRefCallback}
      className={`${styles.scroll} ${mode === "foco" ? styles.focoMode : ""} ${
        mode === "leitura" ? styles.leituraMode : ""
      }`}
    >
      {mode === "foco" && onExitFoco && (
        <button
          type="button"
          className={styles.exitFocoBtn}
          onClick={onExitFoco}
          title="Sair do Foco (Esc)"
          aria-label="Sair do modo foco"
        >
          Sair do Foco · Esc
        </button>
      )}
      {doc?.status === "final" && (
        <div className={styles.finalBanner} aria-hidden>
          LAUDO FINAL · SOMENTE LEITURA · SELO SHA-256
        </div>
      )}
      {/* N16 — HeaderToolbar removida. Os controles que antes viviam nela
          (altura, desativar, fechar) agora ficam INLINE dentro do
          badge azul da PageHeaderRegion na pg 1, e a altura é
          ajustada arrastando a borda inferior azul como uma régua. */}
      <div className={styles.workspace} style={workspaceStyle}>
        {/* M — Régua horizontal global REMOVIDA. Agora cada pageCard
            tem sua própria régua grudada no topo (ver mais abaixo no
            pageStack). Spacer no topo do workspace garante que a
            primeira régua per-página não fica colada na toolbar. */}
        <div className={styles.topSpacer} aria-hidden />

        {/* Middle row: vertical ruler (N segments) + page stack */}
        <div className={styles.midRow}>
          <VerticalRuler
            pageHeightCm={pageHeightCm}
            pageCount={pageCount}
            pageGapCm={PAGE_GAP_CM}
            topMarginCm={margins.top}
            bottomMarginCm={margins.bottom}
            onTopMarginChange={
              onLayoutChange
                ? (v) => handleMarginChange("top", v)
                : undefined
            }
            onBottomMarginChange={
              onLayoutChange
                ? (v) => handleMarginChange("bottom", v)
                : undefined
            }
          />

          {/* F7.3 — Page stack: relative, sem altura fixa. Cards atrás
              do editorWrap. Editorwrap relative no z-index 1. */}
          <div
            className={styles.pageStack}
            style={{ width: `${pageWidthCm}cm` }}
          >
            {/* Background page cards — N cards absolute, atrás de tudo */}
            {Array.from({ length: pageCount }).map((_, i) => (
              <div
                key={i}
                className={styles.pageCard}
                style={{
                  top: `${i * (pageHeightCm + PAGE_GAP_CM)}cm`,
                  height: `${pageHeightCm}cm`,
                  width: `${pageWidthCm}cm`,
                }}
                aria-hidden
              >
                <div className={styles.pageNumber}>{i + 1}</div>
              </div>
            ))}

            {/* M — Régua horizontal POR PÁGINA. Aparece grudada na borda
                superior de cada pageCard (top do card menos a altura da
                régua). Handles draggables compartilham as mesmas margens
                globais — qualquer régua dispara onLeft/RightMarginChange.
                A primeira página é tratada igual às outras: o ruler do
                topRow original continua existindo lá fora (sticky) como
                referência fixa quando o user rola. */}
            {Array.from({ length: pageCount }).map((_, i) => (
              <div
                key={`ruler-${i}`}
                className={styles.perPageRuler}
                style={{
                  top: `${i * (pageHeightCm + PAGE_GAP_CM)}cm`,
                  width: `${pageWidthCm}cm`,
                }}
              >
                <HorizontalRuler
                  widthCm={pageWidthCm}
                  leftMarginCm={margins.left}
                  rightMarginCm={margins.right}
                  onLeftMarginChange={
                    onLayoutChange
                      ? (v) => handleMarginChange("left", v)
                      : undefined
                  }
                  onRightMarginChange={
                    onLayoutChange
                      ? (v) => handleMarginChange("right", v)
                      : undefined
                  }
                  firstLineIndentCm={currentIndent}
                  onFirstLineIndentChange={onIndentChange}
                />
              </div>
            ))}

            {/* N — Cabeçalho Word-style: uma PageHeaderRegion absoluta
                por pageCard. A primeira página hospeda o EditorContent
                interativo quando em modo edição; as demais mostram um
                clone visual estático (HTML pré-renderizado) que atualiza
                em tempo real. Double-click ativa o modo de edição. */}
            {Array.from({ length: pageCount }).map((_, i) => (
              <PageHeaderRegion
                key={`header-${i}`}
                pageIndex={i}
                isEditing={editingRegion === "header"}
                enabled={headerEnabled}
                editor={headerEditor}
                headerHtml={headerHtml}
                topCm={i * (pageHeightCm + PAGE_GAP_CM)}
                widthCm={pageWidthCm}
                headerHeightCm={headerHeightCm}
                paddingLeftCm={margins.left}
                paddingRightCm={margins.right}
                paddingTopCm={0}
                onActivate={activateHeader}
                onHeightChange={(cm) => {
                  if (!onLayoutChange) return;
                  // N17 — Auto-acoplamento margin.top ↔ header_height_cm.
                  // Versão simétrica (pós-laudo T):
                  //   - Header CRESCE além da margem → margin cresce junto
                  //     (igual antes, "modelo Word").
                  //   - Header ENCOLHE com margin sincronizada → margin
                  //     encolhe junto. Antes só crescia, então uma vez que
                  //     o user expandia pra 10cm não conseguia mais voltar
                  //     o body pra cima (a linha demarcadora ia, mas a
                  //     margem ficava grudada no max já atingido).
                  //   - Header ENCOLHE com margin manual MAIOR (gap
                  //     deliberado) → margin é PRESERVADA. O user manteve
                  //     um gap entre header e body via Inspector → respeita.
                  //
                  // "Sincronizada" = margins.top ≈ headerHeightCm atual.
                  const wasSynced =
                    Math.abs(margins.top - headerHeightCm) < 0.01;
                  const shouldSyncMargin =
                    cm > margins.top + 0.005 || wasSynced;
                  if (shouldSyncMargin) {
                    onLayoutChange({
                      header_height_cm: cm,
                      page: {
                        margins: {
                          top: formatCm(cm),
                          right: formatCm(margins.right),
                          bottom: formatCm(margins.bottom),
                          left: formatCm(margins.left),
                        },
                      },
                    });
                  } else {
                    onLayoutChange({ header_height_cm: cm });
                  }
                }}
                maxAllowedHeightCm={HEADER_UI_MAX_CM}
                onClose={deactivateHeader}
                onDisable={disableHeader}
              />
            ))}

            {/* N18 — Side mark vertical "POLÍCIA CIENTÍFICA DO ESTADO
                DO AMAPÁ" REMOVIDO. Aquela info agora vai ser inserida
                no cabeçalho dinâmico pelo próprio usuário. O campo
                `template.side_mark` continua existindo na config dos
                templates institucionais (preservado para
                retrocompatibilidade) mas não é mais renderizado. */}

            {/* N — Header hardcoded REMOVIDO. A região de cabeçalho agora
                é construída a partir de `doc.header` (ProseMirror separado)
                e renderizada por `PageHeaderRegion` em cada pageCard (N7).
                Este bloco será reintroduzido em N7 com semântica nova. */}

            {/* Editor — relative, on top of cards. N17 — quando o modo
                ativo é "header", o body fica visualmente esmaecido
                (texto cinza claro) pra deixar claro qual região está
                sob edição. */}
            <div
              className={`${styles.editorWrap} ${
                editingRegion === "header" ? styles.editorWrapDimmed : ""
              }`}
              style={editorWrapStyle}
            >
              <EditorContent editor={editor} />
            </div>

            {/* Footer — anchored to bottom of last card */}
            {template && (
              <DocFooter
                template={template}
                pageCount={pageCount}
                pageHeightCm={pageHeightCm}
                pageGapCm={PAGE_GAP_CM}
                bottomCm={Math.max(0.6, margins.bottom - 1.6)}
                leftCm={margins.left}
                rightCm={margins.right}
              />
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

// N — `DocHeader` (institutional hardcoded header) e `DocHeaderProps` foram
// REMOVIDOS. O cabeçalho agora vive em `doc.header.content` (ProseMirror
// separado do body) e é renderizado por `PageHeaderRegion` (N7) replicado
// em cada pageCard. A região é editável via instância TipTap dedicada (N6)
// quando `editingRegion === "header"` (N5). A migração de docs legados que
// dependiam de `institutional_template` acontece em N12.

function DocFooter({
  template,
  pageCount,
  pageHeightCm,
  pageGapCm,
  bottomCm,
  leftCm,
  rightCm,
}: {
  template: InstitutionalTemplate;
  pageCount: number;
  pageHeightCm: number;
  pageGapCm: number;
  bottomCm: number;
  leftCm: number;
  rightCm: number;
}) {
  // Footer ancora no topo da última página + (pageH - bottomCm)
  const lastCardTopCm = (pageCount - 1) * (pageHeightCm + pageGapCm);
  const footerTopCm = lastCardTopCm + pageHeightCm - bottomCm;
  return (
    <footer
      className={styles.docFooter}
      contentEditable={false}
      style={{
        top: `${footerTopCm}cm`,
        left: `${leftCm}cm`,
        right: `${rightCm}cm`,
      }}
    >
      <span>{template.footer.text}</span>
      <span>
        {pageCount === 1
          ? "Folha 1"
          : `Folha ${pageCount} de ${pageCount}`}
      </span>
    </footer>
  );
}

/**
 * F11 — MultipageView: layout grid lado a lado para zoom out (estilo
 * Word "Várias páginas").
 *
 * Cada página é renderizada como um card 21×29.7cm escalado por `zoom`,
 * dispostos em flex-wrap. Para cada thumbnail clonamos o
 * `editor.view.dom` (que já contém os spacers do plugin de paginação) e
 * deslocamos via `translateY(-i * (pageH + gap))` para mostrar a página
 * correta.
 *
 * Vantagens:
 *   - Reutiliza o conteúdo paginado pelo plugin (não precisa re-paginar).
 *   - Mantém estilo (fonts, headings, marks) idêntico ao editor real.
 *   - Atualiza ao vivo quando o editor muda (escuta evento `update`).
 *
 * Trade-offs:
 *   - Edição direta nos thumbnails NÃO é suportada (são clones do DOM,
 *     não o editor real). Para editar, suba o zoom > 50%.
 *   - Header/footer institucionais não aparecem nos thumbnails (eles
 *     vivem no pageStack, fora do editor.view.dom).
 */
function MultipageView({
  setScrollRef,
  editor,
  pageCount,
  pageWidthCm,
  pageHeightCm,
  pageGapCm,
  marginTopCm,
  marginBottomCm,
  marginLeftCm,
  marginRightCm,
  zoom,
  mode,
  onExitFoco,
  onClickThumb,
  finalBanner,
}: {
  setScrollRef: (el: HTMLDivElement | null) => void;
  editor: Editor | null;
  pageCount: number;
  pageWidthCm: number;
  pageHeightCm: number;
  pageGapCm: number;
  marginTopCm: number;
  marginBottomCm: number;
  marginLeftCm: number;
  marginRightCm: number;
  zoom: number;
  mode: "edicao" | "leitura" | "foco" | "revisao";
  onExitFoco?: () => void;
  onClickThumb?: (pageIndex: number) => void;
  finalBanner: boolean;
}) {
  const containersRef = useRef<Array<HTMLDivElement | null>>([]);

  // Atualiza os clones quando o editor muda ou pageCount muda.
  useEffect(() => {
    if (!editor) return undefined;
    const srcDom = editor.view.dom;

    const refresh = () => {
      containersRef.current.forEach((container) => {
        if (!container) return;
        // Remove clones antigos.
        container.innerHTML = "";
        // Clona o view.dom inteiro (com spacers do plugin já aplicados).
        const clone = srcDom.cloneNode(true) as HTMLElement;
        clone.removeAttribute("contenteditable");
        clone.removeAttribute("spellcheck");
        clone.style.userSelect = "none";
        clone.style.pointerEvents = "none";
        container.appendChild(clone);
      });
    };

    refresh();
    const onUpdate = () => requestAnimationFrame(refresh);
    editor.on("update", onUpdate);
    // Re-clone quando pageCount muda (containers podem ter sido criados/destruídos).
    return () => {
      editor.off("update", onUpdate);
    };
  }, [editor, pageCount]);

  return (
    <div
      ref={setScrollRef}
      className={`${styles.scroll} ${styles.multipageScroll} ${
        mode === "foco" ? styles.focoMode : ""
      } ${mode === "leitura" ? styles.leituraMode : ""}`}
    >
      {mode === "foco" && onExitFoco && (
        <button
          type="button"
          className={styles.exitFocoBtn}
          onClick={onExitFoco}
          title="Sair do Foco (Esc)"
        >
          Sair do Foco · Esc
        </button>
      )}
      {finalBanner && (
        <div className={styles.finalBanner} aria-hidden>
          LAUDO FINAL · SOMENTE LEITURA · SELO SHA-256
        </div>
      )}
      {/* F11.4 — Réguas e botão "Voltar para edição" removidos:
          multipage é só visualização (click numa thumb edita).
          Hint discreto apenas indicando como editar. */}
      <div className={styles.multipageHint}>
        {pageCount} página{pageCount === 1 ? "" : "s"} · clique em uma para editar
      </div>
      <div className={styles.multipageMidRow}>
        <div className={styles.multipageGrid}>
        {Array.from({ length: pageCount }).map((_, i) => {
          // Offset CM a aplicar no clone para mostrar a página i.
          const offsetCm = i * (pageHeightCm + pageGapCm);
          // Card dimensions in CSS px após zoom (transform: scale).
          const cardWidthScaled = `${pageWidthCm * zoom}cm`;
          const cardHeightScaled = `${pageHeightCm * zoom}cm`;
          return (
            <div
              key={i}
              className={styles.thumbCard}
              style={{
                width: cardWidthScaled,
                height: cardHeightScaled,
              }}
              title={`Página ${i + 1} de ${pageCount} — clique para editar`}
              onClick={() => onClickThumb?.(i)}
              role="button"
              tabIndex={0}
            >
              <div
                className={styles.thumbInner}
                style={{
                  width: `${pageWidthCm}cm`,
                  height: `${pageHeightCm}cm`,
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left",
                }}
              >
                {/* F11.1 — Padding LEFT/RIGHT no container do clone
                    aplica as margens horizontais. As margens TOP/BOTTOM
                    vêm dos spacers do plugin já embutidos no clone. */}
                <div
                  className={styles.thumbCloneContainer}
                  style={{
                    position: "absolute",
                    top: `-${offsetCm}cm`,
                    left: 0,
                    right: 0,
                    paddingLeft: `${marginLeftCm}cm`,
                    paddingRight: `${marginRightCm}cm`,
                  }}
                  ref={(el) => {
                    containersRef.current[i] = el;
                  }}
                />
                {/* F11.1 — Linhas de guia para visualizar as margens (sutis) */}
                <div
                  className={styles.thumbMarginGuide}
                  style={{
                    top: `${marginTopCm}cm`,
                    left: `${marginLeftCm}cm`,
                    right: `${marginRightCm}cm`,
                    bottom: `${marginBottomCm}cm`,
                  }}
                  aria-hidden
                />
              </div>
              <div className={styles.thumbPageLabel}>{i + 1}</div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
