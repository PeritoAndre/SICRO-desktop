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
// N10 — Cabeçalho dinâmico usa as MESMAS extensões reduzidas do editor
// interativo do header (instância TipTap dedicada em useHeaderEditor).
import { headerExtensions } from "./header-extensions";
import type { SicroDoc, SicroDocPageMargins } from "./schema";
import { numberFigures } from "./numbering";
import {
  inlineEvidenceAssets,
  type EvidenceAssetMap,
} from "./evidence-assets";
import {
  findInstitutionalTemplate,
  type InstitutionalTemplate,
} from "./institutional-templates";
// N — `resolveHeaderField` REMOVIDO do renderer: era usado apenas dentro do
// antigo `renderHeader()` que injetava a banda institucional hardcoded.
// O cabeçalho agora é dinâmico, lido de `doc.header.content` (N10).
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

  /* ---- N10 — Cabecalho DINAMICO Word-style ----
   * header.sicro-doc-page-header empacota o conteudo de doc.header.content
   * serializado via generateHTML(headerExtensions()). A faixa fica colada
   * no topo da pagina (dentro da area de margem superior) e usa cascata
   * de tipografia identica ao body. Em PDF (Edge headless) a regra
   * @page running() abaixo repete esse mesmo header em todas as paginas
   * automaticamente — sem precisar replicar o markup. */
  header.sicro-doc-page-header {
    position: running(sicroHeader);
    width: 100%;
    height: var(--sicro-header-height, 2.5cm);
    /* Pós-laudo U — overflow visível pra TextBoxes/Figures dentro do
     * cabeçalho poderem extender pra fora da altura nominal (caso típico:
     * texto vertical lateral + logo no canto da página, ambos parte do
     * cabeçalho replicado). Mesmo do editor (.region overflow:visible). */
    overflow: visible;
    border-bottom: 0.5pt solid #999;
    padding: 0.1cm 0 0.15cm;
    font-family: "Times New Roman", Cambria, serif;
    font-size: 11pt;
    color: #111;
  }
  header.sicro-doc-page-header p {
    margin: 0 0 0.15em;
    line-height: 1.3;
    /* N18 — Parágrafos vazios (enters extras pra empurrar verticalmente
     * o conteúdo) precisam reservar altura. Sem isso, o PDF colapsa o
     * <p></p> a zero e o layout some. */
    min-height: 1.3em;
  }
  header.sicro-doc-page-header img.sicro-header-image,
  header.sicro-doc-page-header img {
    max-height: 90%;
    object-fit: contain;
    vertical-align: middle;
  }
  @page {
    @top-center {
      content: element(sicroHeader);
    }
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

  /* F12.8 — Bloco de verificação (última seção do documento). */
  section.sicro-doc-verify {
    display: grid;
    grid-template-columns: 3.5cm 1fr;
    gap: 0.6cm;
    margin-top: 2em;
    padding-top: 1em;
    border-top: 0.4pt solid #888;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  section.sicro-doc-verify .sicro-doc-verify-qr img {
    width: 3.2cm;
    height: 3.2cm;
    display: block;
    border: 0.4pt solid #ccc;
    padding: 0.1cm;
    background: #fff;
  }
  section.sicro-doc-verify .sicro-doc-verify-text {
    font-size: 9.5pt;
    line-height: 1.4;
  }
  section.sicro-doc-verify .sicro-doc-verify-text strong {
    font-size: 10pt;
    display: block;
    margin-bottom: 0.2em;
  }
  section.sicro-doc-verify .sicro-doc-verify-text p {
    margin: 0 0 0.4em;
    font-size: 9pt;
    color: #333;
  }
  section.sicro-doc-verify .sicro-doc-verify-text dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 8px;
    margin: 0;
    font-size: 9pt;
  }
  section.sicro-doc-verify .sicro-doc-verify-text dt {
    color: #555;
    font-weight: 600;
    margin: 0;
  }
  section.sicro-doc-verify .sicro-doc-verify-text dd {
    margin: 0;
    color: #111;
  }
  section.sicro-doc-verify .sicro-doc-verify-text code {
    font-family: "Courier New", monospace;
    font-size: 8.5pt;
  }
