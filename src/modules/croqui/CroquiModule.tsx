/**
 * CroquiModule — Spike E shell.
 *
 * Two states:
 *   - no croqui open → CroquiListView (list + "Novo croqui")
 *   - croqui open    → CroquiEditor (Konva canvas)
 *
 * The active croqui id lives in `croquiStore` so the user can navigate
 * away (Laudo / Dossiê) and come back without losing state.
 */

import { useEffect } from "react";
import { ListChecks } from "lucide-react";
import {
  selectActiveOccurrence,
  selectActiveWorkspacePath,
  useWorkspaceStore,
} from "@stores/workspaceStore";
import { CroquiListView } from "./CroquiListView";
import { CroquiEditor } from "./editor/CroquiEditor";
import { useCroquiStore } from "./store/croquiStore";
import styles from "./CroquiModule.module.css";

export function CroquiModule() {
  const occurrence = useWorkspaceStore(selectActiveOccurrence);
  const workspacePath = useWorkspaceStore(selectActiveWorkspacePath);
  const activeCroquiId = useCroquiStore((s) => s.activeCroquiId);
  const clearCurrent = useCroquiStore((s) => s.clearCurrent);

  // Drop the open croqui whenever the active occurrence changes so we don't
  // accidentally show one workspace's croqui on top of another's data.
  useEffect(() => {
    return () => {
      clearCurrent();
    };
  }, [workspacePath, clearCurrent]);

  if (!workspacePath || !occurrence) {
    return (
      <div className={styles.empty}>
        <ListChecks size={36} strokeWidth={1.5} aria-hidden />
        <p>Abra uma ocorrência para usar o Croqui.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {activeCroquiId == null ? <CroquiListView /> : <CroquiEditor />}
    </div>
  );
}
