/**
 * croquiStore — owns the list of croquis of the active workspace plus the
 * croqui currently being edited. Heavy editor state (selection, transient
 * drag positions) lives in component-local state — only persisted doc
 * lives here.
 */

import { create } from "zustand";
import { commands } from "@core/commands";
import { toSicroError, type SicroError } from "@core/errors";
import type { Croqui } from "@domain/croqui";
import {
  coerceCroquiDoc,
  serializeCroquiDoc,
  type SicroCroquiDoc,
} from "../engine";

interface CroquiState {
  list: Croqui[];
  isLoadingList: boolean;
  isMutating: boolean;

  /** UUID of the croqui currently open in the editor, or null. */
  activeCroquiId: string | null;
  activeCroqui: Croqui | null;
  activeDoc: SicroCroquiDoc | null;

  /**
   * ISO timestamp of the last successful PNG export per croqui id.
   * Used by `isExportStale(id)` to decide whether the PNG needs to be
   * regenerated before being inserted into a Laudo. In-memory only —
   * a page reload resets this map (the user is then conservative and
   * re-exports on first insert, which is the safe default).
   */
  lastExportedAt: Record<string, string>;

  lastError: SicroError | null;

  loadList: (workspacePath: string) => Promise<void>;
  createCroqui: (workspacePath: string, title: string) => Promise<Croqui>;
  openCroqui: (workspacePath: string, croquiId: string) => Promise<SicroCroquiDoc>;
  saveCurrent: (
    workspacePath: string,
    doc: SicroCroquiDoc,
  ) => Promise<Croqui>;
  exportPng: (
    workspacePath: string,
    pngBase64: string,
  ) => Promise<string>;
  clearCurrent: () => void;
  clearError: () => void;

  /**
   * Returns `true` when the most recent .sicrocroqui save is newer
   * than the most recent PNG export — i.e. the rendered PNG is out of
   * sync with what the user sees in the editor. Conservative: returns
   * `true` when no export has happened in this session yet.
   */
  isExportStale: (croquiId: string) => boolean;
}

export const useCroquiStore = create<CroquiState>((set, get) => ({
  list: [],
  isLoadingList: false,
  isMutating: false,
  activeCroquiId: null,
  activeCroqui: null,
  activeDoc: null,
  lastExportedAt: {},
  lastError: null,

  async loadList(workspacePath) {
    set({ isLoadingList: true, lastError: null });
    try {
      const list = await commands.listCroquis(workspacePath);
      set({ list, isLoadingList: false });
    } catch (err) {
      set({ isLoadingList: false, lastError: toSicroError(err) });
    }
  },

  async createCroqui(workspacePath, title) {
    set({ isMutating: true, lastError: null });
    try {
      const payload = await commands.createCroqui(workspacePath, { title });
      const doc = coerceCroquiDoc(payload.doc);
      set((s) => ({
        list: [payload.croqui, ...s.list.filter((c) => c.id !== payload.croqui.id)],
        activeCroquiId: payload.croqui.id,
        activeCroqui: payload.croqui,
        activeDoc: doc,
        isMutating: false,
      }));
      return payload.croqui;
    } catch (err) {
      const e = toSicroError(err);
      set({ isMutating: false, lastError: e });
      throw e;
    }
  },

  async openCroqui(workspacePath, croquiId) {
    set({ isMutating: true, lastError: null });
    try {
      const payload = await commands.readCroqui(workspacePath, croquiId);
      const doc = coerceCroquiDoc(payload.doc);
      set({
        activeCroquiId: payload.croqui.id,
        activeCroqui: payload.croqui,
        activeDoc: doc,
        isMutating: false,
      });
      return doc;
    } catch (err) {
      const e = toSicroError(err);
      set({ isMutating: false, lastError: e });
      throw e;
    }
  },

  async saveCurrent(workspacePath, doc) {
    const current = get().activeCroqui;
    if (!current) throw new Error("no croqui currently open");
    set({ isMutating: true, lastError: null });
    try {
      const stamped = serializeCroquiDoc(doc);
      const updated = await commands.saveCroqui(workspacePath, current.id, stamped);
      set((s) => ({
        list: s.list.map((c) => (c.id === updated.id ? updated : c)),
        activeCroqui: updated,
        activeDoc: stamped,
        isMutating: false,
      }));
      return updated;
    } catch (err) {
      const e = toSicroError(err);
      set({ isMutating: false, lastError: e });
      throw e;
    }
  },

  async exportPng(workspacePath, pngBase64) {
    const current = get().activeCroqui;
    if (!current) throw new Error("no croqui currently open");
    set({ isMutating: true, lastError: null });
    try {
      const path = await commands.exportCroquiPng(workspacePath, current.id, {
        png_base64: pngBase64,
      });
      // Refresh the row so last_export_relative_path / status update in the UI.
      const list = await commands.listCroquis(workspacePath);
      const refreshed = list.find((c) => c.id === current.id) ?? current;
      // Record the export timestamp so `isExportStale` can later
      // decide whether the PNG is in sync with the underlying doc.
      set((s) => ({
        list,
        activeCroqui: refreshed,
        isMutating: false,
        lastExportedAt: {
          ...s.lastExportedAt,
          [current.id]: new Date().toISOString(),
        },
      }));
      return path;
    } catch (err) {
      const e = toSicroError(err);
      set({ isMutating: false, lastError: e });
      throw e;
    }
  },

  clearCurrent() {
    set({ activeCroquiId: null, activeCroqui: null, activeDoc: null });
  },

  clearError() {
    set({ lastError: null });
  },

  isExportStale(croquiId) {
    const s = get();
    const exportedAt = s.lastExportedAt[croquiId];
    if (!exportedAt) return true;
    const croqui = s.list.find((c) => c.id === croquiId);
    if (!croqui) return true;
    // The .sicrocroqui has been touched more recently than the PNG.
    return Date.parse(croqui.updated_at) > Date.parse(exportedAt);
  },
}));