`;

function pageStyles(
  template: InstitutionalTemplate,
  margins: SicroDocPageMargins,
): string {
  // F12.7 — Print/PDF polido:
  //   - @page com header/footer institucional em TODAS as páginas
  //     (não só na primeira, via @top-center e @bottom-*).
  //   - "Página N de M" no rodapé direito.
  //   - Title institucional no topo central (legível, fonte serifa).
  //   - first/named pages: ":first" tira o counter da página 1 quando
  //     não desejado (mantemos sempre — auditável).
  //   - widows/orphans = 3 para evitar linhas órfãs.
  const showFooter = template.footer.show_page_numbers;
  const brandTop = template.header.brand_lines[0] ?? "";
  return `
    @page {
      size: ${template.page.size} ${template.page.orientation};
      margin: ${margins.top} ${margins.right} ${margins.bottom} ${margins.left};

      @top-center {
        content: "${escapeCssString(brandTop)}";
        font-family: "Times New Roman", Cambria, serif;
        font-size: 9pt;
        color: #555;
        padding-bottom: 0.2cm;
        border-bottom: 0.4pt solid #aaa;
        margin-bottom: 0.4cm;
      }
      ${
        showFooter
          ? `@bottom-right {
               content: "Página " counter(page) " de " counter(pages);
               font-family: "Times New Roman", Cambria, serif;
               font-size: 9pt;
               color: #444;
             }
             @bottom-left {
               content: "${escapeCssString(template.footer.text)}";
               font-family: "Times New Roman", Cambria, serif;
               font-size: 8.5pt;
               color: #555;
             }`
          : ""
      }
    }

    /* F12.7 — Primeira página suprime o @top-center
       (o header completo institucional cobre o topo). */
    @page :first {
      @top-center {
        content: none;
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

    /* F12.7 — Controles de quebra para print/PDF. */
    @media print {
      body {
        background: #fff !important;
        color: #000 !important;
      }
      p, li {
        widows: 3;
        orphans: 3;
      }
      h1, h2, h3 {
        page-break-after: avoid;
      }
      h1 + p, h2 + p, h3 + p {
        page-break-before: avoid;
      }
      figure, table, section[data-sicro-quesito-item],
      section[data-sicro-signature], article[data-sicro-storyboard-item] {
        page-break-inside: avoid;
      }
      /* Header institucional só na primeira página visual
         (as outras usam @top-center via @page). */
      .sicro-screen-only,
      footer.sicro-doc-footer .sicro-screen-page {
        display: none !important;
      }
    }
  `;
}

/** Escapa string para uso seguro dentro de `content: "..."` em CSS. */
function escapeCssString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
  /** F12.8 — QR Code de verificação como Data URI PNG. Quando presente,
   *  é embutido no rodapé do documento exportado. Computado externamente
   *  via `renderVerificationQrPngDataUri` antes de chamar o renderer
   *  (assíncrono, não pode ser feito aqui em sync). */
  verificationQrDataUri?: string | null;
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

  // N10 — Cabeçalho DINÂMICO: serializa `doc.header.content` (ProseMirror
  // JSON) usando `headerExtensions()` — mesma máquina que o editor usa.
  // Só emite quando `doc.header.enabled === true`. Os params legados
  // (template/metadata/occurrence/branding) continuam consumidos pra
  // não quebrar a assinatura pública de `renderSicroDocToHtml` enquanto
  // a migração N12 não promove o conteúdo do `institutional_template`
  // pra dentro de `doc.header.content`.
  void template;
  void metadata;
  void occurrence;
  void branding;
  const headerHtml = renderDynamicHeader(doc);
  const footerHtml = renderFooter(template);
  const sideMarkHtml = renderSideMark(template);
  // F12.8 — Verificação por QR Code (só aparece quando o laudo foi
  // finalizado E o caller pré-renderizou o QR como Data URI).
  const verificationHtml =
    doc.finalization && options.verificationQrDataUri
      ? renderVerificationBlock(doc, options.verificationQrDataUri)
      : "";

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
    ${verificationHtml}
    ${footerHtml}
  </body>
</html>`;
}

/**
 * F12.8 — Bloco de verificação na última página do documento. Inclui
 * o QR + texto curto explicando como verificar. Estilizado para impressão
 * (sem cor extra, fundo branco).
 */
function renderVerificationBlock(
  doc: SicroDoc,
  qrDataUri: string,
): string {
  if (!doc.finalization) return "";
  const shortHash = `${doc.finalization.content_hash.slice(0, 16)}…`;
  const finalizedDate = new Date(doc.finalization.finalized_at).toLocaleString(
    "pt-BR",
  );
  return `<section class="sicro-doc-verify" aria-label="Verificação do laudo">
    <div class="sicro-doc-verify-qr">
      <img src="${qrDataUri}" alt="QR Code de verificação" />
    </div>
    <div class="sicro-doc-verify-text">
      <strong>Documento verificável</strong>
      <p>
        Este laudo possui selo digital. Aponte a câmera de um dispositivo
        de confiança para o QR ao lado para conferir sua autenticidade.
      </p>
      <dl>
        <dt>ID</dt><dd>${escapeHtml(doc.document_id.slice(0, 8))}</dd>
        <dt>Hash SHA-256</dt><dd><code>${escapeHtml(shortHash)}</code></dd>
        <dt>Finalizado em</dt><dd>${escapeHtml(finalizedDate)}</dd>
        <dt>Por</dt><dd>${escapeHtml(doc.finalization.finalized_by)}</dd>
      </dl>
    </div>
  </section>`;
}

/**
 * N10 — Cabeçalho dinâmico para export HTML/PDF.
 *
 * Lê `doc.header.content` (ProseMirror JSON) e serializa via
 * `generateHTML(headerExtensions())` — exatamente a mesma cadeia que o
 * editor interativo usa, então o WYSIWYG é fiel.
 *
 * Para PDF (Edge headless) este HTML será REPETIDO em todas as páginas
 * via `@page { @top-center { content: element(sicroHeader) } }` —
 * regra CSS está no `pageStyles` (vide renderer.ts:pageStyles). Para
 * HTML preview (uma única página contínua), o header aparece uma vez
 * no topo do `<body>`.
 *
 * Retorna string vazia quando `header.enabled === false` ou conteúdo
 * vazio — não polui o output.
 */
function renderDynamicHeader(doc: SicroDoc): string {
  const header = doc.header;
  if (!header || !header.enabled) return "";
  const heightCm =
    doc.layout?.header_height_cm ??
    /* fallback ao default da schema se ausente */ 2.5;

  // Heuristic: emite a faixa SOMENTE quando há conteúdo "real" no header
  // (texto não-vazio OU pelo menos uma imagem). Empty stubs (single
  // empty paragraph, parágrafos só com whitespace) NÃO geram faixa pra
  // evitar uma banda em branco no PDF. Checagem é feita na árvore
  // ProseMirror direto — mais robusto que comparar strings HTML.
  if (!hasMeaningfulHeaderContent(header.content)) return "";

  let inner = "";
  try {
    inner = generateHTML(header.content, headerExtensions());
  } catch {
    inner = "";
  }
  if (!inner.trim()) return "";
  return `<header class="sicro-doc-page-header" style="--sicro-header-height:${heightCm.toFixed(2)}cm">${inner}</header>`;
}

/** True se a árvore ProseMirror contém pelo menos um text node não-vazio
 *  ou uma image. Aceita qualquer profundidade. */
function hasMeaningfulHeaderContent(node: JSONContent | undefined): boolean {
  if (!node) return false;
  if (node.type === "text") {
    return typeof node.text === "string" && node.text.trim().length > 0;
  }
  if (node.type === "image") return true;
  const children = node.content;
  if (!Array.isArray(children)) return false;
  return children.some((c) => hasMeaningfulHeaderContent(c));
}

// N — `renderHeader()` (versão antiga, institucional hardcoded) REMOVIDO em N3.
//   - lia `template.header.brand_lines`, `subtitle`, `metadata_fields`
//   - chamava `resolveHeaderField()` para preencher campos dinâmicos
//   - emitia `<img class="sicro-brand-img-pca/estado">` dos `branding` assets
//   - retornava `<header class="sicro-doc-header">…</header>` hardcoded
// Em N10 será reintroduzida como `renderDynamicHeader(header, layout)` que
// serializa `header.content` (ProseMirror) via `generateHTML(laudoExtensions)`
// — mesmo pipeline do body, com altura controlada por `layout.header_height_cm`.

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
  // N18 — Side mark vertical desativado. Antes emitia o `<aside>` com o
  // texto "POLÍCIA CIENTÍFICA DO ESTADO DO AMAPÁ" pela esquerda. A info
  // institucional agora vive no cabeçalho dinâmico (`doc.header.content`),
  // editado pelo próprio usuário. A função é mantida pra evitar
  // refatoração maior no call site mas retorna string vazia.
  void template;
  return "";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
