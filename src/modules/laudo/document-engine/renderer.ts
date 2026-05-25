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
 * The output is plain HTML suitable for `<iframe srcdoc>` previews or future
 * PDF export pipelines.
 */

import { generateHTML } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";
import { laudoExtensions } from "./extensions";
import type { SicroDoc } from "./schema";
import { numberFigures } from "./numbering";

const DOC_STYLES = `
  body { margin: 0; font-family: "Times New Roman", Cambria, serif; color: #111; }
  .doc-shell { padding: 2.5cm 2cm; max-width: 21cm; margin: 0 auto; background: #fff; }
  h1 { font-size: 18pt; text-align: center; }
  h2 { font-size: 14pt; }
  h3 { font-size: 12pt; }
  p  { font-size: 12pt; text-align: justify; line-height: 1.5; }
  ul, ol { padding-left: 1.5em; }
  figure[data-sicro-figure] {
    margin: 1.5em auto; text-align: center;
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
  }
  article[data-sicro-storyboard-item] {
    display: grid; grid-template-columns: 200px 1fr; gap: 12px;
    align-items: start; padding: 8px 0;
    border-bottom: 1px solid #eee;
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
`;

export interface RenderOptions {
  /** Wrap the output in a full <html> document with print-ready styles. */
  fullDocument?: boolean;
  /** Inject figure numbering. Default true. */
  numbering?: boolean;
}

export function renderSicroDocToHtml(
  doc: SicroDoc,
  options: RenderOptions = {},
): string {
  const numbering = options.numbering ?? true;
  const fullDocument = options.fullDocument ?? false;

  const content = numbering
    ? numberFigures(doc.content)
    : (doc.content as JSONContent);
  const html = generateHTML(content, laudoExtensions());

  if (!fullDocument) {
    return html;
  }

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(doc.title)}</title>
    <style>${DOC_STYLES}</style>
  </head>
  <body>
    <article class="doc-shell">${html}</article>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
