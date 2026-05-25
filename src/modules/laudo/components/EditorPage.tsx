/**
 * EditorPage — folha A4 visual com réguas e paginação visual via marcadores.
 *
 * MVP 2 ajuste de runtime (revisão 1.2):
 *   - A folha agora é **uma única tira branca contínua** que cresce com o
 *     conteúdo. Nada de gaps cinzas no meio — o texto NUNCA aparece fora
 *     da área branca.
 *   - As quebras de página visuais viram **linhas tracejadas** atravessando
 *     a folha a cada `29,7 cm`, com label "— página N —" no centro. Isso
 *     comunica claramente onde uma página termina e a próxima começa
 *     no PDF, sem mentir sobre paginação real.
 *   - Réguas horizontal e vertical (estilo Word) mostram escala em cm e
 *     destacam visualmente a área útil entre as margens. Marcadores
 *     triangulares dourados ficam nos pontos das margens, prontos para
 *     ganhar drag em uma iteração futura.
 *   - As margens vêm de `resolveEffectiveMargins(doc, template)` — o
 *     `.sicrodoc` pode sobrescrever via `layout.page.margins`.
 *
 * Limitação aceita: o conteúdo do TipTap continua sendo UM contenteditable
 * único. Não há quebra real do texto entre páginas — apenas marcadores
 * visuais. Paginação real (split do conteúdo em múltiplos ContentEditable
 * ou similar) é trabalho de spike próprio.
 */

import { useEffect, useRef, useState } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import {
  A4_PAGE,
  brandingPaths,
  findInstitutionalTemplate,
  marginsInCm,
  resolveEffectiveMargins,
  resolveHeaderField,
  type InstitutionalTemplate,
  type SicroDoc,
} from "../document-engine";
import type { Occurrence } from "@domain/occurrence";
import { HorizontalRuler, PX_PER_CM, RULER_THICKNESS } from "./HorizontalRuler";
import { VerticalRuler } from "./VerticalRuler";
import styles from "./EditorPage.module.css";

interface EditorPageProps {
  editor: Editor | null;
  /** SicroDoc envelope so the page can pull `layout.institutional_template`,
   *  `layout.page.margins` and `metadata`. Optional — without it, the page
   *  renders with default chrome and SICRO default margins. */
  doc?: SicroDoc | null;
  /** Active occurrence used to fill the institutional header. */
  occurrence?: Occurrence | null;
}

