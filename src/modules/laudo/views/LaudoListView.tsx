/**
 * LaudoListView — landing screen of the Laudo module.
 *
 * Lists every laudo of the active workspace and offers a "Novo laudo"
 * button. Opening or creating a laudo flips the module into
 * `LaudoEditorView`.
 */

import { useEffect, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { Button } from "@components/Button/Button";
import { Card } from "@components/Card/Card";
import { EmptyState } from "@components/EmptyState/EmptyState";
import { StatusPill } from "@components/StatusPill/StatusPill";
import { formatRelative } from "@core/formatters";
import { useLaudoStore } from "../store/laudoStore";
import { useWorkspaceStore } from "@stores/workspaceStore";
import type { Laudo, LaudoStatus } from "@domain/laudo";
import type { OccurrenceStatus } from "@domain/occurrence";
import styles from "./LaudoListView.module.css";

interface LaudoListViewProps {
  workspacePath: string;
  onOpen: (laudo: Laudo) => void;
  onCreate: () => void;
}

export function LaudoListView({
  workspacePath,
  onOpen,
  onCreate,
}: LaudoListViewProps) {
  const list = useLaudoStore((s) => s.list);
  const isLoading = useLaudoStore((s) => s.isLoadingList);
  const isMutating = useLaudoStore((s) => s.isMutating);
  const error = useLaudoStore((s) => s.lastError);
  const loadList = useLaudoStore((s) => s.loadList);
  const createLaudo = useLaudoStore((s) => s.createLaudo);
  const activeOccurrence = useWorkspaceStore((s) => s.activeOccurrence);

  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void loadList(workspacePath);
  }, [workspacePath, loadList]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const title = buildSuggestedTitle(activeOccurrence?.tipo_pericia ?? null);
      await createLaudo(workspacePath, { title, template_id: "documento_livre" });
      onCreate();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>Laudos da ocorrência</h1>
            <p className={styles.subtitle}>
              {isLoading
                ? "carregando…"
                : `${list.length} laudo(s) registrado(s) no workspace.`}
            </p>
          </div>
          <Button
            variant="primary"
            leftIcon={<Plus size={16} />}
            onClick={handleCreate}
            disabled={creating || isMutating}
          >
            {creating ? "Criando…" : "Novo laudo"}
          </Button>
        </header>

        {error && <p className={styles.error}>{error.message}</p>}

        {list.length === 0 && !isLoading ? (
          <EmptyState
            icon={<FileText size={36} strokeWidth={1.5} />}
            title="Nenhum laudo ainda"
            description="Crie um laudo para começar a redigir. O documento será salvo em laudos/ dentro do workspace da ocorrência."
            actions={
              <Button
                variant="primary"
                leftIcon={<Plus size={16} />}
                onClick={handleCreate}
                disabled={creating || isMutating}
              >
                Criar primeiro laudo
              </Button>
            }
          />
        ) : (
          <div className={styles.grid}>
            {list.map((laudo) => (
              <Card key={laudo.id} interactive onClick={() => onOpen(laudo)}>
                <div className={styles.card}>
                  <div
                    style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
                  >
                    <h3 className={styles.cardTitle}>{laudo.title}</h3>
                    <StatusPill status={mapLaudoStatus(laudo.status)} />
                  </div>
                  <code className={styles.path}>{laudo.relative_path}</code>
                  <div className={styles.cardMeta}>
                    <span>template: {laudo.template_id}</span>
                    <span>atualizado {formatRelative(laudo.updated_at)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function buildSuggestedTitle(tipo: string | null): string {
  const date = new Date().toLocaleDateString("pt-BR");
  if (tipo && tipo.trim()) return `Laudo Pericial — ${tipo} (${date})`;
  return `Laudo Pericial (${date})`;
}

/** Coerce a LaudoStatus into the StatusPill's OccurrenceStatus look-alike.
 *  The two status sets diverge — this is the lightweight visual mapping. */
function mapLaudoStatus(status: LaudoStatus): OccurrenceStatus {
  switch (status) {
    case "rascunho":
      return "aberta";
    case "revisado":
      return "em_andamento";
    case "exportado":
    case "assinado":
      return "concluida";
    case "arquivado":
      return "arquivada";
    default:
      return "aberta";
  }
}
