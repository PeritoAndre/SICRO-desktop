/**
 * CroquiListView — landing inside the Croqui module before any croqui is open.
 * Allows creating a new croqui and opening existing ones.
 */

import { useEffect, useState } from "react";
import { Plus, Shapes, FileImage } from "lucide-react";
import { Button } from "@components/Button/Button";
import { EmptyState } from "@components/EmptyState/EmptyState";
import { formatDateTime } from "@core/formatters";
import { toSicroError } from "@core/errors";
import { selectActiveWorkspacePath, useWorkspaceStore } from "@stores/workspaceStore";
import { useCroquiStore } from "./store/croquiStore";
import styles from "./CroquiListView.module.css";

export function CroquiListView() {
  const workspacePath = useWorkspaceStore(selectActiveWorkspacePath);
  const list = useCroquiStore((s) => s.list);
  const isLoadingList = useCroquiStore((s) => s.isLoadingList);
  const loadList = useCroquiStore((s) => s.loadList);
  const createCroqui = useCroquiStore((s) => s.createCroqui);
  const openCroqui = useCroquiStore((s) => s.openCroqui);

  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workspacePath) void loadList(workspacePath);
  }, [workspacePath, loadList]);

  const handleCreate = async () => {
    if (!workspacePath) return;
    setBusy(true);
    setError(null);
    try {
      await createCroqui(workspacePath, title.trim());
      setTitle("");
    } catch (err) {
      setError(toSicroError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = async (croquiId: string) => {
    if (!workspacePath) return;
    setBusy(true);
    setError(null);
    try {
      await openCroqui(workspacePath, croquiId);
    } catch (err) {
      setError(toSicroError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Croqui</h1>
            <p className={styles.subtitle}>
              Spike E — Croqui Engine (React-Konva). Cada croqui é um arquivo{" "}
              <code>.sicrocroqui</code> no workspace. PNG é derivado.
            </p>
          </div>
        </header>

        <section className={styles.createCard}>
          <h2 className={styles.sectionTitle}>Novo croqui</h2>
          <div className={styles.createRow}>
            <input
              type="text"
              placeholder="Título (ex.: Sinistro Av. FAB)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              className={styles.titleInput}
            />
            <Button
              variant="primary"
              leftIcon={<Plus size={14} />}
              onClick={() => void handleCreate()}
              disabled={busy}
            >
              Criar
            </Button>
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </section>

        <section>
          <h2 className={styles.sectionTitle}>
            Croquis desta ocorrência ({list.length})
          </h2>
          {isLoadingList && list.length === 0 ? (
            <p className={styles.dim}>Carregando…</p>
          ) : list.length === 0 ? (
            <EmptyState
              icon={<Shapes size={32} strokeWidth={1.5} />}
              title="Nenhum croqui ainda"
              description="Crie o primeiro croqui desta ocorrência usando o formulário acima."
            />
          ) : (
            <ul className={styles.list}>
              {list.map((c) => (
                <li key={c.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <strong className={styles.rowTitle}>{c.title}</strong>
                    <span className={styles.rowMeta}>
                      <span className={styles.chip}>{c.status}</span>
                      <span>v{c.schema_version}</span>
                      <span>atualizado {formatDateTime(c.updated_at)}</span>
                      {c.last_export_relative_path && (
                        <span title={c.last_export_relative_path}>
                          <FileImage
                            size={11}
                            style={{ verticalAlign: "-1px", marginRight: 3 }}
                          />
                          PNG exportado
                        </span>
                      )}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => void handleOpen(c.id)}
                    disabled={busy}
                  >
                    Abrir
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
