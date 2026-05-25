/**
 * Thin wrappers around Tauri's `invoke`. The UI must NOT call `invoke`
 * directly — go through this module so:
 *   1. Command names are typed and centralized;
 *   2. Errors are normalized into `SicroError`;
 *   3. Future cross-cutting concerns (logging, retries) have one place to land.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  LoadedOccurrence,
  NewOccurrenceInput,
  Occurrence,
  RecentOccurrence,
} from "@domain/occurrence";
import type { Laudo, LaudoDocPayload, NewLaudoInput } from "@domain/laudo";
import type { Export } from "@domain/export";
import type {
  Import,
  ImportReport,
  ImportResult,
  ImportSicroappInput,
  MediaAsset,
} from "@domain/import";
import { toSicroError, type SicroError } from "./errors";

async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args ?? {});
  } catch (err) {
    throw toSicroError(err);
  }
}

export const commands = {
  /** Returns the currently loaded occurrence for a given workspace path. */
  getOccurrence(workspacePath: string): Promise<Occurrence> {
    return safeInvoke<Occurrence>("get_occurrence", {
      workspacePath,
    });
  },

  /** Creates a fresh .sicro workspace with an initial occurrence row. */
  createOccurrence(input: NewOccurrenceInput): Promise<LoadedOccurrence> {
    return safeInvoke<LoadedOccurrence>("create_occurrence", { input });
  },

  /** Opens an existing .sicro workspace. */
  openOccurrence(workspacePath: string): Promise<LoadedOccurrence> {
    return safeInvoke<LoadedOccurrence>("open_occurrence", {
      workspacePath,
    });
  },

  /** Returns the list of recently opened workspaces (newest first). */
  listRecentOccurrences(): Promise<RecentOccurrence[]> {
    return safeInvoke<RecentOccurrence[]>("list_recent_occurrences");
  },

  /** Removes an entry from the recents list (does NOT delete the workspace on disk). */
  forgetRecentOccurrence(workspaceId: string): Promise<void> {
    return safeInvoke<void>("forget_recent_occurrence", { workspaceId });
  },

  // ----- Laudo (Spike B) -----

  /** Creates a fresh laudo row + empty .sicrodoc on disk. */
  createLaudo(
    workspacePath: string,
    input: NewLaudoInput,
  ): Promise<LaudoDocPayload> {
    return safeInvoke<LaudoDocPayload>("create_laudo", {
      workspacePath,
      input,
    });
  },

  /** Lists every laudo registered in the workspace's SQLite. */
  listLaudos(workspacePath: string): Promise<Laudo[]> {
    return safeInvoke<Laudo[]>("list_laudos", { workspacePath });
  },

  /** Reads a laudo (row + full .sicrodoc envelope). */
  readLaudo(workspacePath: string, laudoId: string): Promise<LaudoDocPayload> {
    return safeInvoke<LaudoDocPayload>("read_laudo", {
      workspacePath,
      laudoId,
    });
  },

  /** Overwrites the `.sicrodoc` on disk and bumps `updated_at`. */
  saveLaudo(
    workspacePath: string,
    laudoId: string,
    doc: unknown,
  ): Promise<Laudo> {
    return safeInvoke<Laudo>("save_laudo", {
      workspacePath,
      laudoId,
      doc,
    });
  },

  // ----- Export (Spike C) -----

  /** Writes the rendered HTML to `<workspace>/exports/html/`. */
  exportLaudoHtml(
    workspacePath: string,
    laudoId: string,
    html: string,
  ): Promise<Export> {
    return safeInvoke<Export>("export_laudo_html", {
      workspacePath,
      laudoId,
      html,
    });
  },

  /** Renders the HTML to PDF via headless Edge and writes to `exports/pdf/`. */
  exportLaudoPdf(
    workspacePath: string,
    laudoId: string,
    html: string,
  ): Promise<Export> {
    return safeInvoke<Export>("export_laudo_pdf", {
      workspacePath,
      laudoId,
      html,
    });
  },

  /** Walks the `.sicrodoc` and produces a DOCX in `exports/docx/`. */
  exportLaudoDocx(
    workspacePath: string,
    laudoId: string,
  ): Promise<Export> {
    return safeInvoke<Export>("export_laudo_docx", {
      workspacePath,
      laudoId,
    });
  },

  /** Lists every export already produced for a given laudo (newest first). */
  listLaudoExports(
    workspacePath: string,
    laudoId: string,
  ): Promise<Export[]> {
    return safeInvoke<Export[]>("list_laudo_exports", {
      workspacePath,
      laudoId,
    });
  },

  // ----- Importer (Spike D — .sicroapp) -----

  /**
   * Open a .sicroapp picked by the user, validate it, and materialise it
   * into a fresh .sicro workspace. The full ImportReport is included in
   * the response so the UI can display the summary immediately without a
   * second round-trip.
   */
  importSicroapp(input: ImportSicroappInput): Promise<ImportResult> {
    return safeInvoke<ImportResult>("import_sicroapp", { input });
  },

  /** Lists every import row stored in a workspace's SQLite. */
  listWorkspaceImports(workspacePath: string): Promise<Import[]> {
    return safeInvoke<Import[]>("list_workspace_imports", { workspacePath });
  },

  /** Reads the persisted import_report.json from disk. */
  readImportReport(
    workspacePath: string,
    importId: string,
  ): Promise<ImportReport> {
    return safeInvoke<ImportReport>("read_import_report", {
      workspacePath,
      importId,
    });
  },

  /** Lists the photos imported into a workspace (newest captured first). */
  listWorkspacePhotos(workspacePath: string): Promise<MediaAsset[]> {
    return safeInvoke<MediaAsset[]>("list_workspace_photos", { workspacePath });
  },
} as const;

export type { SicroError };
