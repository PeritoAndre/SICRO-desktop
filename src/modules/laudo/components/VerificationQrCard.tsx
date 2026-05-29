/**
 * VerificationQrCard — exibe o QR code de verificação para laudos
 * finalizados.
 *
 * F12.8 — Renderiza o QR + metadados (document_id, hash truncado,
 * timestamp) num card compacto. Usado:
 *   - Inspector aba "Finalização" (visualizar o selo).
 *   - HtmlPreview (preview do que vai pro PDF).
 *   - Renderer HTML/PDF embute uma versão server-side via Data URI.
 *
 * Mostra estado de loading enquanto o QR é gerado (síncrono em
 * milissegundos, mas a API é async).
 */

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { SicroDocFinalization } from "../document-engine/schema";
import {
  buildVerificationPayload,
  renderVerificationQrPngDataUri,
} from "../services/verificationQrCode";
import styles from "./VerificationQrCard.module.css";

interface VerificationQrCardProps {
  documentId: string;
  finalization: SicroDocFinalization;
  /** Tamanho do QR em px (default 140). */
  sizePx?: number;
  /** Esconde os metadados textuais (só QR). */
  compact?: boolean;
}

export function VerificationQrCard({
  documentId,
  finalization,
  sizePx = 140,
  compact = false,
}: VerificationQrCardProps) {
  const [qrDataUri, setQrDataUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setQrDataUri(null);
    renderVerificationQrPngDataUri(
      { documentId, finalization },
      { sizePx: sizePx * 2 }, // 2x para densidade hi-DPI
    )
      .then((uri) => {
        if (!cancelled) setQrDataUri(uri);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err?.message ?? err));
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, finalization, sizePx]);

  const payload = buildVerificationPayload({ documentId, finalization });
  const shortHash = `${finalization.content_hash.slice(0, 12)}…`;
  const finalizedDate = new Date(finalization.finalized_at).toLocaleString(
    "pt-BR",
  );

  return (
    <div className={`${styles.card} ${compact ? styles.compact : ""}`}>
      <div className={styles.qrWrap} style={{ width: sizePx, height: sizePx }}>
        {error && (
          <div className={styles.error} title={error}>
            Erro
          </div>
        )}
        {!error && !qrDataUri && <div className={styles.skeleton} />}
        {qrDataUri && (
          <img
            src={qrDataUri}
            alt="QR Code de verificação"
            width={sizePx}
            height={sizePx}
            className={styles.qrImg}
          />
        )}
      </div>
      {!compact && (
        <div className={styles.meta}>
          <div className={styles.metaHead}>
            <ShieldCheck size={14} className={styles.metaIcon} />
            <strong>Laudo verificável</strong>
          </div>
          <dl className={styles.metaList}>
            <div>
              <dt>ID</dt>
              <dd className={styles.mono}>{documentId.slice(0, 8)}</dd>
            </div>
            <div>
              <dt>Hash</dt>
              <dd className={styles.mono}>{shortHash}</dd>
            </div>
            <div>
              <dt>Finalizado</dt>
              <dd>{finalizedDate}</dd>
            </div>
            <div>
              <dt>Por</dt>
              <dd>{finalization.finalized_by}</dd>
            </div>
          </dl>
          <small className={styles.hint}>
            Aponte a câmera de um dispositivo confiável para verificar a
            integridade do laudo.
          </small>
          <code className={styles.payload}>{payload}</code>
        </div>
      )}
    </div>
  );
}
