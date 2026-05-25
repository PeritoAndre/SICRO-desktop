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
} as const;

export type { SicroError };
