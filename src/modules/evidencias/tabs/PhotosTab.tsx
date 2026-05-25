/**
 * PhotosTab — aba "Fotos" da Central. Lista as fotos importadas com
 * miniatura + categoria + hash + status + inserções em laudo. Não edita
 * — só inspeciona.
 */

import { useMemo, useState } from "react";
import { Copy, ExternalLink, Folder, ImageOff } from "lucide-react";
import { commands } from "@core/commands";
import { toSicroError } from "@core/errors";
import type { EvidenceRegistryItem } from "@domain/evidence_registry";
import { formatDateTime } from "@core/formatters";
import {
  assetUrl,
  prettyBytes,
  shortHash,
  statusClass,
  statusLabel,
} from "../shared";
import styles from "../EvidenciasModule.module.css";

interface Props {
  items: EvidenceRegistryItem[];
  workspacePath: string;
}

export function PhotosTab({ items, workspacePath }: Props) {
  const photos = useMemo(
    () => items.filter((i) => i.kind === "photo"),
    [items],
  );
  const [feedback, setFeedback] = useState<string | null>(null);

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
    try {
      await navigator.clipboard.writeText(rel);
      setFeedback("Caminho copiado.");
      setTimeout(() => setFeedback(null), 1500);
    } catch {
      /* */
    }
  };

  if (photos.length === 0) {
    return (
      <p className={styles.tip}>
        Nenhuma foto importada nesta ocorrência.
      </p>
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.toolbar}>
        <span className={styles.dim}>{photos.length} fotos</span>
        {feedback && <span className={styles.dim}>· {feedback}</span>}
      </div>
      <div className={styles.card} style={{ padding: 0 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th></th>
              <th>Identificador</th>
              <th>Categoria</th>
              <th>Caminho</th>
              <th>Tamanho</th>
              <th>SHA-256</th>
              <th>Status</th>
              <th>Em laudo</th>
              <th>Importada em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {photos.map((p) => (
              <PhotoRow
                key={p.id}
                item={p}
                workspacePath={workspacePath}
                onOpen={() => void open(p.relative_path)}
                onReveal={() => void reveal(p.relative_path)}
                onCopyPath={() => void copyRel(p.relative_path)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PhotoRow({
  item,
  workspacePath,
  onOpen,
  onReveal,
  onCopyPath,
}: {
  item: EvidenceRegistryItem;
  workspacePath: string;
  onOpen: () => void;
  onReveal: () => void;
  onCopyPath: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const src = item.relative_path
    ? assetUrl(workspacePath, item.relative_path)
    : null;
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
      <td>{item.original_id ?? item.title ?? <span className={styles.dim}>—</span>}</td>
      <td>{item.description ?? <span className={styles.dim}>—</span>}</td>
      <td>
        <code>{item.relative_path ?? "—"}</code>
      </td>
      <td>{prettyBytes(item.size_bytes)}</td>
      <td>
        <code title={item.hash_sha256 ?? ""}>{shortHash(item.hash_sha256)}</code>
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
            title="Abrir foto"
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
            onClick={onCopyPath}
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
