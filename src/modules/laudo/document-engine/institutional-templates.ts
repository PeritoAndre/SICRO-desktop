/**
 * Institutional templates — the visual "chrome" of an official laudo
 * (header, footer, side mark, page margins). This is configuration,
 * NOT editable content. It lives in `SicroDoc.layout.institutional_template`
 * and is consumed by:
 *
 *   - the editor's `EditorPage` (decoration around the A4 sheet);
 *   - the HTML/PDF renderer (wrapper markup + @page CSS);
 *   - the DOCX walker (docx-rs Header / Footer; side mark is intentionally
 *     omitted in DOCX — see SPIKE_C / MVP2 reports for the rationale).
 *
 * Adding a new institutional template:
 *   1. Append it to TEMPLATES below;
 *   2. Make sure the renderer and the DOCX walker know its `id`;
 *   3. UX for selecting it lives in the future Configurações module.
 *
 * For the MVP 2 spike only `pca_padrao_v1` ships.
 */

export type InstitutionalTemplateId = "pca_padrao_v1";

export interface InstitutionalPage {
  size: "A4";
  orientation: "portrait" | "landscape";
  margins: { top: string; right: string; bottom: string; left: string };
}

export interface InstitutionalHeader {
  /** Lines of bold uppercase text at the top of every page. */
  brand_lines: string[];
  /** Optional sub-line (address, department, etc.). */
  subtitle?: string;
  /** Metadata fields from the occurrence/laudo to expose in a small grid
   *  below the brand lines. Keys must match field names in `Occurrence` or
   *  `SicroDocMetadata`. */
  metadata_fields: ReadonlyArray<{
    label: string;
    /** Either "occurrence.<field>" or "metadata.<field>". */
    source: string;
  }>;
}

export interface InstitutionalFooter {
  /** Static text on the left side of the footer. */
  text: string;
  /** Whether to render "Folha X de Y" on the right side. */
  show_page_numbers: boolean;
}

export interface InstitutionalSideMark {
  /** Vertical text written along the left margin. */
  text: string;
  position: "left";
}

export interface InstitutionalTemplate {
  id: InstitutionalTemplateId;
  name: string;
  page: InstitutionalPage;
  header: InstitutionalHeader;
  footer: InstitutionalFooter;
  side_mark: InstitutionalSideMark | null;
}

// ---------------------------------------------------------------------------
// Templates shipped with the MVP 2.

export const PCA_PADRAO_V1: InstitutionalTemplate = {
  id: "pca_padrao_v1",
  name: "PCA — Padrão",
  page: {
    size: "A4",
    orientation: "portrait",
    margins: {
      // Slightly tighter than the SICRO defaults so the side mark has room
      // without colliding with the body text.
      top: "3cm",
      right: "2cm",
      bottom: "2.5cm",
      left: "3.5cm",
    },
  },
  header: {
    brand_lines: [
      "GOVERNO DO ESTADO DO AMAPÁ",
      "POLÍCIA CIENTÍFICA DO AMAPÁ",
      "DEPARTAMENTO DE CRIMINALÍSTICA",
    ],
    metadata_fields: [
      { label: "Laudo nº", source: "metadata.numero_laudo" },
      { label: "BO nº", source: "occurrence.numero_bo" },
      { label: "Tipo de perícia", source: "occurrence.tipo_pericia" },
      { label: "Município", source: "occurrence.municipio" },
    ],
  },
  footer: {
    text: "Documento gerado pelo SICRO 2.0 — versão preliminar (MVP 2).",
    show_page_numbers: true,
  },
  side_mark: {
    text: "POLÍCIA CIENTÍFICA DO ESTADO DO AMAPÁ",
    position: "left",
  },
};

export const INSTITUTIONAL_TEMPLATES: ReadonlyArray<InstitutionalTemplate> = [
  PCA_PADRAO_V1,
];

export function findInstitutionalTemplate(
  id: string | null | undefined,
): InstitutionalTemplate {
  return (
    INSTITUTIONAL_TEMPLATES.find((t) => t.id === id) ?? PCA_PADRAO_V1
  );
}

/**
 * Resolve a `metadata.<field>` or `occurrence.<field>` reference into the
 * actual value, given the current `SicroDoc.metadata` and the active
 * `Occurrence`. Returns an empty string when the reference can't be solved
 * — header rendering tolerates missing values gracefully.
 */
export function resolveHeaderField(
  source: string,
  metadata: Record<string, unknown>,
  occurrence: Record<string, unknown> | null,
): string {
  const [scope, ...rest] = source.split(".");
  const field = rest.join(".");
  if (!scope || !field) return "";
  const bag =
    scope === "metadata"
      ? metadata
      : scope === "occurrence"
        ? occurrence ?? {}
        : null;
  if (!bag) return "";
  const value = bag[field];
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return String(value);
}
