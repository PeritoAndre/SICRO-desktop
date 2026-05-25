/**
 * `.sicrodoc` → HTML renderer.
 *
 * Uses TipTap's `generateHTML` with the same extension list as the editor,
 * then walks the resulting markup to apply pericial concerns that don't
 * belong to a single node:
 *   - figure numbering ("Figura 1", "Figura 2", "Croqui 1", ...);
 *   - figcaption slot replacement;
 *   - storyboard description slot replacement.
 *
 * For MVP 2, the renderer also wraps the document in the institutional chrome
 * (header / footer / side-mark / page numbering) defined by
 * `layout.institutional_template`. Chrome is configuration, NOT editable
 * content — it lives in the layout, never in `content`.
 *
 * The output is plain HTML suitable for `<iframe srcdoc>` previews or for
 * Edge `--print-to-pdf`.
 */

import { generateHTML } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";
import { laudoExtensions } from "./extensions";
import type { SicroDoc, SicroDocPageMargins } from "./schema";
import { numberFigures } from "./numbering";
import {
  inlineEvidenceAssets,
  type EvidenceAssetMap,
} from "./evidence-assets";
import {
  findInstitutionalTemplate,
  resolveHeaderField,
  type InstitutionalTemplate,
} from "./institutional-templates";
import { resolveEffectiveMargins } from "./page-layout";
import type { BrandingAssets } from "./branding";

const BASE_DOC_STYLES = `
  body { margin: 0; font-family: "Times New Roman", Cambria, serif; color: #111; }

  h1 { font-size: 18pt; text-align: center; }
  h2 { font-size: 14pt; }
  h3 { font-size: 12pt; }
  p  { font-size: 12pt; text-align: justify; line-height: 1.5; }
  ul, ol { padding-left: 1.5em; }

  figure[data-sicro-figure] {
    margin: 1.5em auto; text-align: center; page-break-inside: avoid;
  }
  figure[data-sicro-figure] img {
    max-width: 100%; height: auto; border: 1px solid #d8d8d8;
  }
  figure[data-sicro-figure] figcaption {
    font-size: 10pt; color: #444; margin-top: 0.4em; font-style: italic;
  }
  table[data-sicro-table] {
    border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 11pt;
  }
  table[data-sicro-table] th,
  table[data-sicro-table] td {
    border: 1px solid #444; padding: 4px 8px; vertical-align: top;
  }
  table[data-sicro-table] th { background: #ececec; }
  section[data-sicro-storyboard] {
    border: 1px dashed #c0c0c0; padding: 0.5em; margin: 1em 0;
    page-break-inside: avoid;
  }
  article[data-sicro-storyboard-item] {
    display: grid; grid-template-columns: 200px 1fr; gap: 12px;
    align-items: start; padding: 8px 0;
    border-bottom: 1px solid #eee;
    page-break-inside: avoid;
  }
  article[data-sicro-storyboard-item]:last-child { border-bottom: none; }
  article[data-sicro-storyboard-item] img {
    width: 100%; border: 1px solid #d8d8d8;
  }
  span[data-sicro-system-data] {
    background: rgba(230, 180, 80, 0.12);
    border-bottom: 1px dotted #b07c20;
    padding: 0 2px;
  }
  span[data-sicro-system-data][data-review-status="reviewed"] {
    background: rgba(53, 196, 122, 0.10);
    border-bottom-color: #1f7a44;
  }
  span[data-sicro-system-data][data-review-status="converted"] {
    background: transparent;
    border-bottom: none;
  }

  /* ---- MVP 2: institutional blocks ---- */
  section[data-sicro-quesito-list] {
    margin: 1em 0;
  }
  article[data-sicro-quesito-item] {
    margin: 0.8em 0 1em;
    page-break-inside: avoid;
  }
  div[data-sicro-quesito-question] {
    font-weight: 700;
    margin-bottom: 0.2em;
  }
  div[data-sicro-quesito-question]::before {
    content: "Quesito " counter(quesito) ": ";
    counter-increment: quesito;
  }
  section[data-sicro-quesito-list] {
    counter-reset: quesito;
  }
  div[data-sicro-quesito-answer]::before {
    content: "Resposta: ";
    font-weight: 700;
  }
  div[data-sicro-quesito-answer] {
    margin-left: 1em;
    text-align: justify;
  }

  section[data-sicro-signature] {
    margin: 2em 0 1em;
    text-align: center;
    page-break-inside: avoid;
  }
  section[data-sicro-signature] [data-sicro-signature-place] {
    margin-bottom: 2em;
    text-align: right;
  }
  section[data-sicro-signature] [data-sicro-signature-rule] {
    letter-spacing: 1px;
  }
  section[data-sicro-signature] [data-sicro-signature-name] {
    font-weight: 700;
    margin-top: 0.2em;
  }
  section[data-sicro-signature] [data-sicro-signature-role] {
    font-style: italic;
    font-size: 11pt;
  }

  /* ---- MVP 2: institutional chrome ---- */
  header.sicro-doc-header {
    text-align: center;
    border-bottom: 1px solid #444;
    padding-bottom: 0.4em;
    margin-bottom: 1em;
  }
  header.sicro-doc-header .sicro-doc-brand-row {
    display: grid;
    grid-template-columns: 1.6cm 1fr;
    align-items: center;
    gap: 0.4cm;
  }
  header.sicro-doc-header .sicro-brand-img-pca {
    width: 1.6cm;
    height: 1.6cm;
    object-fit: contain;
  }
  header.sicro-doc-header .sicro-brand-lines {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.05cm;
  }
  header.sicro-doc-header .sicro-brand-img-estado {
    width: 1.4cm;
    height: 1.4cm;
    object-fit: contain;
    margin-bottom: 0.1cm;
  }
  header.sicro-doc-header .sicro-brand-line {
    font-weight: 700;
    font-size: 11pt;
    line-height: 1.3;
  }
  header.sicro-doc-header .sicro-brand-line:first-child {
    font-size: 9.5pt;
  }
  header.sicro-doc-header .sicro-brand-line:last-of-type {
    margin-bottom: 0.2em;
  }
  header.sicro-doc-header .sicro-doc-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 12px;
    margin-top: 0.5em;
    font-size: 10pt;
    text-align: left;
  }
  header.sicro-doc-header .sicro-doc-meta-row strong {
    margin-right: 4px;
  }

  footer.sicro-doc-footer {
    border-top: 1px solid #aaa;
    padding-top: 0.4em;
    margin-top: 2em;
    font-size: 9pt;
    color: #444;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  aside.sicro-doc-side-mark {
    position: fixed;
    top: 0; bottom: 0; left: 0;
    width: 1.5cm;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #888;
    font-size: 8pt;
    letter-spacing: 4px;
    pointer-events: none;
    z-index: 0;
  }
  aside.sicro-doc-side-mark .sicro-side-mark-text {
    transform: rotate(-90deg);
    white-space: nowrap;
    text-transform: uppercase;
  }
`;

