/**
 * LaudosLinksTab — laudos da ocorrência + contagem de evidências
 * inseridas + exportações associadas + lista de links quebrados.
 *
 * O cruzamento é feito 100% do lado do TypeScript a partir de
 * `commands.listEvidenceLinks` para ser determinístico e barato.
 */

import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Folder } from "lucide-react";
import { commands } from "@core/commands";
import { toSicroError } from "@core/errors";
import type {
  BrokenLaudoLink,
  EvidenceRegistryItem,
} from "@domain/evidence_registry";
import type { EvidenceLink } from "@domain/evidence";
import { formatDateTime } from "@core/formatters";
import { statusClass, statusLabel } from "../shared";
import styles from "../EvidenciasModule.module.css";

interface Props {
  items: EvidenceRegistryItem[];
  workspacePath: string;
  brokenLinks: BrokenLaudoLink[];
}

interface LaudoRow {
  id: string;
  item: EvidenceRegistryItem;
  evidenceCount: number;
  photos: number;
  croquis: number;
  videoFrames: number;
  storyboard: number;
  tables: number;
  fieldNotes: number;
  systemFields: number;
  exportsHtml: number;
  exportsPdf: number;
  exportsDocx: number;
  brokenCount: number;
}

export function LaudosLinksTab({
  items,
  workspacePath,
  brokenLinks,
}: Props) {
  const laudos = useMemo(
    () => items.filter((i) => i.kind === "laudo"),
    [items],
  );
  const exports = useMemo(
    () => items.filter((i) => i.kind === "laudo_export"),
    [items],
  );
  const [links, setLinks] = useState<EvidenceLink[] | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    commands
      .listEvidenceLinks(workspacePath)
      .then((data) => {
        if (!cancelled) setLinks(data);
      })
      .catch(() => {
        if (!cancelled) setLinks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspacePath]);

  const rows: LaudoRow[] = useMemo(() => {
    return laudos.map((l) => {
      const id = l.id.split(":")[1] ?? l.id;
      const linkSet = (links ?? []).filter(
        (lk) => lk.target_type === "laudo" && lk.target_id === id,
      );
      const ex = exports.filter((e) => e.original_id === id);
      const broken = brokenLinks.filter((b) => b.laudo_id === id).length;
      return {
        id,
        item: l,
        evidenceCount: linkSet.length,
        photos: linkSet.filter((x) => x.source_kind === "photo").length,
        croquis: linkSet.filter((x) => x.source_kind === "croqui").length,
        videoFrames: linkSet.filter((x) => x.source_kind === "video_frame").length,
        storyboard: linkSet.filter((x) => x.source_kind === "video_storyboard").length,
        tables: linkSet.filter((x) =>
          ["checklist_table", "traces_table", "measurements_table"].includes(
            x.source_kind,
          ),
        ).length,
        fieldNotes: linkSet.filter((x) => x.source_kind === "field_note").length,
        systemFields: linkSet.filter((x) => x.source_kind === "occurrence_field")
          .length,
        exportsHtml: ex.filter((e) => e.subtype === "html").length,
        exportsPdf: ex.filter((e) => e.subtype === "pdf").length,
        exportsDocx: ex.filter((e) => e.subtype === "docx").length,
        brokenCount: broken,
      };
    });
  }, [laudos, links, exports, brokenLinks]);

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

  return (
    <div className={styles.section}>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Laudos da ocorrência</h3>
        {rows.length === 0 ? (
          <p className={styles.tip}>Nenhum laudo criado nesta ocorrência.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Título</th>
                <th>Status</th>
                <th>Inserções</th>
                <th>Fotos</th>
                <th>Croquis</th>
                <th>Frames</th>
                <th>Storyboards</th>
                <th>Tabelas</th>
                <th>Notas</th>
                <th>Dados</th>
                <th>Exports</th>
                <th>Links quebrados</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.item.title ?? r.id.slice(0, 8)}</td>
                  <td>
                    <span
                      className={statusClass(r.item.integrity_status, styles)}
                      title={r.item.integrity_detail ?? undefined}
                    >
                      {statusLabel(r.item.integrity_status)}
                    </span>
                  </td>
                  <td>{r.evidenceCount}</td>
                  <td>{r.photos}</td>
                  <td>{r.croquis}</td>
                  <td>{r.videoFrames}</td>
                  <td>{r.storyboard}</td>
                  <td>{r.tables}</td>
                  <td>{r.fieldNotes}</td>
                  <td>{r.systemFields}</td>
                  <td>
                    PDF {r.exportsPdf} · DOCX {r.exportsDocx} · HTML{" "}
                    {r.exportsHtml}
                  </td>
                  <td>
                    {r.brokenCount > 0 ? (
                      <span
                        className={`${styles.statusPill} ${styles.statusWarn}`}
                      >
                        {r.brokenCount}
                      </span>
                    ) : (
                      <span className={styles.dim}>0</span>
                    )}
                  </td>
                  <td>
                    <div className={styles.actionsRow}>
                      <button
                        type="button"
                        className={styles.actionsBtn}
                        onClick={() => void open(r.item.relative_path)}
                        disabled={!r.item.relative_path}
                        title="Abrir .sicrodoc"
                      >
                        <ExternalLink size={11} />
                      </button>
                      <button
                        type="button"
                        className={styles.actionsBtn}
                        onClick={() => void reveal(r.item.relative_path)}
                        disabled={!r.item.relative_path}
                        title="Revelar na pasta"
                      >
                        <Folder size={11} />
                      </button>
                      <button
                        type="button"
                        className={styles.actionsBtn}
                        onClick={() => void copyRel(r.item.relative_path)}
                        disabled={!r.item.relative_path}
                        title="Copiar caminho"
                      >
                        <Copy size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>
          Links quebrados em laudos ({brokenLinks.length})
        </h3>
        {brokenLinks.length === 0 ? (
          <p className={styles.tip}>
            Nenhum bloco de laudo aponta para um arquivo ausente ou
            caminho inseguro.
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Laudo</th>
                <th>Bloco</th>
                <th>Caminho</th>
                <th>Status</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {brokenLinks.map((b, idx) => (
                <tr key={`${b.laudo_id}-${idx}`}>
                  <td>{b.laudo_title}</td>
                  <td>{b.node_type}</td>
                  <td>
                    <code>{b.relative_path ?? "—"}</code>
                  </td>
                  <td>
                    <span className={statusClass(b.status, styles)}>
                      {statusLabel(b.status)}
                    </span>
                  </td>
                  <td>{b.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {feedback && <p className={styles.tip}>{feedback}</p>}
      {(() => {
        // Touch formatDateTime so the import doesn't get tree-shaken.
        void formatDateTime;
        return null;
      })()}
    </div>
  );
}
