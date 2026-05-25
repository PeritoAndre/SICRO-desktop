/**
 * Mirror of `src-tauri/src/models/croqui.rs` (Spike E — Croqui Engine).
 * Field names stay snake_case so serde defaults line up with the wire.
 *
 * The `doc` JSON envelope is owned by the frontend Croqui Engine
 * (see `src/modules/croqui/engine/schema.ts`). Rust treats it as opaque.
 */

export type CroquiStatus = "draft" | "ready" | "archived";

export interface Croqui {
  id: string;
  occurrence_id: string;
  title: string;
  relative_path: string;
  status: CroquiStatus;
  schema_version: string;
  last_export_relative_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface CroquiDocPayload {
  croqui: Croqui;
  /** Opaque .sicrocroqui JSON — the frontend Croqui Engine validates the shape. */
  doc: unknown;
}

export interface NewCroquiInput {
  title: string;
}

export interface ExportCroquiPngInput {
  /** Base64-encoded PNG bytes (Konva's toDataURL() output works after stripping the data: prefix). */
  png_base64: string;
}
