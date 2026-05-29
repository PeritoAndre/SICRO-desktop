/**
 * Pagination — plugin ProseMirror que insere "spacers" entre blocos
 * para empurrar conteúdo para a próxima página, gerando paginação
 * VISUAL real (estilo Word) sem precisar separar o contenteditable em
 * múltiplos hosts.
 *
 * F7.5 — Paginação REATIVA. O plugin state armazena `opts` (margens, gap,
 * pageHeight). Mudanças em runtime são feitas via `setPaginationOptions
 * (view, partialOpts)` que dispara um `setMeta(KEY, { type: "setOpts",
 * opts })`. O `apply` atualiza o state e dispara recompute, fazendo o
 * conteúdo se reorganizar automaticamente com novos spacer heights —
 * igual ao Word: aumentar margem TOP empurra texto para próxima página
 * se necessário.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

export interface PaginationOptions {
  pageHeightCm: number;
  marginTopCm: number;
  marginBottomCm: number;
  gapCm: number;
  enabled: boolean;
}

export const PX_PER_CM = 96 / 2.54;

interface PaginationState {
  decos: DecorationSet;
  opts: PaginationOptions;
}

export const PAGINATION_PLUGIN_KEY = new PluginKey<PaginationState>(
  "sicroPagination",
);

type Meta =
  | { type: "setOpts"; opts: Partial<PaginationOptions> }
  | { type: "setDecos"; decos: DecorationSet };

export const Pagination = Extension.create<PaginationOptions>({
  name: "pagination",

  addOptions() {
    return {
      pageHeightCm: 29.7,
      marginTopCm: 3,
      marginBottomCm: 2.5,
      gapCm: 0.7,
      enabled: true,
    };
  },

  addProseMirrorPlugins() {
    const ext = this;
    if (!ext.options.enabled) return [];
    return [createPaginationPlugin(ext.options)];
  },
});

function createPaginationPlugin(initialOpts: PaginationOptions): Plugin {
  return new Plugin<PaginationState>({
    key: PAGINATION_PLUGIN_KEY,
    state: {
      init: () => ({ decos: DecorationSet.empty, opts: { ...initialOpts } }),
      apply(tr, old) {
        const meta = tr.getMeta(PAGINATION_PLUGIN_KEY) as Meta | undefined;
        if (meta?.type === "setOpts") {
          return {
            decos: old.decos.map(tr.mapping, tr.doc),
            opts: { ...old.opts, ...meta.opts },
          };
        }
        if (meta?.type === "setDecos") {
          return { decos: meta.decos, opts: old.opts };
        }
        return {
          decos: old.decos.map(tr.mapping, tr.doc),
          opts: old.opts,
        };
      },
    },
    props: {
      decorations(state) {
        return PAGINATION_PLUGIN_KEY.getState(state)?.decos;
      },
    },
    view(view) {
      let raf: number | null = null;
      let scheduled = false;

      const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        raf = window.requestAnimationFrame(() => {
          scheduled = false;
          raf = null;
          try {
            const pState = PAGINATION_PLUGIN_KEY.getState(view.state);
            if (!pState || !pState.opts.enabled) return;
            const next = computePaginationDecos(view, pState.opts);
            if (decorationSetsEqual(pState.decos, next)) return;
            view.dispatch(
              view.state.tr.setMeta(PAGINATION_PLUGIN_KEY, {
                type: "setDecos",
                decos: next,
              } satisfies Meta),
            );
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("[pagination] recompute failed", err);
          }
        });
      };

      // F7.11 — REMOVIDO o ResizeObserver. Ele disparava schedule cada
      // vez que o view.dom mudava de altura — incluindo quando NÓS
      // MESMOS inseríamos um spacer (que muda a altura). Isso criava
      // um loop: dispatch → DOM cresce → RO trigger → schedule →
      // recompute → talvez novo dispatch → loop.
      //
      // Cobrimos o cenário "imagem terminou de carregar" via o update
      // do PM (caso a imagem mude o doc via insertContent) ou via
      // re-trigger manual quando necessário. Para typing/paste/undo,
      // update() é suficiente.

      // Cálculo inicial após mount.
      schedule();

      return {
        // F7.11 — Update do PM dispara após CADA transaction (incluindo
        // os setMeta do próprio plugin). Para quebrar o loop:
        //   - Se o DOC mudou (typing/paste/undo/setOpts re-render):
        //     schedule recompute.
        //   - Se SÓ decorations mudaram (nosso próprio dispatch):
        //     NÃO schedule. O estado de paginação já está atualizado.
        // Para `setOpts` (mudança de margem) o apply marca a transação,
        // mas como o doc NÃO mudou, precisamos detectar de outra forma.
        // Solução: comparamos opts em prevState vs current. Se opts
        // mudou, schedule.
        update: (view, prevState) => {
          const docChanged = !view.state.doc.eq(prevState.doc);
          const prevOpts = PAGINATION_PLUGIN_KEY.getState(prevState)?.opts;
          const currOpts = PAGINATION_PLUGIN_KEY.getState(view.state)?.opts;
          const optsChanged =
            prevOpts &&
            currOpts &&
            (prevOpts.marginTopCm !== currOpts.marginTopCm ||
              prevOpts.marginBottomCm !== currOpts.marginBottomCm ||
              prevOpts.gapCm !== currOpts.gapCm ||
              prevOpts.pageHeightCm !== currOpts.pageHeightCm);
          if (docChanged || optsChanged) {
            schedule();
          }
        },
        destroy: () => {
          if (raf != null) window.cancelAnimationFrame(raf);
        },
      };
    },
  });
}

/**
 * Atualiza opções do plugin em runtime e força recompute. Chame quando
 * o usuário alterar margens, gap, orientação, etc.
 */
