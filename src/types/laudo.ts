/**
 * Mirror of `src-tauri/src/models/laudo.rs`.
 * Field names use snake_case to match the JSON over the Tauri bridge.
 */

export type LaudoStatus =
  | "rascunho"
  | "revisado"
  | "exportado"
  | "assinado"
  | "arquivado";

export interface Laudo {
  id: string;
  occurrence_id: string;
  title: string;
  template_id: string;
  relative_path: string;
  status: LaudoStatus;
  created_at: string;
  updated_at: string;
  last_export_pdf: string | null;
  last_export_docx: string | null;
}

export interface NewLaudoInput {
  title: string;
  template_id?: string;
}

/**
 * Payload returned by `create_laudo` / `read_laudo` and accepted by
 * `save_laudo`. The `doc` field is the full `.sicrodoc` envelope (as JSON,
 * before front-end coercion). Use `coerceSicroDoc()` from the Document
 * Engine to convert it into the typed `SicroDoc`.
 */
export interface LaudoDocPayload {
  laudo: Laudo;
  doc: unknown;
}
