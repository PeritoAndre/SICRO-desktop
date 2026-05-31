/**
 * CroquiListView — landing inside the Croqui module before any croqui is open.
 * Allows creating a new croqui and opening existing ones.
 */

import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { Plus, Shapes, FileImage, Trash2 } from "lucide-react";
import { Button } from "@components/Button/Button";
import { ConfirmDialog } from "@components/Dialog/ConfirmDialog";
import { EmptyState } from "@components/EmptyState/EmptyState";
import { formatDateTime } from "@core/formatters";
import { toSicroError } from "@core/errors";
import { selectActiveWorkspacePath, useWorkspaceStore } from "@stores/workspaceStore";
import { useCroquiStore } from "./store/croquiStore";
import styles from "./CroquiListView.module.css";

// Linha mínima que precisamos guardar enquanto o popup está aberto.
// Espelha os campos do store sem importar o tipo da row inteira.
interface PendingDeleteCroqui {
  id: string;
  title: string;
}

export function CroquiListView() {
  const workspacePath = useWorkspaceStore(selectActiveWorkspacePath);
  const list = useCroquiStore((s) => s.list);
  const isLoadingList = useCroquiStore((s) => s.isLoadingList);
  const loadList = useCroquiStore((s) => s.loadList);
  const createCroqui = useCroquiStore((s) => s.createCroqui);
  const openCroqui = useCroquiStore((s) => s.openCroqui);
  const deleteCroqui = useCroquiStore((s) => s.deleteCroqui);

  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Croqui aguardando confirmação. `null` = nenhum popup aberto.
  const [pendingDelete, setPendingDelete] =
    useState<PendingDeleteCroqui | null>(null);

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

  // Exclui o croqui após confirmação via popup. `stopPropagation`
  // mantém o padrão do delete do laudo (o botão fica dentro de um
  // `row` que não é clicável hoje, mas o stopPropagation defende
  // contra mudanças futuras).
  const handleDeleteClick = (
    e: MouseEvent<HTMLButtonElement>,
    croquiId: string,
    croquiTitle: string,
  ) => {
    e.stopPropagation();
    setPendingDelete({ id: croquiId, title: croquiTitle });
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || !workspacePath) return;
    const target = pendingDelete;
    setBusy(true);
    setError(null);
    try {
      await deleteCroqui(workspacePath, target.id);
      setPendingDelete(null);
    } catch (err) {
      setError(toSicroError(err).message);
      // Mantemos o popup aberto se o usuário quiser tentar de novo.
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
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    title="Excluir croqui"
                    aria-label={`Excluir croqui ${c.title}`}
                    disabled={busy}
                    onClick={(e) => handleDeleteClick(e, c.id, c.title)}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Excluir croqui"
        destructive
        confirmLabel="Excluir croqui"
        cancelLabel="Cancelar"
        busy={busy}
        message={
          pendingDelete ? (
            <>
              Tem certeza que deseja excluir o croqui{" "}
              <strong>"{pendingDelete.title}"</strong>?
            </>
          ) : (
            ""
          )
        }
        detail="Esta ação não pode ser desfeita. O arquivo .sicrocroqui e o PNG exportado serão removidos do workspace."
        onCancel={() => {
          if (!busy) setPendingDelete(null);
        }}
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  );
}
