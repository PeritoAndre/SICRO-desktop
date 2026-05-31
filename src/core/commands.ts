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
  DroneImportInput,
  DroneImportResult,
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
import type {
  EvidenceRegistryItem,
  IntegrityReportArtifact,
  RegistrySummary,
  VerifyOptions,
  WorkspaceIntegrityReport,
} from "@domain/evidence_registry";
import type {
  ApplyOperationPreviewInput,
  ApplyOperationPreviewResult,
  ApplyOperationStackInput,
  ApplyOperationStackResult,
  CreateImageAnalysisInput,
  ExportImageInput,
  ImageAnalysis,
  ImageAnalysisPayload,
  ImageAnalysisReportArtifact,
  ImageAssetBytes,
  ImageExport,
  ImageHistogram,
  ImageMetadata,
  ImageOperationLog,
  ImportLocalImageInput,
  SaveImageAnalysisInput,
} from "@domain/image_analysis";
import type { PhotoImportResult } from "@domain/photo_drop";
import type {
  BackupArtifact,
  HealthReportArtifact,
  SystemHealthSnapshot,
} from "@domain/alpha";
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

  /**
   * Remove o laudo do workspace: apaga a linha em `laudos` e o
   * arquivo `.sicrodoc` em disco. Idempotente para o arquivo
   * (NotFound é tratado como sucesso). Grava `laudo.deleted` no
   * audit log antes da remoção.
   */
  deleteLaudo(workspacePath: string, laudoId: string): Promise<void> {
    return safeInvoke<void>("delete_laudo", {
      workspacePath,
      laudoId,
    });
  },

  /**
   * H — Importa um PDF assinado (gov.br ou SIGDOCS) de volta para o
   * workspace. Grava em `laudos/<id>/assinados/<filename>.pdf`,
   * computa SHA-256 e devolve metadados para o frontend persistir em
   * `doc.finalization.signature`.
   */
  importSignedPdf(
    workspacePath: string,
    input: {
      laudo_id: string;
      source_absolute_path: string;
      preferred_filename?: string | null;
    },
  ): Promise<{
    relative_path: string;
    sha256: string;
    size_bytes: number;
  }> {
    return safeInvoke("import_signed_pdf", { workspacePath, input });
  },

  // ----- I — Integração SIGDOCS -----

  /** Resolve a URL do SIGDOCS efetiva do workspace (manifest ou default). */
  getSigdocsUrl(
    workspacePath: string,
  ): Promise<{ url: string; source: "manifest" | "default" }> {
    return safeInvoke("get_sigdocs_url", { workspacePath });
  },

  /** Onda 1 — abre o SIGDOCS numa janela secundária do SO. */
  openSigdocsWindow(url?: string): Promise<void> {
    return safeInvoke("open_sigdocs_window", { url: url ?? null });
  },

  closeSigdocsWindow(): Promise<void> {
    return safeInvoke("close_sigdocs_window", {});
  },

  /**
   * Onda 3 — "Cover mode": abre o SIGDOC num webview borderless que
   * cobre EXATAMENTE a área de conteúdo do editor (entre topbar e
   * statusbar, à direita da rail). `bounds` em CSS px relativos ao
   * webview principal.
   */
  openSigdocsCover(
    url: string | null,
    bounds: { x: number; y: number; width: number; height: number },
  ): Promise<void> {
    return safeInvoke("open_sigdocs_cover", { url, bounds });
  },

  /** Reposiciona o cover quando a área disponível muda (resize, route change). */
  updateSigdocsCoverBounds(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<void> {
    return safeInvoke("update_sigdocs_cover_bounds", { bounds });
  },

  closeSigdocsCover(): Promise<void> {
    return safeInvoke("close_sigdocs_cover", {});
  },

  /**
   * Abre o Explorer do SO (Windows/macOS/Linux) na pasta de um
   * arquivo, selecionando-o. Usado quando o perito vai arrastar o
   * PDF exportado pra dentro do SIGDOC (que bloqueia Ctrl+V).
   */
  revealPathInExplorer(absolutePath: string): Promise<void> {
    return safeInvoke("reveal_path_in_explorer", { absolutePath });
  },

  // K — Credenciais SIGDOC (Windows Credential Manager)

  /**
   * Salva email + senha do SIGDOC no Windows Credential Manager
   * (criptografado per-user). O autofill é injetado automaticamente
   * quando o cover do SIGDOC abre.
   */
  saveSigdocCredentials(email: string, password: string): Promise<void> {
    return safeInvoke("save_sigdoc_credentials", { email, password });
  },

  /**
   * Lê o status das credenciais — retorna o email cadastrado e SE há
   * senha no keyring. NUNCA retorna a senha em si por segurança.
   */
  getSigdocCredentialsStatus(): Promise<{
    email: string | null;
    has_password: boolean;
  }> {
    return safeInvoke("get_sigdoc_credentials_status", {});
  },

  /** Remove email + senha do SIGDOC do storage. */
  deleteSigdocCredentials(): Promise<void> {
    return safeInvoke("delete_sigdoc_credentials", {});
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
   * Remove o croqui do workspace: apaga a linha em `croquis` e o
   * arquivo `.sicrocroqui` em disco. PNGs já exportados em
   * `croquis/exports/` NÃO são removidos (preservam o histórico
   * pericial). Grava `croqui.deleted` no audit log.
   */
  deleteCroqui(workspacePath: string, croquiId: string): Promise<void> {
    return safeInvoke<void>("delete_croqui", {
      workspacePath,
      croquiId,
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

  /**
   * MVP 9 Round 4 — Drone import.
   *
   * Reads an aerial photo, applies radial lens correction at the chosen
   * intensity, crops to the rectangle the user drew in the wizard,
   * persists the derivative + sidecar inside the workspace, and returns
   * the workspace-relative paths so the caller can drop the result as
   * a croqui background image.
   */
  importDroneImage(
    workspacePath: string,
    input: DroneImportInput,
  ): Promise<DroneImportResult> {
    return safeInvoke<DroneImportResult>("import_drone_image", {
      workspacePath,
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

  // ----- Central de Evidências + Integridade (MVP 5) -----

  /**
   * Read-only consolidated registry of every photo, croqui, video,
   * frame, laudo and export of the workspace. Cheap: no filesystem
   * verification is done here — `integrity_status` stays as
   * `"unknown"`. Use `verifyWorkspaceIntegrity` for the verified view.
   */
  listEvidenceRegistryItems(
    workspacePath: string,
  ): Promise<EvidenceRegistryItem[]> {
    return safeInvoke<EvidenceRegistryItem[]>(
      "list_evidence_registry_items",
      { workspacePath },
    );
  },

  /**
   * Counters used by the "Resumo" tab. Includes the lightweight
   * integrity probe so missing files / unsafe paths are reflected in
   * the totals.
   */
  getEvidenceRegistrySummary(
    workspacePath: string,
  ): Promise<RegistrySummary> {
    return safeInvoke<RegistrySummary>(
      "get_evidence_registry_summary",
      { workspacePath },
    );
  },

  /**
   * Full integrity check. Pass `{ deep: true }` to recompute SHA-256
   * for items that store a hash (slow on large videos).
   */
  verifyWorkspaceIntegrity(
    workspacePath: string,
    options?: VerifyOptions,
  ): Promise<WorkspaceIntegrityReport> {
    return safeInvoke<WorkspaceIntegrityReport>(
      "verify_workspace_integrity",
      { workspacePath, options: options ?? null },
    );
  },

  /** Lists every `evidence_links` row of the active occurrence. */
  listEvidenceLinks(workspacePath: string): Promise<EvidenceLink[]> {
    return safeInvoke<EvidenceLink[]>("list_evidence_links", {
      workspacePath,
    });
  },

  /** Open the file with the OS default handler. */
  openEvidenceFile(
    workspacePath: string,
    relativePath: string,
  ): Promise<void> {
    return safeInvoke<void>("open_evidence_file", {
      workspacePath,
      relativePath,
    });
  },

  /** Reveal the file in the platform file explorer. */
  revealEvidenceInFolder(
    workspacePath: string,
    relativePath: string,
  ): Promise<void> {
    return safeInvoke<void>("reveal_evidence_in_folder", {
      workspacePath,
      relativePath,
    });
  },

  /**
   * Run verification and persist an HTML report under `reports/`.
   * Returns the descriptor (relative path + status snapshot).
   */
  generateWorkspaceIntegrityReport(
    workspacePath: string,
    options?: VerifyOptions,
  ): Promise<IntegrityReportArtifact> {
    return safeInvoke<IntegrityReportArtifact>(
      "generate_workspace_integrity_report",
      { workspacePath, options: options ?? null },
    );
  },

  // ----- Editor de Imagem Pericial (MVP 7) -----

  createImageAnalysisFromEvidence(
    workspacePath: string,
    input: CreateImageAnalysisInput,
  ): Promise<ImageAnalysis> {
    return safeInvoke<ImageAnalysis>(
      "create_image_analysis_from_evidence",
      { workspacePath, input },
    );
  },

  createImageAnalysisFromFile(
    workspacePath: string,
    input: ImportLocalImageInput,
  ): Promise<ImageAnalysis> {
    return safeInvoke<ImageAnalysis>("create_image_analysis_from_file", {
      workspacePath,
      input,
    });
  },

  /**
   * O — Drag & drop de fotos no editor de laudo. Recebe um lote de
   * paths de arquivo (vindos do `onDragDropEvent` do Tauri). Para cada
   * foto: copia pra `<workspace>/laudos/<id>/evidencias/photos/`,
   * calcula SHA-256, lê dimensões + EXIF, escreve sidecar JSON, e
   * retorna metadata pra inserir no doc.
   *
   * O command NUNCA aborta o lote: itens inválidos vão no array
   * `errors` com a razão; itens válidos vão no `imported`.
   */
  importDraggedPhotosToLaudo(
    workspacePath: string,
    laudoId: string,
    filePaths: string[],
  ): Promise<PhotoImportResult> {
    return safeInvoke<PhotoImportResult>("import_dragged_photos_to_laudo", {
      input: {
        workspace_path: workspacePath,
        laudo_id: laudoId,
        file_paths: filePaths,
      },
    });
  },

  /**
   * T — Paste (Ctrl+V) de fotos no editor de laudo. Mesma fundação do
   * drag&drop, mas as fotos vêm como bytes (base64) em vez de paths.
   * Cobre dois casos do clipboard:
   *   1. Bitmap raw (screenshot do Windows, "copy image" do browser).
   *   2. Arquivo copiado do Explorer entregue como `File` pelo
   *      `DataTransfer.files` no evento `paste`.
   *
   * O command NUNCA aborta o lote: bytes inválidos vão no array `errors`.
   */
  importPastedPhotosToLaudo(
    workspacePath: string,
    laudoId: string,
    photos: { bytes_base64: string; filename: string }[],
  ): Promise<PhotoImportResult> {
    return safeInvoke<PhotoImportResult>("import_pasted_photos_to_laudo", {
      input: {
        workspace_path: workspacePath,
        laudo_id: laudoId,
        photos,
      },
    });
  },

  listImageAnalyses(workspacePath: string): Promise<ImageAnalysis[]> {
    return safeInvoke<ImageAnalysis[]>("list_image_analyses", {
      workspacePath,
    });
  },

  readImageAnalysis(
    workspacePath: string,
    analysisId: string,
  ): Promise<ImageAnalysisPayload> {
    return safeInvoke<ImageAnalysisPayload>("read_image_analysis", {
      workspacePath,
      analysisId,
    });
  },

  saveImageAnalysis(
    workspacePath: string,
    analysisId: string,
    input: SaveImageAnalysisInput,
  ): Promise<ImageAnalysis> {
    return safeInvoke<ImageAnalysis>("save_image_analysis", {
      workspacePath,
      analysisId,
      input,
    });
  },

  exportImageDerivative(
    workspacePath: string,
    analysisId: string,
    input: ExportImageInput,
  ): Promise<ImageExport> {
    return safeInvoke<ImageExport>("export_image_derivative", {
      workspacePath,
      analysisId,
      input,
    });
  },

  readImageAsset(
    workspacePath: string,
    relativePath: string,
  ): Promise<ImageAssetBytes> {
    return safeInvoke<ImageAssetBytes>("read_image_asset", {
      workspacePath,
      relativePath,
    });
  },

  getImageMetadata(
    workspacePath: string,
    relativePath: string,
    computeHash?: boolean,
  ): Promise<ImageMetadata> {
    return safeInvoke<ImageMetadata>("get_image_metadata", {
      workspacePath,
      relativePath,
      computeHash: computeHash ?? false,
    });
  },

  listImageOperationLogs(
    workspacePath: string,
    analysisId: string,
    limit?: number,
  ): Promise<ImageOperationLog[]> {
    return safeInvoke<ImageOperationLog[]>("list_image_operation_logs", {
      workspacePath,
      analysisId,
      limit,
    });
  },

  // ----- G12 — Image Engine Pro -----

  /**
   * G12.9 — Calcula histograma (256 bins R/G/B/Lum) + estatísticas
   * de uma imagem do workspace.
   */
  computeImageHistogram(
    workspacePath: string,
    relativePath: string,
  ): Promise<ImageHistogram> {
    return safeInvoke<ImageHistogram>("compute_image_histogram", {
      workspacePath,
      relativePath,
    });
  },

  /**
   * G12 — Preview rápido de uma única operação. Recebe a imagem corrente
   * em base64 (PNG), aplica a operação, devolve PNG base64. Não persiste
   * nada — usado pelos panels para mostrar antes/depois.
   */
  applyOperationPreview(
    input: ApplyOperationPreviewInput,
  ): Promise<ApplyOperationPreviewResult> {
    return safeInvoke<ApplyOperationPreviewResult>(
      "apply_operation_preview",
      { input },
    );
  },

  /**
   * G12 — Aplica uma pilha de operações sobre a imagem original.
   * Útil para o ProcessingStackPanel mostrar resultado consolidado.
   */
  applyOperationStack(
    workspacePath: string,
    input: ApplyOperationStackInput,
  ): Promise<ApplyOperationStackResult> {
    return safeInvoke<ApplyOperationStackResult>("apply_operation_stack", {
      workspacePath,
      input,
    });
  },

  /**
   * G12.21 — Gera relatório HTML de análise pericial. Backend coleta
   * tudo (EXIF, hashes, ops, logs, thumbnail) e produz HTML auto-contido
   * gravado em `imagens/relatorios/`.
   */
  generateImageAnalysisReport(
    workspacePath: string,
    analysisId: string,
  ): Promise<ImageAnalysisReportArtifact> {
    return safeInvoke<ImageAnalysisReportArtifact>(
      "generate_image_analysis_report",
      { workspacePath, analysisId },
    );
  },

  // ----- Consolidação Alpha (MVP 8) -----

  /**
   * Gera um `.sicrobackup` (ZIP) do workspace ativo. `destination`
   * opcional escolhe outra pasta; padrão é `<workspace>/backups/`.
   * `boLabel` ajuda o nome do arquivo.
   */
  generateWorkspaceBackup(
    workspacePath: string,
    destination?: string,
    boLabel?: string,
  ): Promise<BackupArtifact> {
    return safeInvoke<BackupArtifact>("generate_workspace_backup", {
      workspacePath,
      destination: destination ?? null,
      boLabel: boLabel ?? null,
    });
  },

  /**
   * Snapshot rápido (JSON) do estado de saúde do app — versão do app,
   * dependências externas, contadores do workspace ativo, integridade.
   */
  getSystemHealthSnapshot(
    workspacePath?: string | null,
  ): Promise<SystemHealthSnapshot> {
    return safeInvoke<SystemHealthSnapshot>("get_system_health_snapshot", {
      workspacePath: workspacePath ?? null,
    });
  },

  /**
   * Grava o relatório de saúde como HTML auto-suficiente em
   * `<workspace>/reports/system_health_<TS>.html` e retorna o
   * descritor.
   */
  generateSystemHealthReport(
    workspacePath?: string | null,
  ): Promise<HealthReportArtifact> {
    return safeInvoke<HealthReportArtifact>(
      "generate_system_health_report",
      { workspacePath: workspacePath ?? null },
    );
  },
} as const;

export type { SicroError };
