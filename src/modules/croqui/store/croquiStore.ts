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
}

export const useCroquiStore = create<CroquiState>((set, get) => ({
  list: [],
  isLoadingList: false,
  isMutating: false,
  activeCroquiId: null,
  activeCroqui: null,
  activeDoc: null,
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
      set({
        list,
        activeCroqui: refreshed,
        isMutating: false,
      });
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
}));