function pageStyles(
  template: InstitutionalTemplate,
  margins: SicroDocPageMargins,
): string {
  return `
    @page {
      size: ${template.page.size} ${template.page.orientation};
      margin: ${margins.top} ${margins.right} ${margins.bottom} ${margins.left};
      ${
        template.footer.show_page_numbers
          ? `@bottom-right {
               content: "Folha " counter(page) " de " counter(pages);
               font-family: "Times New Roman", Cambria, serif;
               font-size: 9pt;
               color: #444;
             }`
          : ""
      }
    }

    @media screen {
      body {
        padding: ${margins.top} ${margins.right} ${margins.bottom} ${margins.left};
        max-width: 21cm;
        margin: 0 auto;
        background: #fff;
      }
    }
  `;
}

export interface RenderOptions {
  /** Wrap the output in a full <html> document with print-ready styles. */
  fullDocument?: boolean;
  /** Inject figure numbering. Default true. */
  numbering?: boolean;
  /** Occurrence values to fill the institutional header. When omitted, the
   *  header still renders but with empty values (collapsed). */
  occurrence?: Record<string, unknown> | null;
  /** Pre-loaded data-URIs for the institutional coats of arms. Required for
   *  the PDF pipeline (Edge headless reads the HTML from a temp file and
   *  cannot resolve `/branding/...` paths). Optional — without it the
   *  header renders without images. */
  branding?: BrandingAssets | null;
  /** MVP 4: pre-loaded evidence asset bytes (relative_path → data URI).
   *  When provided, figures/storyboard items whose `relative_path` matches
   *  have their `src` replaced before TipTap renders. */
  evidenceAssets?: EvidenceAssetMap | null;
}

