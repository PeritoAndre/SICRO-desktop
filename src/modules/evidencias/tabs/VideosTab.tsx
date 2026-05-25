/**
 * VideosTab — lista vídeos registrados com codec, resolução, hash,
 * status e contadores de eventos/frames.
 */

import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Folder } from "lucide-react";
import { commands } from "@core/commands";
import { toSicroError } from "@core/errors";
import type { EvidenceRegistryItem } from "@domain/evidence_registry";
import type { VideoMedia } from "@domain/video";
import { formatDateTime } from "@core/formatters";
import {
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

export function VideosTab({ items, workspacePath }: Props) {
  const videos = useMemo(
    () => items.filter((i) => i.kind === "video"),
    [items],
  );
  const frames = useMemo(
    () => items.filter((i) => i.kind === "storyboard_frame"),
    [items],
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [bundles, setBundles] = useState<Record<string, VideoMedia>>({});

  // Pull the full VideoMedia rows once (the registry item already has
  // most of the info but we want event counts which require a separate
  // call to openVideoMedia per id — kept lazy via listVideoMedia which
  // is cheap).
  useEffect(() => {
    let cancelled = false;
    if (videos.length === 0) return;
    commands
      .listVideoMedia(workspacePath)
      .then((vs) => {
        if (cancelled) return;
        const map: Record<string, VideoMedia> = {};
        vs.forEach((v) => {
          map[v.id] = v;
        });
        setBundles(map);
      })
      .catch(() => {
        /* não bloquear a tela por isso */
      });
    return () => {
      cancelled = true;
    };
  }, [workspacePath, videos.length]);

  const frameCountByHash = useMemo(() => {
    const m = new Map<string, number>();
    frames.forEach((f) => {
      const hash = f.original_id;
      if (!hash) return;
      m.set(hash, (m.get(hash) ?? 0) + 1);
    });
    return m;
  }, [frames]);

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

  if (videos.length === 0) {
    return <p className={styles.tip}>Nenhum vídeo registrado nesta ocorrência.</p>;
  }

  return (
    <div className={styles.section}>
      <div className={styles.toolbar}>
        <span className={styles.dim}>{videos.length} vídeo(s)</span>
        {feedback && <span className={styles.dim}>· {feedback}</span>}
      </div>

      <div className={styles.card} style={{ padding: 0 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Filename</th>
              <th>Caminho</th>
              <th>Codec</th>
              <th>Resolução</th>
              <th>Duração</th>
              <th>Tamanho</th>
              <th>SHA-256</th>
              <th>Frames</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v) => {
              const meta = bundles[v.id.split(":")[1] ?? ""];
              const fc = v.hash_sha256
                ? frameCountByHash.get(v.hash_sha256) ?? 0
                : 0;
              return (
                <tr key={v.id}>
                  <td>{v.title ?? "—"}</td>
                  <td>
                    <code>{v.relative_path ?? "—"}</code>
                  </td>
                  <td>{meta?.codec ?? v.subtype ?? "—"}</td>
                  <td>
                    {meta?.width && meta?.height
                      ? `${meta.width}×${meta.height}`
                      : v.description ?? "—"}
                  </td>
                  <td>
                    {meta?.duration_s != null
                      ? `${meta.duration_s.toFixed(1)} s`
                      : "—"}
                  </td>
                  <td>{prettyBytes(v.size_bytes)}</td>
                  <td>
                    <code title={v.hash_sha256 ?? ""}>
                      {shortHash(v.hash_sha256)}
                    </code>
                  </td>
                  <td>{fc}</td>
                  <td>
                    <span
                      className={statusClass(v.integrity_status, styles)}
                      title={v.integrity_detail ?? undefined}
                    >
                      {statusLabel(v.integrity_status)}
                    </span>
                  </td>
                  <td>
                    <div className={styles.actionsRow}>
                      <button
                        type="button"
                        className={styles.actionsBtn}
                        onClick={() => void open(v.relative_path)}
                        disabled={!v.relative_path}
                        title="Abrir no player do sistema"
                      >
                        <ExternalLink size={11} />
                      </button>
                      <button
                        type="button"
                        className={styles.actionsBtn}
                        onClick={() => void reveal(v.relative_path)}
                        disabled={!v.relative_path}
                        title="Revelar na pasta"
                      >
                        <Folder size={11} />
                      </button>
                      <button
                        type="button"
                        className={styles.actionsBtn}
                        onClick={() => void copyRel(v.relative_path)}
                        disabled={!v.relative_path}
                        title="Copiar caminho"
                      >
                        <Copy size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.tip}>
        Para abrir um vídeo dentro do SICRO use o módulo <strong>Vídeo</strong>
        — esta aba só inspeciona/audita.
        {Object.values(bundles).map((b) => formatDateTime(b.updated_at)).slice(0, 0)}
      </p>
    </div>
  );
}
