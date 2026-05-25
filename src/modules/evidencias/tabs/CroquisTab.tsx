/**
 * CroquisTab — aba "Croquis". Lista cada `.sicrocroqui` em par com o
 * seu último PNG exportado (quando existe).
 */

import { useMemo, useState } from "react";
import { Copy, ExternalLink, Folder, Map as MapIcon } from "lucide-react";
import { commands } from "@core/commands";
import { toSicroError } from "@core/errors";
import type { EvidenceRegistryItem } from "@domain/evidence_registry";
import { formatDateTime } from "@core/formatters";
import { statusClass, statusLabel } from "../shared";
import styles from "../EvidenciasModule.module.css";

interface Props {
  items: EvidenceRegistryItem[];
  workspacePath: string;
}

export function CroquisTab({ items, workspacePath }: Props) {
  const [feedback, setFeedback] = useState<string | null>(null);

  // Group source + export by croqui id suffix.
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { source: EvidenceRegistryItem | null; export_: EvidenceRegistryItem | null }
    >();
    for (const i of items) {
      if (i.kind === "croqui") {
        const id = i.id.split(":")[1] ?? i.id;
        const entry = map.get(id) ?? { source: null, export_: null };
        entry.source = i;
        map.set(id, entry);
      }
      if (i.kind === "croqui_export") {
        const id = i.id.split(":")[1] ?? i.id;
        const entry = map.get(id) ?? { source: null, export_: null };
        entry.export_ = i;
        map.set(id, entry);
      }
    }
    return Array.from(map.entries());
  }, [items]);

  const open = async (rel: string | null) => {
    if (!rel) return;
    try {
      await commands.openEvidenceFile(workspacePath, rel);
    } catch (err) {
      setFeedback(`Falha ao abrir: ${toSicroError(err).message}`);
    }
  };
  const reveal = async (rel: string | null) => {
    if (!rel) return;
    try {
      await commands.revealEvidenceInFolder(workspacePath, rel);
    } catch (err) {
      setFeedback(`Falha ao revelar: ${toSicroError(err).message}`);
    }
  };
  const copyRel = async (rel: string | null) => {
    if (!rel) return;
    await navigator.clipboard.writeText(rel);
    setFeedback("Caminho copiado.");
    setTimeout(() => setFeedback(null), 1500);
  };

  if (grouped.length === 0) {
    return <p className={styles.tip}>Nenhum croqui criado nesta ocorrência.</p>;
  }

  return (
    <div className={styles.section}>
      <div className={styles.toolbar}>
        <span className={styles.dim}>{grouped.length} croqui(s)</span>
        {feedback && <span className={styles.dim}>· {feedback}</span>}
      </div>

      <div className={styles.card} style={{ padding: 0 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Título</th>
              <th>.sicrocroqui</th>
              <th>Status fonte</th>
              <th>Último PNG</th>
              <th>Status PNG</th>
              <th>Em laudo</th>
              <th>Atualizado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([id, { source, export_ }]) => {
              const title = source?.title ?? export_?.title ?? `Croqui ${id.slice(0, 8)}`;
              const sourceRel = source?.relative_path ?? null;
              const exportRel = export_?.relative_path ?? null;
              const updated =
                source?.updated_at ?? export_?.updated_at ?? source?.created_at ?? null;
              return (
                <tr key={id}>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <MapIcon size={12} aria-hidden /> {title}
                    </span>
                  </td>
                  <td>
                    <code>{sourceRel ?? "—"}</code>
                  </td>
                  <td>
                    {source ? (
                      <span
                        className={statusClass(source.integrity_status, styles)}
                        title={source.integrity_detail ?? undefined}
                      >
                        {statusLabel(source.integrity_status)}
                      </span>
                    ) : (
                      <span className={styles.dim}>—</span>
                    )}
                  </td>
                  <td>
                    <code>{exportRel ?? "—"}</code>
                  </td>
                  <td>
                    {export_ ? (
                      <span
                        className={statusClass(export_.integrity_status, styles)}
                        title={export_.integrity_detail ?? undefined}
                      >
                        {statusLabel(export_.integrity_status)}
                      </span>
                    ) : (
                      <span className={styles.dim}>—</span>
                    )}
                  </td>
                  <td>{export_?.linked_laudos_count ?? source?.linked_laudos_count ?? 0}</td>
                  <td>{updated ? formatDateTime(updated) : "—"}</td>
                  <td>
                    <div className={styles.actionsRow}>
                      {/* Open .sicrocroqui is non-trivial; reveal/copy works on the file. */}
                      <button
                        type="button"
                        className={styles.actionsBtn}
                        onClick={() => void reveal(sourceRel)}
                        disabled={!sourceRel}
                        title="Revelar .sicrocroqui na pasta"
                      >
                        <Folder size={11} />
                      </button>
                      <button
                        type="button"
                        className={styles.actionsBtn}
                        onClick={() => void copyRel(sourceRel)}
                        disabled={!sourceRel}
                        title="Copiar caminho do .sicrocroqui"
                      >
                        <Copy size={11} />
                      </button>
                      <button
                        type="button"
                        className={styles.actionsBtn}
                        onClick={() => void open(exportRel)}
                        disabled={!exportRel}
                        title="Abrir PNG"
                      >
                        <ExternalLink size={11} />
                      </button>
                      <button
                        type="button"
                        className={styles.actionsBtn}
                        onClick={() => void reveal(exportRel)}
                        disabled={!exportRel}
                        title="Revelar PNG na pasta"
                      >
                        <Folder size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
