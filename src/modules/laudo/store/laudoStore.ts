/**
 * laudoStore — holds the list of laudos of the active workspace plus the
 * currently-open laudo. Kept lean — heavy editor state lives in the TipTap
 * editor instance itself.
 */

import { create } from "zustand";
import { commands } from "@core/commands";
import { toSicroError, type SicroError } from "@core/errors";
import { coerceSicroDoc, type SicroDoc } from "../document-engine";
import type { Laudo, NewLaudoInput } from "@domain/laudo";

interface LaudoState {
  list: Laudo[];
  isLoadingList: boolean;
  isMutating: boolean;

  currentLaudo: Laudo | null;
  currentDoc: SicroDoc | null;

  lastError: SicroError | null;

  loadList: (workspacePath: string) => Promise<void>;
  createLaudo: (
    workspacePath: string,
    input: NewLaudoInput,
  ) => Promise<Laudo>;
  openLaudo: (workspacePath: string, laudoId: string) => Promise<SicroDoc>;
  saveCurrent: (
    workspacePath: string,
    content: SicroDoc["content"],
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

  async createLaudo(workspacePath, input) {
    set({ isMutating: true, lastError: null });
    try {
      const payload = await commands.createLaudo(workspacePath, input);
      const doc = coerceSicroDoc(payload.doc);
      set((s) => ({
        list: [payload.laudo, ...s.list.filter((l) => l.id !== payload.laudo.id)],
        currentLaudo: payload.laudo,
        currentDoc: doc,
        isMutating: false,
      }));
      return payload.laudo;
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
      const doc = coerceSicroDoc(payload.doc);
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
      const nextDoc: SicroDoc = {
        ...currentDoc,
        content,
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