export function EditorPage({ editor, doc, occurrence }: EditorPageProps) {
  const template = doc
    ? findInstitutionalTemplate(doc.layout?.institutional_template)
    : null;
  const margins = marginsInCm(resolveEffectiveMargins(doc ?? null, template));

  const editorWrapRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);

  // Recalculate the visible page count whenever the editor content size
  // changes. The "page" is purely visual — a 29.7 cm slice of the continuous
  // white sheet. The text itself never wraps based on this count.
  useEffect(() => {
    const wrap = editorWrapRef.current;
    if (!wrap) return;

    const calc = () => {
      const h = wrap.scrollHeight;
      const PAGE_PX = A4_PAGE.heightCm * PX_PER_CM;
      const pages = Math.max(1, Math.ceil(h / PAGE_PX));
      setPageCount((prev) => (prev === pages ? prev : pages));
    };
    calc();

    const obs = new ResizeObserver(calc);
    obs.observe(wrap);

    let removeEditorHandler: (() => void) | undefined;
    if (editor) {
      const handler = () => requestAnimationFrame(calc);
      editor.on("update", handler);
      removeEditorHandler = () => editor.off("update", handler);
    }

    return () => {
      obs.disconnect();
      removeEditorHandler?.();
    };
  }, [editor]);

  const totalHeightCm = pageCount * A4_PAGE.heightCm;
  const paths = brandingPaths();

  // Editor padding mirrors the page margins so text starts where the ruler
  // says it should.
  const editorPaddingStyle: React.CSSProperties = {
    paddingTop: `${margins.top}cm`,
    paddingRight: `${margins.right}cm`,
    paddingBottom: `${margins.bottom}cm`,
    paddingLeft: `${margins.left}cm`,
    // The continuous sheet keeps the last page at full A4 height even when
    // the content is short — otherwise the bottom margin would collapse and
    // the footer chrome would overlap the editable area.
    minHeight: `${A4_PAGE.heightCm}cm`,
  };

  return (
    <div className={styles.scroll}>
      <div className={styles.workspace}>
        {/* Top row: corner + horizontal ruler */}
        <div className={styles.topRow}>
          <div
            className={styles.cornerSpacer}
            style={{
              width: `${RULER_THICKNESS}px`,
              height: `${RULER_THICKNESS}px`,
            }}
          />
          <HorizontalRuler
            widthCm={A4_PAGE.widthCm}
            leftMarginCm={margins.left}
            rightMarginCm={margins.right}
          />
        </div>

        {/* Middle row: vertical ruler + continuous sheet */}
        <div className={styles.midRow}>
          <VerticalRuler
            heightCm={totalHeightCm}
            topMarginCm={margins.top}
            bottomMarginCm={margins.bottom}
            pageHeightCm={A4_PAGE.heightCm}
            pageCount={pageCount}
          />

          <div
            className={styles.sheet}
            style={{ minHeight: `${totalHeightCm}cm` }}
          >
            {/* Side mark — first virtual page only. */}
            {template?.side_mark && (
              <aside className={styles.sideMark} aria-hidden>
                <div className={styles.sideMarkText}>
                  {template.side_mark.text}
                </div>
              </aside>
            )}

            {/* Decorative institutional header (first page only). */}
            {template && (
              <DocHeader
                template={template}
                metadata={(doc?.metadata ?? {}) as Record<string, unknown>}
                occurrence={occurrence ?? null}
                estadoSrc={paths.estado}
                pcaSrc={paths.pca}
                topCm={Math.max(0.6, margins.top - 2.2)}
                leftCm={margins.left}
                rightCm={margins.right}
              />
            )}

            {/* Page break markers — dashed lines that traverse the sheet. */}
            {Array.from({ length: Math.max(0, pageCount - 1) }).map((_, i) => {
              const yCm = (i + 1) * A4_PAGE.heightCm;
              return (
                <div
                  key={i}
                  className={styles.pageBreakLine}
                  style={{ top: `${yCm}cm` }}
                  aria-hidden
                >
                  <span className={styles.pageBreakLabel}>
                    — página {i + 2} —
                  </span>
                </div>
              );
            })}

            {/* The editor itself — padding follows the effective margins. */}
            <div
              className={styles.editorWrap}
              ref={editorWrapRef}
              style={editorPaddingStyle}
            >
              <EditorContent editor={editor} />
            </div>

            {/* Decorative footer at the very bottom of the last virtual page. */}
            {template && (
              <DocFooter
                template={template}
                pageCount={pageCount}
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

interface DocHeaderProps {
  template: InstitutionalTemplate;
  metadata: Record<string, unknown>;
  occurrence: Occurrence | null;
  estadoSrc: string;
  pcaSrc: string;
  topCm: number;
  leftCm: number;
  rightCm: number;
}

function DocHeader({
  template,
  metadata,
  occurrence,
  estadoSrc,
  pcaSrc,
  topCm,
  leftCm,
  rightCm,
}: DocHeaderProps) {
  const meta = template.header.metadata_fields
    .map((f) => {
      const value = resolveHeaderField(
        f.source,
        metadata,
        occurrence as unknown as Record<string, unknown> | null,
      );
      if (!value) return null;
      return (
        <div key={f.source} className={styles.docMetaRow}>
          <strong>{f.label}:</strong> {value}
        </div>
      );
    })
    .filter(Boolean);

  return (
    <header
      className={styles.docHeader}
      contentEditable={false}
      style={{
        top: `${topCm}cm`,
        left: `${leftCm}cm`,
        right: `${rightCm}cm`,
      }}
    >
      <div className={styles.docBrandRow}>
        <img
          src={pcaSrc}
          alt="Brasão da Polícia Científica do Amapá"
          className={styles.brandImagePca}
        />
        <div className={styles.brandLines}>
          <img
            src={estadoSrc}
            alt="Brasão do Estado do Amapá"
            className={styles.brandImageEstado}
          />
          {template.header.brand_lines.map((line, i) => (
            <div key={i} className={styles.brandLine}>
              {line}
            </div>
          ))}
          {template.header.subtitle && (
            <div className={styles.brandLine}>{template.header.subtitle}</div>
          )}
        </div>
      </div>
      {meta.length > 0 && <div className={styles.docMeta}>{meta}</div>}
    </header>
  );
}

function DocFooter({
  template,
  pageCount,
  bottomCm,
  leftCm,
  rightCm,
}: {
  template: InstitutionalTemplate;
  pageCount: number;
  bottomCm: number;
  leftCm: number;
  rightCm: number;
}) {
  return (
    <footer
      className={styles.docFooter}
      contentEditable={false}
      style={{
        bottom: `${bottomCm}cm`,
        left: `${leftCm}cm`,
        right: `${rightCm}cm`,
      }}
    >
      <span>{template.footer.text}</span>
      <span>
        {pageCount === 1
          ? "Folha 1"
          : `Folha ${pageCount} (de ${pageCount} visuais)`}
      </span>
    </footer>
  );
}
