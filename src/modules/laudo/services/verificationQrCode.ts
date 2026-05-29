/**
 * verificationQrCode — gera o QR Code de verificação institucional
 * para o laudo finalizado.
 *
 * F12.8 — Quando o laudo é finalizado (status === "final"), o doc ganha
 * um `finalization` selo com hash SHA-256 do conteúdo. Esse QR Code é
 * impresso na última página do PDF/print para permitir verificação por
 * outras autoridades — basta apontar a câmera e o app oficial confere
 * se o hash bate.
 *
 * O payload codificado é uma URL de verificação com schema custom:
 *   `sicro://verify?id=<document_id>&h=<content_hash>&t=<finalized_at>`
 *
 * Esquema custom porque o app móvel pode interceptar; alternativamente
 * o backend institucional roda em `verifica.policiacientifica.ap.gov.br`
 * (config injetada no env). Por enquanto fica o schema offline.
 */

import QRCode from "qrcode";
import type { SicroDocFinalization } from "../document-engine/schema";

/**
 * Base URL da verificação. Quando o portal estiver online, troque para
 * `https://verifica.policiacientifica.ap.gov.br/laudo`.
 */
const VERIFICATION_BASE_URL = "sicro://verify";

export interface QrPayloadFields {
  documentId: string;
  finalization: SicroDocFinalization;
}

/** Monta o payload textual que vai dentro do QR. */
export function buildVerificationPayload(fields: QrPayloadFields): string {
  const { documentId, finalization } = fields;
  const params = new URLSearchParams({
    id: documentId,
    h: finalization.content_hash,
    t: finalization.finalized_at,
  });
  return `${VERIFICATION_BASE_URL}?${params.toString()}`;
}

/**
 * Renderiza o QR como Data URI PNG. Usado pelo renderer HTML/PDF para
 * embutir no documento exportado sem precisar de fetch externo.
 */
export async function renderVerificationQrPngDataUri(
  fields: QrPayloadFields,
  options: { sizePx?: number; margin?: number } = {},
): Promise<string> {
  const payload = buildVerificationPayload(fields);
  return QRCode.toDataURL(payload, {
    type: "image/png",
    errorCorrectionLevel: "M",
    margin: options.margin ?? 2,
    width: options.sizePx ?? 160,
    color: {
      dark: "#111111",
      light: "#FFFFFF",
    },
  });
}

/**
 * Renderiza o QR como SVG string. Útil para vetorizar dentro do HTML
 * sem inflar com base64 (PDF prefere SVG).
 */
export async function renderVerificationQrSvg(
  fields: QrPayloadFields,
  options: { margin?: number } = {},
): Promise<string> {
  const payload = buildVerificationPayload(fields);
  return QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: options.margin ?? 2,
    color: {
      dark: "#111111",
      light: "#FFFFFF",
    },
  });
}
