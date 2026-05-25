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
import type {
  ChecklistItem,
  DossieSummary,
  Entity,
  FieldNote,
  Measurement,
  OccurrenceStats,
  RehydrateOutcome,
  TimelineEvent,
  Trace,
} from "@domain/dossie";
import type {
  Croqui,
  CroquiDocPayload,
  ExportCroquiPngInput,
  NewCroquiInput,
} from "@domain/croqui";
import type {
  CollectFrameInput,
  CollectFrameResult,
  CreateVideoEventInput,
  RegisterVideoInput,
  UpdateStoryboardFrameInput,
  UpdateVideoEventInput,
  VideoBundle,
  VideoEvent,
  VideoMedia,
  VideoOperationLog,
  VideoStoryboardFrame,
} from "@domain/video";
import type {
  EvidenceAsset,
  EvidenceLink,
  RecordEvidenceLinkInput,
} from "@domain/evidence";
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

  // ----- Dossiê Operacional (MVP 3) -----

  /** Aggregated summary: occurrence + latest import + counts + stats. */
  getDossieSummary(workspacePath: string): Promise<DossieSummary> {
    return safeInvoke<DossieSummary>("get_dossie_summary", { workspacePath });
  },

  /** Same as listWorkspacePhotos — kept for symmetry with the rest of the dossier API. */
  listDossiePhotos(workspacePath: string): Promise<MediaAsset[]> {
    return safeInvoke<MediaAsset[]>("list_dossie_photos", { workspacePath });
  },

  listDossieChecklist(workspacePath: string): Promise<ChecklistItem[]> {
    return safeInvoke<ChecklistItem[]>("list_dossie_checklist", {
      workspacePath,
    });
  },

  listDossieEntities(workspacePath: string): Promise<Entity[]> {
    return safeInvoke<Entity[]>("list_dossie_entities", { workspacePath });
  },

  listDossieTraces(workspacePath: string): Promise<Trace[]> {
    return safeInvoke<Trace[]>("list_dossie_traces", { workspacePath });
  },

  listDossieMeasurements(workspacePath: string): Promise<Measurement[]> {
    return safeInvoke<Measurement[]>("list_dossie_measurements", {
      workspacePath,
    });
  },

  listDossieNotes(workspacePath: string): Promise<FieldNote[]> {
    return safeInvoke<FieldNote[]>("list_dossie_notes", { workspacePath });
  },

  listDossieTimeline(workspacePath: string): Promise<TimelineEvent[]> {
    return safeInvoke<TimelineEvent[]>("list_dossie_timeline", {
      workspacePath,
    });
  },

  getDossieStats(workspacePath: string): Promise<OccurrenceStats | null> {
    return safeInvoke<OccurrenceStats | null>("get_dossie_stats", {
      workspacePath,
    });
  },

  /**
   * Re-extract every dossier table from the staged
   * `imports/<id>/original_package.sicroapp`. Used by the "Recarregar
   * dados do pacote" button on the Import tab.
   */
  rehydrateDossie(workspacePath: string): Promise<RehydrateOutcome> {
    return safeInvoke<RehydrateOutcome>("rehydrate_dossie", { workspacePath });
  },

  // ----- Croqui (Spike E) -----

  /** Creates an empty .sicrocroqui + row in the `croquis` table. */
  createCroqui(
    workspacePath: string,
    input: NewCroquiInput,
  ): Promise<CroquiDocPayload> {
    return safeInvoke<CroquiDocPayload>("create_croqui", {
      workspacePath,
      input,
    });
  },

  /** Lists every croqui of the active occurrence (most recent first). */
  listCroquis(workspacePath: string): Promise<Croqui[]> {
    return safeInvoke<Croqui[]>("list_croquis", { workspacePath });
  },

  /** Reads a croqui (row + full .sicrocroqui envelope). */
  readCroqui(workspacePath: string, croquiId: string): Promise<CroquiDocPayload> {
    return safeInvoke<CroquiDocPayload>("read_croqui", {
      workspacePath,
      croquiId,
    });
  },

  /** Overwrites the .sicrocroqui on disk + bumps updated_at. */
  saveCroqui(
    workspacePath: string,
    croquiId: string,
    doc: unknown,
  ): Promise<Croqui> {
    return safeInvoke<Croqui>("save_croqui", {
      workspacePath,
      croquiId,
      doc,
    });
  },

  /**
   * Persist a PNG export produced by Konva.toDataURL(). Returns the
   * workspace-relative path of the saved PNG.
   */
  exportCroquiPng(
    workspacePath: string,
    croquiId: string,
    input: ExportCroquiPngInput,
  ): Promise<string> {
    return safeInvoke<string>("export_croqui_png", {
      workspacePath,
      croquiId,
      input,
    });
  },

  // ----- Video (Spike F) -----

  /**
   * Copies the user-picked video into `videos/originais/`, hashes it
   * (SHA-256), runs ffprobe and persists the metadata. Returns the
   * `VideoMedia` row.
   */
  registerVideoMedia(
    workspacePath: string,
    input: RegisterVideoInput,
  ): Promise<VideoMedia> {
    return safeInvoke<VideoMedia>("register_video_media", {
      workspacePath,
      input,
    });
  },

  /** Lists every video registered in the active occurrence. */
  listVideoMedia(workspacePath: string): Promise<VideoMedia[]> {
    return safeInvoke<VideoMedia[]>("list_video_media", { workspacePath });
  },

  /** Aggregated bundle (media + events + exports + storyboard). */
  openVideoMedia(workspacePath: string, mediaId: string): Promise<VideoBundle> {
    return safeInvoke<VideoBundle>("open_video_media", {
      workspacePath,
      mediaId,
    });
  },

  createVideoEvent(
    workspacePath: string,
    input: CreateVideoEventInput,
  ): Promise<VideoEvent> {
    return safeInvoke<VideoEvent>("create_video_event", {
      workspacePath,
      input,
    });
  },

  updateVideoEvent(
    workspacePath: string,
    eventId: string,
    input: UpdateVideoEventInput,
  ): Promise<VideoEvent> {
    return safeInvoke<VideoEvent>("update_video_event", {
      workspacePath,
      eventId,
      input,
    });
  },

  deleteVideoEvent(workspacePath: string, eventId: string): Promise<void> {
    return safeInvoke<void>("delete_video_event", { workspacePath, eventId });
  },

  /**
   * Extracts a single PNG frame via FFmpeg (NOT a screenshot of the
   * player). Writes the PNG + sidecar JSON to
   * `videos/storyboards/frames/` and persists `video_exports` +
   * `video_storyboard_frames`.
   */
  collectVideoFrame(
    workspacePath: string,
    input: CollectFrameInput,
  ): Promise<CollectFrameResult> {
    return safeInvoke<CollectFrameResult>("collect_video_frame", {
      workspacePath,
      input,
    });
  },

  updateStoryboardFrame(
    workspacePath: string,
    frameId: string,
    input: UpdateStoryboardFrameInput,
  ): Promise<VideoStoryboardFrame> {
    return safeInvoke<VideoStoryboardFrame>("update_storyboard_frame", {
      workspacePath,
      frameId,
      input,
    });
  },

  deleteStoryboardFrame(
    workspacePath: string,
    frameId: string,
    deletePng?: boolean,
  ): Promise<void> {
    return safeInvoke<void>("delete_storyboard_frame", {
      workspacePath,
      frameId,
      deletePng,
    });
  },

  listVideoOperationLogs(
    workspacePath: string,
    mediaHash: string,
    limit?: number,
  ): Promise<VideoOperationLog[]> {
    return safeInvoke<VideoOperationLog[]>("list_video_operation_logs", {
      workspacePath,
      mediaHash,
      limit,
    });
  },

  // ----- Evidência → Laudo (MVP 4) -----

  /**
   * Grava uma linha em `evidence_links` quando o perito insere uma
   * evidência no laudo. Os atributos completos continuam nos próprios
   * nodes do `.sicrodoc`; esta tabela é índice / audit log.
   */
  recordEvidenceLink(
    workspacePath: string,
    input: RecordEvidenceLinkInput,
  ): Promise<EvidenceLink> {
    return safeInvoke<EvidenceLink>("record_evidence_link", {
      workspacePath,
      input,
    });
  },

  listEvidenceLinksForLaudo(
    workspacePath: string,
    laudoId: string,
  ): Promise<EvidenceLink[]> {
    return safeInvoke<EvidenceLink[]>("list_evidence_links_for_laudo", {
      workspacePath,
      laudoId,
    });
  },

  /**
   * Lê bytes de um asset de evidência e retorna base64. Usado pelo
   * renderer para inlinear data URIs no HTML/PDF (não funciona com
   * convertFileSrc dentro de iframe srcdoc / headless Edge).
   */
  readEvidenceAsset(
    workspacePath: string,
    relativePath: string,
  ): Promise<EvidenceAsset> {
    return safeInvoke<EvidenceAsset>("read_evidence_asset", {
      workspacePath,
      relativePath,
    });
  },
} as const;

export type { SicroError };
