/**
 * laudoExport — helper compartilhado para exportar o laudo em PDF/HTML/DOCX.
 *
 * K — Centraliza a lógica que estava espalhada entre o `ExportMenu` e
 * outros pontos (tipo o botão SIGDOC do toolbar, ou o passo 1 da
 * assinatura SIGDOCS). Sempre que possível, abre o Explorer na pasta
 * do arquivo gerado.
 *
 * Não inclui UI/toast — quem chama é responsável por feedback. Aqui
 * só roda o pipeline.
 */

import { commands } from "@core/commands";
import {
  collectEvidencePaths,
  loadBrandingAssets,
  loadEvidenceAssets,
  normalizeEvidenceSrcsForSave,
  renderSicroDocToHtml,
  type SicroDoc,
} from "../document-engine";
import type { Export } from "@domain/export";

export type ExportTarget = "pdf" | "html" | "docx";

export interface ExportResult {
  export: Export;
  /** Caminho absoluto resolvido (sempre presente, ainda que o backend
   *  só conheça `relative_path`). Pode ser usado no `revealPathInExplorer`. */
  absolute_path: string;
}

/**
 * Exporta o laudo para o formato pedido. Quando `revealAfter=true`
 * (default), abre o Explorer apontando pro arquivo gerado.
 */
export async function exportLaudo(
  target: ExportTarget,
  workspacePath: string,
  laudoId: string,
  doc: SicroDoc,
  occurrence: Record<string, unknown> | null,
  options: { revealAfter?: boolean } = {},
): Promise<ExportResult> {
  const revealAfter = options.revealAfter ?? true;

  let result: Export;
  if (target === "docx") {
    result = await commands.exportLaudoDocx(workspacePath, laudoId);
  } else {
    const branding = await loadBrandingAssets();
    const portableContent = normalizeEvidenceSrcsForSave(doc.content);
    const evidencePaths = collectEvidencePaths(portableContent);
    const evidenceAssets =
      evidencePaths.size > 0
        ? await loadEvidenceAssets(workspacePath, evidencePaths)
        : null;
    let verificationQrDataUri: string | null = null;
    if (doc.finalization) {
      try {
        const { renderVerificationQrPngDataUri } = await import(
          "./verificationQrCode"
        );
        verificationQrDataUri = await renderVerificationQrPngDataUri(
          { documentId: doc.document_id, finalization: doc.finalization },
          { sizePx: 256 },
        );
      } catch {
        verificationQrDataUri = null;
      }
    }
    const html = renderSicroDocToHtml(
      { ...doc, content: portableContent },
      {
        fullDocument: true,
        occurrence,
        branding,
        evidenceAssets,
        verificationQrDataUri,
      },
    );
    result =
      target === "pdf"
        ? await commands.exportLaudoPdf(workspacePath, laudoId, html)
        : await commands.exportLaudoHtml(workspacePath, laudoId, html);
  }

  // K — Caminho absoluto = workspace + relative_path. Backend retorna
  // só relative; juntamos aqui pra `revealPathInExplorer`.
  const absolute = joinPaths(workspacePath, result.relative_path);

  if (revealAfter) {
    try {
      await commands.revealPathInExplorer(absolute);
    } catch {
      /* non-fatal */
    }
  }

  return { export: result, absolute_path: absolute };
}

/**
 * Junta workspace + relative path com o separador certo (\ no Windows,
 * / em macOS/Linux). Detecta plataforma via presença de \ no workspace.
 */
function joinPaths(workspace: string, relative: string): string {
  const sep = workspace.includes("\\") ? "\\" : "/";
  const ws = workspace.replace(/[\\/]+$/, "");
  const rel = relative.replace(/^[\\/]+/, "").replace(/\//g, sep);
  return `${ws}${sep}${rel}`;
}