export function renderSicroDocToHtml(
  doc: SicroDoc,
  options: RenderOptions = {},
): string {
  const numbering = options.numbering ?? true;
  const fullDocument = options.fullDocument ?? false;

  let content: JSONContent = numbering
    ? numberFigures(doc.content)
    : (doc.content as JSONContent);
  if (options.evidenceAssets) {
    // Inline data URIs so the HTML/PDF pipeline doesn't need
    // workspace-local file access.
    content = inlineEvidenceAssets(content, options.evidenceAssets);
  }
  const innerHtml = generateHTML(content, laudoExtensions());

  if (!fullDocument) {
    return innerHtml;
  }

  const template = findInstitutionalTemplate(
    doc.layout?.institutional_template,
  );
  const occurrence = options.occurrence ?? null;
  const metadata = (doc.metadata ?? {}) as Record<string, unknown>;
  const branding = options.branding ?? null;
  // Effective margins = doc.layout.page.margins (per-laudo override) →
  // template.page.margins → SICRO defaults. Same resolver used by the editor
  // so the on-screen sheet, PDF, and HTML preview agree pixel-for-pixel.
  const margins = resolveEffectiveMargins(doc, template);

  const headerHtml = renderHeader(template, metadata, occurrence, branding);
  const footerHtml = renderFooter(template);
  const sideMarkHtml = renderSideMark(template);

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(doc.title)}</title>
    <style>${pageStyles(template, margins)}${BASE_DOC_STYLES}</style>
  </head>
  <body>
    ${sideMarkHtml}
    ${headerHtml}
    <main class="sicro-doc-body">${innerHtml}</main>
    ${footerHtml}
  </body>
</html>`;
}

function renderHeader(
  template: InstitutionalTemplate,
  metadata: Record<string, unknown>,
  occurrence: Record<string, unknown> | null,
  branding: BrandingAssets | null,
): string {
  const brand = template.header.brand_lines
    .map((line) => `<div class="sicro-brand-line">${escapeHtml(line)}</div>`)
    .join("");
  const subtitle = template.header.subtitle
    ? `<div class="sicro-brand-subtitle">${escapeHtml(template.header.subtitle)}</div>`
    : "";

  const meta = template.header.metadata_fields
    .map((f) => {
      const value = resolveHeaderField(f.source, metadata, occurrence);
      if (!value) return "";
      return `<div class="sicro-doc-meta-row"><strong>${escapeHtml(
        f.label,
      )}:</strong> ${escapeHtml(value)}</div>`;
    })
    .filter(Boolean)
    .join("");

  const metaBlock = meta
    ? `<div class="sicro-doc-meta">${meta}</div>`
    : "";

  // Coats of arms — only emitted when the data URIs are available, so the
  // markup degrades gracefully when branding can't be pre-loaded.
  const pcaImg = branding?.pca
    ? `<img class="sicro-brand-img-pca" src="${branding.pca}" alt="Brasão da Polícia Científica" />`
    : "";
  const estadoImg = branding?.estado
    ? `<img class="sicro-brand-img-estado" src="${branding.estado}" alt="Brasão do Estado do Amapá" />`
    : "";

  return `<header class="sicro-doc-header">
    <div class="sicro-doc-brand-row">
      ${pcaImg}
      <div class="sicro-brand-lines">
        ${estadoImg}
        ${brand}${subtitle}
      </div>
    </div>
    ${metaBlock}
  </header>`;
}

function renderFooter(template: InstitutionalTemplate): string {
  // The "Folha X de Y" is provided by `@page @bottom-right` for the PDF.
  // The HTML footer carries only the institutional sentence + a screen-only
  // "Folha 1" placeholder so the on-screen render doesn't look broken.
  return `<footer class="sicro-doc-footer">
    <span>${escapeHtml(template.footer.text)}</span>
    <span class="sicro-screen-page">Folha 1</span>
  </footer>`;
}

function renderSideMark(template: InstitutionalTemplate): string {
  if (!template.side_mark) return "";
  return `<aside class="sicro-doc-side-mark" aria-hidden="true">
    <div class="sicro-side-mark-text">${escapeHtml(template.side_mark.text)}</div>
  </aside>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
