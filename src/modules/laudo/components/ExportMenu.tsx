/**
 * ExportMenu — dropdown next to "Salvar" that triggers Export Engine commands.
 *
 * Spike C: exposes the three supported targets (HTML / PDF / DOCX) and shows
 * the most recent exports below for context.
 */

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  FileCode,
  FileText,
  FileType,
} from "lucide-react";
import { commands } from "@core/commands";
import { toSicroError } from "@core/errors";
import {
  loadBrandingAssets,
  renderSicroDocToHtml,
  type SicroDoc,
} from "../document-engine";
import { formatRelative } from "@core/formatters";
import type { Export } from "@domain/export";
import styles from "./ExportMenu.module.css";

interface ExportMenuProps {
  workspacePath: string;
  laudoId: string;
  /** Title currently shown in the editor — surfaced in the menu so it is
   *  unambiguous WHICH laudo will be exported (Spike C runtime feedback). */
  laudoTitle?: string;
  doc: SicroDoc | null;
  /** Active occurrence — feeds the institutional header (MVP 2). */
  occurrence?: Record<string, unknown> | null;
}

type Status =
  | { kind: "idle" }
  | { kind: "running"; target: "html" | "pdf" | "docx" }
  | { kind: "success"; path: string }
  | { kind: "error"; message: string };

export function ExportMenu({
  workspacePath,
  laudoId,
  laudoTitle,
  doc,
  occurrence,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [recent, setRecent] = useState<Export[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  // Load the recents list on first open.
  useEffect(() => {
    if (!open) return;
    void commands
      .listLaudoExports(workspacePath, laudoId)
      .then(setRecent)
      .catch(() => {
        /* swallow — the recent list is non-critical */
      });
  }, [open, workspacePath, laudoId]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const runExport = async (target: "html" | "pdf" | "docx") => {
    if (!doc) return;
    setStatus({ kind: "running", target });
    try {
      let result: Export;
      if (target === "docx") {
        // DOCX reads the .sicrodoc directly on the Rust side — no HTML needed.
        result = await commands.exportLaudoDocx(workspacePath, laudoId);
      } else {
        // Branding assets are baked into the HTML as data URIs so the Edge
        // headless print-to-pdf step (which reads the HTML from a temp file)
        // can show the coats of arms without resolving /branding/ paths.
        const branding = await loadBrandingAssets();
        const html = renderSicroDocToHtml(doc, {
          fullDocument: true,
          occurrence: occurrence ?? null,
          branding,
        });
        result =
          target === "pdf"
            ? await commands.exportLaudoPdf(workspacePath, laudoId, html)
            : await commands.exportLaudoHtml(workspacePath, laudoId, html);
      }
      setStatus({ kind: "success", path: result.relative_path });
      // Refresh recents
      try {
        setRecent(await commands.listLaudoExports(workspacePath, laudoId));
      } catch {
        /* ignored */
      }
    } catch (err) {
      setStatus({ kind: "error", message: toSicroError(err).message });
    }
  };

  return (
    <div className={styles.wrap} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        disabled={!doc}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download size={14} /> Exportar <ChevronDown size={12} />
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          {(laudoTitle || laudoId) && (
            <>
              <div className={styles.section}>Laudo a exportar</div>
              <div
                className={styles.recentItem}
                title={laudoId}
                style={{ paddingTop: 0, paddingBottom: 4 }}
              >
                <code style={{ flex: 1 }}>
                  {laudoTitle ?? laudoId}
                </code>
              </div>
              <div className={styles.divider} />
            </>
          )}
          <div className={styles.section}>Exportar como…</div>
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => void runExport("pdf")}
            disabled={status.kind === "running"}
          >
            <FileText size={14} />
            PDF
            <span className={styles.itemMeta}>
              {status.kind === "running" && status.target === "pdf"
                ? "renderizando…"
                : "via Edge headless"}
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => void runExport("docx")}
            disabled={status.kind === "running"}
          >
            <FileType size={14} />
            DOCX
            <span className={styles.itemMeta}>
              {status.kind === "running" && status.target === "docx"
                ? "gerando…"
                : "via docx-rs"}
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => void runExport("html")}
            disabled={status.kind === "running"}
          >
            <FileCode size={14} />
            HTML
            <span className={styles.itemMeta}>
              {status.kind === "running" && status.target === "html"
                ? "salvando…"
                : "intermediário"}
            </span>
          </button>

          {status.kind === "success" && (
            <>
              <div className={styles.divider} />
              <div className={styles.feedback}>
                Salvo em <code>{status.path}</code>
              </div>
            </>
          )}
          {status.kind === "error" && (
            <>
              <div className={styles.divider} />
              <div className={`${styles.feedback} ${styles.error}`}>
                Falha: {status.message}
              </div>
            </>
          )}

          {recent.length > 0 && (
            <>
              <div className={styles.divider} />
              <div className={styles.section}>Exportações recentes</div>
              <div className={styles.recent}>
                {recent.slice(0, 5).map((e) => (
                  <div key={e.id} className={styles.recentItem}>
                    <span style={{ textTransform: "uppercase" }}>{e.kind}</span>
                    <code title={e.relative_path}>{e.relative_path}</code>
                    <span>{formatRelative(e.created_at)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
