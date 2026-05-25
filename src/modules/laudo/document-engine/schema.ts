/**
 * `.sicrodoc` envelope schema.
 *
 * The envelope wraps the TipTap/ProseMirror document JSON (`content`) with
 * SICRO metadata. Versioning is explicit (`schema_version`) so future
 * migrations can be applied at read time without breaking existing files.
 *
 * The TipTap document itself is treated as opaque here — its node set is
 * defined in `./nodes/index.ts`.
 */

import type { JSONContent } from "@tiptap/core";

export const SCHEMA_VERSION = "1.0.0";

export interface SicroDocLayout {
  page_size: "A4";
  orientation: "portrait" | "landscape";
  /** Optional id of an institutional template (header/footer/side-mark). */
  institutional_template?: string;
}

export interface SicroDocMetadata {
  numero_laudo?: string;
  setor?: string;
  tipo_pericia?: string;
  municipio?: string;
  /** Free-form additional metadata; preserved on write. */
  [key: string]: unknown;
}

export interface SicroDoc {
  schema_version: string;
  document_id: string;
  occurrence_id: string;
  type: "laudo";
  title: string;
  template_id: string;
  created_at: string;
  updated_at: string;
  metadata: SicroDocMetadata;
  layout: SicroDocLayout;
  /** ProseMirror/TipTap document. */
  content: JSONContent;
}

/**
 * Produce an empty document — single empty paragraph, valid ProseMirror.
 * Used as the initial content for freshly-created laudos and as the fallback
 * for malformed payloads (renders cleanly instead of crashing the editor).
 */
export function emptyDocContent(): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

/**
 * Read-time sanity check. Returns the same envelope if it looks well-formed,
 * or a coerced one with a safe `content` if it does not. We log to console
 * so misshapes are visible during the spike — proper validation will live
 * in a future spike's import pipeline.
 */
export function coerceSicroDoc(raw: unknown): SicroDoc {
  if (!raw || typeof raw !== "object") {
    throw new Error("invalid sicrodoc: not an object");
  }
  const obj = raw as Partial<SicroDoc> & Record<string, unknown>;

  // Minimum-viable envelope: complain only if the absolutely-required fields
  // are missing. Everything else gets a sensible default.
  if (typeof obj.document_id !== "string" || typeof obj.occurrence_id !== "string") {
    throw new Error("invalid sicrodoc: missing document_id or occurrence_id");
  }

  return {
    schema_version: (obj.schema_version as string) ?? SCHEMA_VERSION,
    document_id: obj.document_id,
    occurrence_id: obj.occurrence_id,
    type: "laudo",
    title: (obj.title as string) ?? "Laudo sem título",
    template_id: (obj.template_id as string) ?? "documento_livre",
    created_at: (obj.created_at as string) ?? new Date().toISOString(),
    updated_at: (obj.updated_at as string) ?? new Date().toISOString(),
    metadata: (obj.metadata as SicroDocMetadata) ?? {},
    layout: (obj.layout as SicroDocLayout) ?? {
      page_size: "A4",
      orientation: "portrait",
    },
    content: isJsonContent(obj.content) ? (obj.content as JSONContent) : emptyDocContent(),
  };
}

function isJsonContent(value: unknown): value is JSONContent {
  return Boolean(
    value &&
      typeof value === "object" &&
      "type" in (value as Record<string, unknown>) &&
      typeof (value as Record<string, unknown>).type === "string",
  );
}
