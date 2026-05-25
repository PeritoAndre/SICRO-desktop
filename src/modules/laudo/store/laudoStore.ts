/**
 * laudoStore — holds the list of laudos of the active workspace plus the
 * currently-open laudo. Kept lean — heavy editor state lives in the TipTap
 * editor instance itself.
 */

import { create } from "zustand";
import type { JSONContent } from "@tiptap/core";
import { commands } from "@core/commands";
import { toSicroError, type SicroError } from "@core/errors";
import {
  coerceSicroDoc,
  normalizeEvidenceSrcsForSave,
  resolveEvidenceSrcsForEditor,
  type SicroDoc,
  type SicroDocLayout,
} from "../document-engine";
import type { Laudo, NewLaudoInput } from "@domain/laudo";

interface LaudoState {
  list: Laudo[];
  isLoadingList: boolean;
  isMutating: boolean;

  currentLaudo: Laudo | null;
  currentDoc: SicroDoc | null;

  lastError: SicroError | null;

  loadList: (workspacePath: string) => Promise<void>;
  /**
   * Create a fresh laudo. When `initialContent` is provided (typically the
   * result of `findTemplate(id).build(...)`), it is written to the new
   * `.sicrodoc` immediately after creation — so the file on disk matches
   * what the editor will show. `initialMetadata` is merged into the envelope
   * metadata and is the place where MVP 2 stores `numero_laudo` / `setor`
   * from the NewLaudoDialog.
   */
  createLaudo: (
    workspacePath: string,
    input: NewLaudoInput,
    initialContent?: JSONContent,
    initialMetadata?: Record<string, unknown>,
  ) => Promise<Laudo>;
  openLaudo: (workspacePath: string, laudoId: string) => Promise<SicroDoc>;
  saveCurrent: (
    workspacePath: string,
    content: SicroDoc["content"],
  ) => Promise<Laudo>;
  /**
   * Patch `currentDoc.metadata` and persist via `save_laudo`. Used by the
   * Inspector "Cabeçalho" tab so the institutional header (numero_laudo,
   * setor, etc.) can be edited without touching the editable content.
   */
  updateMetadata: (
    workspacePath: string,
    patch: Record<string, unknown>,
  ) => Promise<Laudo>;
  /**
   * Deep-patch `currentDoc.layout` and persist. Used by the Inspector
   * "Página" tab to write page margins. The patch is shallow-merged at the
   * top level and recursively at `layout.page`.
   */
  updateLayout: (
    workspacePath: string,
    patch: Partial<SicroDocLayout>,
  ) => Promise<Laudo>;
  clearCurrent: () => void;
  clearError: () => void;
}

