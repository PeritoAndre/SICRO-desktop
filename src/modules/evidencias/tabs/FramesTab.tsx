/**
 * FramesTab — frames extraídos por FFmpeg (Spike F). Mostra miniaturas,
 * timestamp, vídeo de origem, sidecar JSON e quantos laudos citam cada
 * frame.
 */

import { useMemo, useState } from "react";
import { Copy, ExternalLink, Folder, ImageOff } from "lucide-react";
import { commands } from "@core/commands";
import { toSicroError } from "@core/errors";
import type { EvidenceRegistryItem } from "@domain/evidence_registry";
import { formatDateTime } from "@core/formatters";
import {
  assetUrl,
  shortHash,
  statusClass,
  statusLabel,
} from "../shared";
import styles from "../EvidenciasModule.module.css";

interface Props {
  items: EvidenceRegistryItem[];
  workspacePath: string;
}

export function FramesTab({ items, workspacePath }: Props) {
  const frames = useMemo(
    () => items.filter((i) => i.kind === "storyboard_frame"),
    [items],
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "linked" | "unlinked">("all");

  const filtered = useMemo(() => {
    if (filter === "linked") return frames.filter((f) => f.linked_laudos_count > 0);
    if (filter === "unlinked") return frames.filter((f) => f.linked_laudos_count === 0);
    return frames;
  }, [frames, filter]);

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

  if (frames.length === 0) {
    return (
      <p className={styles.tip}>
        Nenhum frame coletado nesta ocorrência. Frames são gerados pelo
        módulo <strong>Vídeo</strong> via FFmpeg.
      </p>
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.toolbar}>
        <label htmlFor="fr-filter">Filtro</label>
        <select
          id="fr-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as never)}
        >
          <option value="all">Todos ({frames.length})</option>
          <option value="linked">Inseridos em laudo</option>
          <option value="unlinked">Não inseridos</option>
        </select>
        <span className={styles.dim}>{filtered.length} mostrando</span>
        {feedback && <span className={styles.dim}>· {feedback}</span>}
      </div>

      <div className={styles.card} style={{ padding: 0 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th></th>
              <th>Título</th>
              <th>Caminho</th>
              <th>Sidecar JSON</th>
              <th>Vídeo (hash)</th>
              <th>Status</th>
              <th>Em laudo</th>
              <th>Capturado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <FrameRow
                key={f.id}
                item={f}
                workspacePath={workspacePath}
                onOpen={() => void open(f.relative_path)}
                onReveal={() => void reveal(f.relative_path)}
                onCopy={() => void copyRel(f.relative_path)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FrameRow({
  item,
  workspacePath,
  onOpen,
  onReveal,
  onCopy,
}: {
  item: EvidenceRegistryItem;
  workspacePath: string;
  onOpen: () => void;
  onReveal: () => void;
  onCopy: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const src = item.relative_path ? assetUrl(workspacePath, item.relative_path) : null;
  return (
    <tr>
      <td style={{ width: 56 }}>
        {src && !failed ? (
          <img
            src={src}
            alt={item.title ?? ""}
            className={styles.thumb}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className={styles.thumbPlaceholder}>
            <ImageOff size={16} />
          </span>
        )}
      </td>
      <td>{item.title ?? <span className={styles.dim}>—</span>}</td>
      <td>
        <code>{item.relative_path ?? "—"}</code>
      </td>
      <td>
        <code>{item.sidecar_relative_path ?? "—"}</code>
      </td>
      <td>
        <code title={item.original_id ?? ""}>{shortHash(item.original_id)}</code>
      </td>
      <td>
        <span
          className={statusClass(item.integrity_status, styles)}
          title={item.integrity_detail ?? undefined}
        >
          {statusLabel(item.integrity_status)}
        </span>
      </td>
      <td>{item.linked_laudos_count}</td>
      <td>{item.created_at ? formatDateTime(item.created_at) : "—"}</td>
      <td>
        <div className={styles.actionsRow}>
          <button
            type="button"
            className={styles.actionsBtn}
            onClick={onOpen}
            disabled={!item.relative_path}
            title="Abrir frame"
          >
            <ExternalLink size={11} />
          </button>
          <button
            type="button"
            className={styles.actionsBtn}
            onClick={onReveal}
            disabled={!item.relative_path}
            title="Revelar na pasta"
          >
            <Folder size={11} />
          </button>
          <button
            type="button"
            className={styles.actionsBtn}
            onClick={onCopy}
            disabled={!item.relative_path}
            title="Copiar caminho"
          >
            <Copy size={11} />
          </button>
        </div>
      </td>
    </tr>
  );
}
