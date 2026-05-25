/** Shared helpers for the Image Editor (MVP 7). */

import { convertFileSrc } from "@tauri-apps/api/core";

export function assetUrl(
  workspacePath: string,
  relativePath: string,
): string | null {
  if (!workspacePath || !relativePath) return null;
  const sep = workspacePath.includes("\\") ? "\\" : "/";
  const trimmed = workspacePath.replace(/[\\/]+$/, "");
  const normRel = sep === "\\"
    ? relativePath.replace(/\//g, "\\")
    : relativePath.replace(/\\/g, "/");
  try {
    return convertFileSrc(`${trimmed}${sep}${normRel}`);
  } catch {
    return null;
  }
}

export function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

export function prettyBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function shortHash(h: string | null | undefined, n = 10): string {
  if (!h) return "—";
  return h.length <= n ? h : `${h.slice(0, n)}…`;
}

/** Build a CSS filter string from the live adjustments (preview-only). */
export function adjustmentsToCssFilter(adj: {
  brightness: number;
  contrast: number;
  gamma: number;
  saturation: number;
  grayscale: boolean;
  invert: boolean;
}): string {
  // Brightness +50 → 1.5; contrast +50 → 1.5; saturation +50 → 1.5
  const b = 1 + adj.brightness / 100;
  const c = 1 + adj.contrast / 100;
  const s = 1 + adj.saturation / 100;
  // CSS doesn't have a gamma filter — we approximate via brightness when
  // gamma != 1 (good enough for live preview; the backend pipeline uses
  // the real pow() at export).
  const parts: string[] = [];
  if (Math.abs(b - 1) > 1e-3) parts.push(`brightness(${b.toFixed(2)})`);
  if (Math.abs(c - 1) > 1e-3) parts.push(`contrast(${c.toFixed(2)})`);
  if (Math.abs(s - 1) > 1e-3) parts.push(`saturate(${s.toFixed(2)})`);
  if (adj.grayscale) parts.push("grayscale(1)");
  if (adj.invert) parts.push("invert(1)");
  return parts.join(" ");
}
