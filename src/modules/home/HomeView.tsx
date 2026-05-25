/**
 * HomeView — Spike A landing screen.
 *
 * Responsibilities:
 *   - Show a list of recent .sicro workspaces.
 *   - Trigger creation of a new occurrence (via NewOccurrenceDialog).
 *   - Trigger opening an existing workspace via the system folder picker.
 *
 * Anything beyond this scope (statistics, search, etc.) is out of Spike A.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { open as openDirDialog } from "@tauri-apps/plugin-dialog";
import { Plus, FolderOpen, Briefcase, FileArchive } from "lucide-react";
import { Button } from "@components/Button/Button";
import { EmptyState } from "@components/EmptyState/EmptyState";
import { AlphaDashboard } from "./AlphaDashboard";
import { NewOccurrenceDialog } from "./NewOccurrenceDialog";
import { ImportSicroappDialog } from "./ImportSicroappDialog";
import { RecentOccurrenceCard } from "./RecentOccurrenceCard";
import {
  selectRecents,
  useWorkspaceStore,
} from "@stores/workspaceStore";
import { toSicroError } from "@core/errors";
import type { RecentOccurrence } from "@domain/occurrence";
import styles from "./HomeView.module.css";

export function HomeView() {
  const navigate = useNavigate();
  const recents = useWorkspaceStore(selectRecents);
  const isLoading = useWorkspaceStore((s) => s.isLoadingRecents);
  const openOccurrence = useWorkspaceStore((s) => s.openOccurrence);
  const forgetRecent = useWorkspaceStore((s) => s.forgetRecent);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const handleOpenRecent = async (entry: RecentOccurrence) => {
    setOpenError(null);
    try {
      await openOccurrence(entry.workspace_path);
      navigate("/");
    } catch (err) {
      setOpenError(toSicroError(err).message);
    }
  };

  const handleBrowseAndOpen = async () => {
    setOpenError(null);
    try {
      const selected = await openDirDialog({
        directory: true,
        multiple: false,
        title: "Selecione um workspace .sicro",
      });
      if (typeof selected === "string") {
        await openOccurrence(selected);
        navigate("/");
      }
    } catch (err) {
      setOpenError(toSicroError(err).message);
    }
  };

  const handleOpenImportedWorkspace = async (workspacePath: string) => {
    setOpenError(null);
    try {
      await openOccurrence(workspacePath);
      navigate("/");
    } catch (err) {
      setOpenError(toSicroError(err).message);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.container}>
        <header className={styles.headerRow}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>Bem-vindo ao SICRO 2.0</h1>
            <p className={styles.subtitle}>
              Cada ocorrência é um workspace autocontido. Crie uma nova ou
              reabra uma das recentes para começar.
            </p>
          </div>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              leftIcon={<FileArchive size={16} />}
              onClick={() => setImportDialogOpen(true)}
            >
              Importar .sicroapp…
            </Button>
            <Button
              variant="secondary"
              leftIcon={<FolderOpen size={16} />}
              onClick={handleBrowseAndOpen}
            >
              Abrir workspace…
            </Button>
            <Button
              variant="primary"
              leftIcon={<Plus size={16} />}
              onClick={() => setDialogOpen(true)}
            >
              Nova ocorrência
            </Button>
          </div>
        </header>

        <AlphaDashboard />

        <section>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Ocorrências recentes</h2>
            <span className={styles.sectionMeta}>
              {isLoading ? "carregando…" : `${recents.length} item(ns)`}
            </span>
          </header>

          {recents.length === 0 ? (
            <EmptyState
              icon={<Briefcase size={36} strokeWidth={1.5} />}
              title="Nenhuma ocorrência aberta ainda"
              description="Crie a primeira ocorrência ou abra um workspace .sicro existente para começar a trabalhar."
              actions={
                <>
                  <Button
                    variant="secondary"
                    leftIcon={<FolderOpen size={16} />}
                    onClick={handleBrowseAndOpen}
                  >
                    Abrir existente
                  </Button>
                  <Button
                    variant="primary"
                    leftIcon={<Plus size={16} />}
                    onClick={() => setDialogOpen(true)}
                  >
                    Criar nova
                  </Button>
                </>
              }
            />
          ) : (
            <div className={styles.grid}>
              {recents.map((entry) => (
                <RecentOccurrenceCard
                  key={entry.workspace_id}
                  entry={entry}
                  onOpen={handleOpenRecent}
                  onForget={(e) => void forgetRecent(e.workspace_id)}
                />
              ))}
            </div>
          )}

          {openError && (
            <p style={{ color: "var(--sicro-danger)", marginTop: "var(--space-4)" }}>
              {openError}
            </p>
          )}
        </section>
      </div>

      <NewOccurrenceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => navigate("/")}
      />

      <ImportSicroappDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onOpenWorkspace={handleOpenImportedWorkspace}
      />
    </div>
  );
}