export function setPaginationOptions(
  view: EditorView,
  opts: Partial<PaginationOptions>,
): void {
  view.dispatch(
    view.state.tr.setMeta(PAGINATION_PLUGIN_KEY, {
      type: "setOpts",
      opts,
    } satisfies Meta),
  );
}

/**
 * Mede o DOM do editor e produz a lista de spacers necessários para
 * paginar o conteúdo conforme `opts`.
 *
 * F7.6 — Todas as margens (top, bottom de cada página) são representadas
 * por SPACERS uniformes. O `editorWrap` tem padding-top/bottom ZERO; a
 * margem top da pg1 vem de um "spacer inicial" inserido em pos=0. Margens
 * entre páginas vêm dos spacers de page-break (gap + mBot + mTop). Margem
 * bottom da última página vem de um "spacer final" no fim do doc.
 *
 * Isso garante que cada página é uma ENTIDADE idêntica visualmente — não
 * importa se é pg1, pg2 ou pg10, todas têm o mesmo tratamento de margens.
 */
export function computePaginationDecos(
  view: EditorView,
  opts: PaginationOptions,
): DecorationSet {
  const marginTopPx = opts.marginTopCm * PX_PER_CM;
  const marginBottomPx = opts.marginBottomCm * PX_PER_CM;
  const usableHeightPx =
    (opts.pageHeightCm - opts.marginTopCm - opts.marginBottomCm) * PX_PER_CM;
  const middleSpacerPx =
    (opts.gapCm + opts.marginBottomCm + opts.marginTopCm) * PX_PER_CM;

  if (usableHeightPx <= 0) {
    return DecorationSet.empty;
  }

  const docSize = view.state.doc.content.size;
  const decorations: Decoration[] = [];

  // F7.6 — Spacer inicial: margem top da pg1.
  decorations.push(
    Decoration.widget(0, () => makeSpacer(marginTopPx, "top"), {
      side: -1,
      key: `margin-top-${Math.round(marginTopPx)}`,
      ignoreSelection: true,
    }),
  );

  // M3 — Algoritmo determinístico (sem `offsetTop`).
  //
  // Versões anteriores subtraíam `accumulatedSpacerPx` de `offsetTop` para
  // reconstruir uma "posição natural" e comparar com `usableHeightPx`. O
  // problema: a cada keystroke o browser desloca TODOS os blocos abaixo do
  // cursor em ±1px (sub-pixel rendering em telas hi-DPI). Blocos perto do
  // limiar trocavam de página de forma alternada — exatamente o sintoma
  // "tecla sim, tecla não, margem some" reportado pelo usuário.
  //
  // Substituí por simulação: percorro os blocos NORMAIS (ignorando os
  // spacers que NÓS mesmos inserimos), acumulo só `offsetHeight` em uma
  // variável `yOnCurrentPage`, e quebro a página quando o próximo bloco
  // não couber. `offsetHeight` muda em saltos discretos (uma linha
  // inteira quando o texto quebra), não em sub-pixels — então a decisão
  // é estável entre keystrokes.
  //
  // M4 — MIDDLE SPACER DINÂMICO.
  //
  // O middle spacer tem que empurrar o conteúdo "natural" (sem spacers)
  // até a posição visual desejada (topo da próxima página + marginTop).
  // Como blocos têm altura discreta, o último bloco de uma página deixa
  // FOLGA até a margem inferior (ex: termina em 22cm de 24.2cm úteis).
  // O constante `gap+mBot+mTop` só vale se a página estiver 100% cheia;
  // com folga, ele fica curto e a margem-topo da próxima página é
  // visualmente "comida" pela folga.
  //
  // Fórmula correta:
  //
  //     middleSpacer = (pageHeight + gap) - yOnCurrentPage
  //
  // Derivação: o primeiro bloco da próxima página deve ficar em
  // `pageStart_next + marginTop = (pageHeight + gap) + marginTop`.
  // Sem spacer, esse bloco estaria em `marginTop + yOnCurrentPage`.
  // Logo o spacer = (pageHeight + gap) + mTop - (mTop + yOn) = (ph+gap) - yOn.
  //
  // Quando yOn = usable (bloco preenche perfeito), o resultado = gap+mBot+mTop
  // (a constante antiga). Quando yOn < usable (folga), o spacer cresce
  // proporcionalmente — exatamente o que falta para alinhar a margem.
  //
  // Spacers existentes na DOM (do round anterior) são apenas IGNORADOS
  // aqui: não preciso "voltar atrás" a posição de nada porque não uso
  // offsetTop.
  // M6 — ALTURA EFETIVA = offsetTop_next - offsetTop_current.
  //
  // `offsetHeight` retorna só o content box do bloco, SEM as margens CSS.
  // Como cada `<p>` tem `margin: 1em` (~16px), o gap real entre dois
  // parágrafos no fluxo é maior que `offsetHeight`. Acumular só
  // offsetHeight subconta ~16px por bloco. Com 27 parágrafos isso vira
  // ~430px (11cm) de underflow acumulado — exatamente o que fazia o
  // algoritmo "achar" que cabia mais conteúdo na pg1 e deixar o texto
  // vazar para dentro da margem inferior.
  //
  // Fix: medir altura efetiva pelo deslocamento entre blocos vizinhos.
  // `next.offsetTop - block.offsetTop` capta:
  //   - o content box do bloco atual
  //   - + a margem colapsada entre ele e o próximo
  // Para o último bloco (sem next) cai pra offsetHeight (subconta a
  // margem final mas isso só afeta o spacer bottom da última pg).
  //
  // Sub-pixel stability: offsetTop é inteiro (px). A DIFERENÇA entre
  // dois irmãos depende só do conteúdo do bloco atual — quando blocos
  // antes dele mudam de altura, AMBOS offsetTops deslocam pelo mesmo
  // delta, e a diferença permanece estável. Mantém a determinismo do M4.
  //
  // Spacers existentes na DOM entre dois normalBlocks (nossos próprios
  // widgets de paginação) são descontados de offsetTop_next pra evitar
  // que o spacer infle a altura efetiva do bloco anterior.
  const SAFETY_PX = 6;
  const pageHeightPx = opts.pageHeightCm * PX_PER_CM;
  const gapPx = opts.gapCm * PX_PER_CM;
  const minMiddleSpacerPx = middleSpacerPx; // floor pra blocos absurdamente grandes
  const allChildren = Array.from(view.dom.children) as HTMLElement[];
  const normalBlocks = allChildren.filter(
    (c) => !c.classList?.contains("sicro-page-spacer"),
  );

  let yOnCurrentPage = 0;
  let pageIndex = 0;

  for (let i = 0; i < normalBlocks.length; i++) {
    const block = normalBlocks[i]!;
    const next = normalBlocks[i + 1];

    let effectiveHeight: number;
    if (next) {
      // Calcula altura efetiva via diferença de offsetTop, descontando
      // qualquer spacer (decoração nossa) que esteja entre os dois.
      let spacersBetweenPx = 0;
      let cursor = block.nextElementSibling as HTMLElement | null;
      while (cursor && cursor !== next) {
        if (cursor.classList?.contains("sicro-page-spacer")) {
          spacersBetweenPx += cursor.offsetHeight;
        }
        cursor = cursor.nextElementSibling as HTMLElement | null;
      }
      effectiveHeight = Math.max(
        0,
        Math.floor(next.offsetTop - block.offsetTop - spacersBetweenPx),
      );
    } else {
      // Último bloco: sem next, use offsetHeight. Subconta a margem final,
      // mas isso só afeta a folga visual da margem bottom da última pg.
      effectiveHeight = Math.floor(block.offsetHeight);
    }

    // Quebra para a próxima página quando o bloco não cabe + safety.
    // `yOnCurrentPage > 0` evita loop infinito: um bloco maior que a
    // página inteira (ex: imagem gigante) NÃO dispara quebra se já
    // está no topo de uma página vazia — ele simplesmente vaza
    // visualmente (limitação conhecida, blocos não são quebrados).
    if (
      yOnCurrentPage + effectiveHeight > usableHeightPx - SAFETY_PX &&
      yOnCurrentPage > 0
    ) {
      let posBeforeChild: number | null = null;
      try {
        const inside = view.posAtDOM(block, 0);
        posBeforeChild = Math.max(0, inside - 1);
      } catch {
        // Bloco sem posição PM resolvível: pula sem quebrar.
        yOnCurrentPage += effectiveHeight;
        continue;
      }
      // Spacer DINÂMICO: cobre exatamente a folga da pg atual + área
      // entre páginas + marginTop da próxima pg.
      const dynamicSpacerPx = Math.max(
        minMiddleSpacerPx,
        pageHeightPx + gapPx - yOnCurrentPage,
      );
      decorations.push(
        Decoration.widget(
          posBeforeChild,
          () => makeSpacer(dynamicSpacerPx, "middle"),
          {
            side: -1,
            // Key inclui altura — força re-render quando dynamic muda.
            key: `pagebreak-${pageIndex + 1}-${Math.round(dynamicSpacerPx)}`,
            ignoreSelection: true,
          },
        ),
      );
      pageIndex += 1;
      yOnCurrentPage = 0;
    }

    yOnCurrentPage += effectiveHeight;
  }

  // F7.6 — Spacer final: margem bottom da última página.
  decorations.push(
    Decoration.widget(
      docSize,
      () => makeSpacer(marginBottomPx, "bottom"),
      {
        side: 1,
        key: `margin-bottom-${Math.round(marginBottomPx)}`,
        ignoreSelection: true,
      },
    ),
  );

  return DecorationSet.create(view.state.doc, decorations);
}