export const useLaudoStore = create<LaudoState>((set, get) => ({
  list: [],
  isLoadingList: false,
  isMutating: false,
  currentLaudo: null,
  currentDoc: null,
  lastError: null,

  async loadList(workspacePath) {
    set({ isLoadingList: true, lastError: null });
    try {
      const list = await commands.listLaudos(workspacePath);
      set({ list, isLoadingList: false });
    } catch (err) {
      set({ isLoadingList: false, lastError: toSicroError(err) });
    }
  },

  async createLaudo(workspacePath, input, initialContent, initialMetadata) {
    set({ isMutating: true, lastError: null });
    try {
      const payload = await commands.createLaudo(workspacePath, input);
      let doc = coerceSicroDoc(payload.doc);

      // If a template seeded the content OR initial metadata was supplied,
      // persist RIGHT AWAY so the disk file equals what the editor renders.
      // Without this, the user's first open of the freshly-created laudo
      // would still see the empty paragraph from `create_laudo`.
      let laudoRow = payload.laudo;
      const hasInitialContent = !!initialContent;
      const hasInitialMetadata =
        !!initialMetadata && Object.keys(initialMetadata).length > 0;

      if (hasInitialContent || hasInitialMetadata) {
        const nextDoc: SicroDoc = {
          ...doc,
          content: initialContent ?? doc.content,
          metadata: hasInitialMetadata
            ? { ...(doc.metadata ?? {}), ...initialMetadata }
            : doc.metadata,
          updated_at: new Date().toISOString(),
        };
        try {
          laudoRow = await commands.saveLaudo(
            workspacePath,
            payload.laudo.id,
            nextDoc,
          );
          doc = nextDoc;
        } catch (err) {
          // Best-effort: keep the laudo open with the in-memory template even
          // if save fails (next user-driven save will retry).
          // eslint-disable-next-line no-console
          console.warn("failed to persist initial template content", err);
        }
      }

      set((s) => ({
        list: [laudoRow, ...s.list.filter((l) => l.id !== laudoRow.id)],
        currentLaudo: laudoRow,
        currentDoc: doc,
        isMutating: false,
      }));
      return laudoRow;
    } catch (err) {
      const e = toSicroError(err);
      set({ isMutating: false, lastError: e });
      throw e;
    }
  },

  async openLaudo(workspacePath, laudoId) {
    set({ isMutating: true, lastError: null });
    try {
      const payload = await commands.readLaudo(workspacePath, laudoId);
      const raw = coerceSicroDoc(payload.doc);
      // Resolve any relative_path → convertFileSrc so figures/storyboard
      // frames display in the editor. The on-disk doc stays untouched
      // (see normalizeEvidenceSrcsForSave on the save path).
      const doc: SicroDoc = {
        ...raw,
        content: resolveEvidenceSrcsForEditor(raw.content, workspacePath),
      };
      set({
        currentLaudo: payload.laudo,
        currentDoc: doc,
        isMutating: false,
      });
      return doc;
    } catch (err) {
      const e = toSicroError(err);
      set({ isMutating: false, lastError: e });
      throw e;
    }
  },

  async saveCurrent(workspacePath, content) {
    const current = get().currentLaudo;
    const currentDoc = get().currentDoc;
    if (!current || !currentDoc) {
      throw new Error("no laudo currently open");
    }
    set({ isMutating: true, lastError: null });
    try {
      // Strip absolute / convertFileSrc URLs back to relative paths so
      // the `.sicrodoc` stays portable across workspaces.
      const portableContent = normalizeEvidenceSrcsForSave(content);
      const docToPersist: SicroDoc = {
        ...currentDoc,
        content: portableContent,
        updated_at: new Date().toISOString(),
      };
      const updatedRow = await commands.saveLaudo(
        workspacePath,
        current.id,
        docToPersist,
      );
      // In-memory state keeps the editor-friendly (resolved) version so
      // images keep rendering after a save.
      const docForState: SicroDoc = {
        ...docToPersist,
        content: resolveEvidenceSrcsForEditor(portableContent, workspacePath),
      };
      set((s) => ({
        list: s.list.map((l) => (l.id === updatedRow.id ? updatedRow : l)),
        currentLaudo: updatedRow,
        currentDoc: docForState,
        isMutating: false,
      }));
      return updatedRow;
    } catch (err) {
      const e = toSicroError(err);
      set({ isMutating: false, lastError: e });
      throw e;
    }
  },

  async updateLayout(workspacePath, patch) {
    const current = get().currentLaudo;
    const currentDoc = get().currentDoc;
    if (!current || !currentDoc) {
      throw new Error("no laudo currently open");
    }
    set({ isMutating: true, lastError: null });
    try {
      const prevLayout = currentDoc.layout;
      const nextLayout: SicroDocLayout = {
        ...prevLayout,
        ...patch,
        // Page sub-object merges recursively so margins/page_size coexist.
        page: patch.page
          ? { ...(prevLayout.page ?? {}), ...patch.page }
          : prevLayout.page,
      };
      const nextDoc: SicroDoc = {
        ...currentDoc,
        layout: nextLayout,
        updated_at: new Date().toISOString(),
      };
      const updatedRow = await commands.saveLaudo(
        workspacePath,
        current.id,
        nextDoc,
      );
      set((s) => ({
        list: s.list.map((l) => (l.id === updatedRow.id ? updatedRow : l)),
        currentLaudo: updatedRow,
        currentDoc: nextDoc,
        isMutating: false,
      }));
      return updatedRow;
    } catch (err) {
      const e = toSicroError(err);
      set({ isMutating: false, lastError: e });
      throw e;
    }
  },

  async updateMetadata(workspacePath, patch) {
    const current = get().currentLaudo;
    const currentDoc = get().currentDoc;
    if (!current || !currentDoc) {
      throw new Error("no laudo currently open");
    }
    set({ isMutating: true, lastError: null });
    try {
      const nextDoc: SicroDoc = {
        ...currentDoc,
        metadata: { ...(currentDoc.metadata ?? {}), ...patch },
        updated_at: new Date().toISOString(),
      };
      const updatedRow = await commands.saveLaudo(
        workspacePath,
        current.id,
        nextDoc,
      );
      set((s) => ({
        list: s.list.map((l) => (l.id === updatedRow.id ? updatedRow : l)),
        currentLaudo: updatedRow,
        currentDoc: nextDoc,
        isMutating: false,
      }));
      return updatedRow;
    } catch (err) {
      const e = toSicroError(err);
      set({ isMutating: false, lastError: e });
      throw e;
    }
  },

  clearCurrent() {
    set({ currentLaudo: null, currentDoc: null });
  },

  clearError() {
    set({ lastError: null });
  },
}));
