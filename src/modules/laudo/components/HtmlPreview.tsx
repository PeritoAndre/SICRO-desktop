/**
 * HtmlPreview — full-document HTML render of the active laudo.
 *
 * Validates Spike B's "criterion 12: HTML intermediário pode ser gerado".
 * The HTML is produced from the in-memory TipTap doc (not the saved
 * `.sicrodoc`) so the preview reflects unsaved edits.
 */

import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, X } from "lucide-react";
import {
  loadBrandingAssets,
  renderSicroDocToHtml,
  type BrandingAssets,
  type SicroDoc,
} from "../document-engine";
import type { Occurrence } from "@domain/occurrence";
import styles from "./HtmlPreview.module.css";

interface HtmlPreviewProps {
  doc: SicroDoc | null;
  liveContent: SicroDoc["content"] | null;
  /** Optional — feeds the institutional header (MVP 2). */
  occurrence?: Occurrence | null;
  onClose: () => void;
}

export function HtmlPreview({
  doc,
  liveContent,
  occurrence,
  onClose,
}: HtmlPreviewProps) {
  const [branding, setBranding] = useState<BrandingAssets | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadBrandingAssets().then((assets) => {
      if (!cancelled) setBranding(assets);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const html = useMemo(() => {
    if (!doc) return "";
    const docWithLiveContent: SicroDoc = liveContent
      ? { ...doc, content: liveContent }
      : doc;
    return renderSicroDocToHtml(docWithLiveContent, {
      fullDocument: true,
      occurrence: (occurrence as unknown as Record<string, unknown>) ?? null,
      branding,
    });
  }, [doc, liveContent, occurrence, branding]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(html);
    } catch {
      /* ignored — clipboard may be unavailable in Tauri without permission */
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-label="Prévia HTML do laudo">
      <div className={styles.bar}>
        <span className={styles.title}>
          <Eye size={16} /> Prévia HTML (renderização intermediária do Document Engine)
        </span>
        <div className={styles.actions}>
          <button type="button" className={styles.copyBtn} onClick={copy}>
            <Copy size={14} /> Copiar HTML
          </button>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            <X size={14} /> Fechar
          </button>
        </div>
      </div>
      <div className={styles.iframeWrap}>
        <iframe
          title="Prévia HTML do laudo"
          className={styles.iframe}
          srcDoc={html}
          sandbox=""
        />
      </div>
    </div>
  );
}