function makeSpacer(
  heightPx: number,
  variant: "top" | "middle" | "bottom",
): HTMLElement {
  const div = document.createElement("div");
  div.className = `sicro-page-spacer sicro-page-spacer--${variant}`;
  // F7.5/7.6 — Altura em CM para alinhar com os page cards (que estão em
  // cm). Browser arredonda CM identicamente em ambos os elementos.
  const heightCm = heightPx / PX_PER_CM;
  div.style.height = `${heightCm}cm`;
  div.style.userSelect = "none";
  div.style.pointerEvents = "none";
  div.contentEditable = "false";
  div.setAttribute("aria-hidden", "true");
  return div;
}

function decorationSetsEqual(a: DecorationSet, b: DecorationSet): boolean {
  const aFound = a.find();
  const bFound = b.find();
  if (aFound.length !== bFound.length) return false;
  for (let i = 0; i < aFound.length; i++) {
    if (aFound[i]!.from !== bFound[i]!.from) return false;
    // Compara também o `key` para detectar mudança de spacer height
    // (key inclui o heightPx — vide makeSpacer).
    const aKey = (aFound[i] as unknown as { spec?: { key?: string } }).spec
      ?.key;
    const bKey = (bFound[i] as unknown as { spec?: { key?: string } }).spec
      ?.key;
    if (aKey !== bKey) return false;
  }
  return true;
}

/**
 * Conta quantos spacers (page breaks) estão atualmente ativos.
 */
export function countPaginationBreaks(view: EditorView | null): number {
  if (!view) return 0;
  const state = PAGINATION_PLUGIN_KEY.getState(view.state);
  if (!state) return 0;
  return state.decos.find().length;
}
