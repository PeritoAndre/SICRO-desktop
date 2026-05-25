/**
 * Document validators — produce warnings the Inspector surfaces.
 *
 * Spike B implements only the lightweight checks listed in doc 04 §31:
 *   - figures without a caption;
 *   - system_data nodes still in `pending` state.
 *
 * The validator returns warnings, never errors — the document is always
 * saveable. Critical blocks (signature, conclusion) are out of scope for
 * Spike B.
 */

import type { JSONContent } from "@tiptap/core";
import type { SicroDoc } from "./schema";

export type WarningSeverity = "info" | "warning";

export interface DocumentWarning {
  id: string;
  severity: WarningSeverity;
  message: string;
  hint?: string;
}

export function validateSicroDoc(doc: SicroDoc): DocumentWarning[] {
  const warnings: DocumentWarning[] = [];

  let figureIndex = 0;
  let croquiIndex = 0;
  let pendingSystemData = 0;

  walk(doc.content, (node) => {
    if (node.type === "figure") {
      const kind = (node.attrs?.kind as string | undefined) ?? "image";
      if (kind === "croqui") croquiIndex += 1;
      else figureIndex += 1;
      const ordinal = kind === "croqui" ? croquiIndex : figureIndex;

      const figcap = (node.content ?? []).find((c) => c.type === "figcaption");
      const text = textOf(figcap);
      if (!text || text.trim().length === 0) {
        warnings.push({
          id: `figure-no-caption-${kind}-${ordinal}`,
          severity: "warning",
          message: `${kind === "croqui" ? "Croqui" : "Figura"} ${ordinal} sem legenda.`,
          hint: "Toda figura deve ter legenda descritiva.",
        });
      }
    }

    if (
      node.type === "systemData" &&
      (node.attrs?.review_status ?? "pending") === "pending"
    ) {
      pendingSystemData += 1;
    }
  });

  if (pendingSystemData > 0) {
    warnings.push({
      id: "system-data-pending",
      severity: "info",
      message: `${pendingSystemData} dado(s) do sistema aguardando revisão.`,
      hint: "Clique em cada destaque amarelo no documento para revisar.",
    });
  }

  return warnings;
}

function walk(node: JSONContent, visit: (n: JSONContent) => void) {
  visit(node);
  if (!node.content) return;
  for (const child of node.content) walk(child, visit);
}

function textOf(node: JSONContent | undefined): string {
  if (!node) return "";
  let buf = "";
  walk(node, (n) => {
    if (n.type === "text" && typeof n.text === "string") buf += n.text;
  });
  return buf;
}
