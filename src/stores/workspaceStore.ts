/**
 * workspaceStore — global state for the active occurrence and the recents list.
 *
 * This store is intentionally thin: it owns the *what* (data + loading flags)
 * but delegates the *how* to the command wrappers. UI components subscribe to
 * slices via the selector API to avoid unnecessary re-renders.
 */

import { create } from "zustand";
import { commands } from "@core/commands";
import { toSicroError, type SicroError } from "@core/errors";
import type {
  LoadedOccurrence,
  NewOccurrenceInput,
  Occurrence,
  RecentOccurrence,
} from "@domain/occurrence";

interface WorkspaceState {
  activeOccurrence: Occurrence | null;
  activeWorkspacePath: string | null;
  recents: RecentOccurrence[];
  isLoadingRecents: boolean;
  isMutating: boolean;
  lastError: SicroError | null;

  loadRecents: () => Promise<void>;
  createOccurrence: (input: NewOccurrenceInput) => Promise<LoadedOccurrence>;
  openOccurrence: (workspacePath: string) => Promise<LoadedOccurrence>;
  closeOccurrence: () => void;
  forgetRecent: (workspaceId: string) => Promise<void>;
  clearError: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  activeOccurrence: null,
  activeWorkspacePath: null,
  recents: [],
  isLoadingRecents: false,
  isMutating: false,
  lastError: null,

  async loadRecents() {
    set({ isLoadingRecents: true, lastError: null });
    try {
      const recents = await commands.listRecentOccurrences();
      set({ recents, isLoadingRecents: false });
    } catch (err) {
      set({
        isLoadingRecents: false,
        lastError: toSicroError(err),
      });
    }
  },

  async createOccurrence(input) {
    set({ isMutating: true, lastError: null });
    try {
      const loaded = await commands.createOccurrence(input);
      set({
        activeOccurrence: loaded.occurrence,
        activeWorkspacePath: loaded.workspace_path,
        isMutating: false,
      });
      // Refresh recents in background; don't block the caller.
      void get().loadRecents();
      return loaded;
    } catch (err) {
      const e = toSicroError(err);
      set({ isMutating: false, lastError: e });
      throw e;
    }
  },

  async openOccurrence(workspacePath) {
    set({ isMutating: true, lastError: null });
    try {
      const loaded = await commands.openOccurrence(workspacePath);
      set({
        activeOccurrence: loaded.occurrence,
        activeWorkspacePath: loaded.workspace_path,
        isMutating: false,
      });
      void get().loadRecents();
      return loaded;
    } catch (err) {
      const e = toSicroError(err);
      set({ isMutating: false, lastError: e });
      throw e;
    }
  },

  closeOccurrence() {
    set({ activeOccurrence: null, activeWorkspacePath: null });
  },

  async forgetRecent(workspaceId) {
    try {
      await commands.forgetRecentOccurrence(workspaceId);
      await get().loadRecents();
    } catch (err) {
      set({ lastError: toSicroError(err) });
    }
  },

  clearError() {
    set({ lastError: null });
  },
}));

/** Convenience selectors — use these to avoid subscribing to the whole store. */
export const selectActiveOccurrence = (s: WorkspaceState) => s.activeOccurrence;
export const selectActiveWorkspacePath = (s: WorkspaceState) =>
  s.activeWorkspacePath;
export const selectRecents = (s: WorkspaceState) => s.recents;
