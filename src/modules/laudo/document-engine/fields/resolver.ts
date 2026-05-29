/**
 * resolveFieldValue — resolve o valor de um `{{campo}}` em tempo de
 * renderização, dado o contexto do laudo (occurrence + metadata).
 *
 * F5 — Funciona como single source of truth para:
 *   - o renderer HTML (mostra o valor no PDF/HTML);
 *   - o painel de campos (mostra preview "valor: ____");
 *   - a validação (decide se o campo obrigatório está preenchido);
 *   - eventualmente, o walker DOCX (mesma lógica no Rust ou via render).
 *
 * Função pura, sem efeitos colaterais. Aceita objetos `unknown` para os
 * dados externos — converte para string segura ou devolve null quando
 * o campo não tem valor.
 */

import { findField, type LaudoFieldDefinition } from "./catalog";

export interface FieldResolveContext {
  /** Metadados do laudo (`doc.metadata`). */
  metadata?: Record<string, unknown> | null;
  /** Ocorrência ativa (objeto retornado por `useWorkspaceStore`). */
  occurrence?: Record<string, unknown> | null;
  /**
   * Data "agora" usada para `system.data_hoje` e `data_hora_agora`.
   * Default `new Date()`. Aceita override para testes determinísticos.
   */
  now?: Date;
}

/**
 * Resolve o valor de uma `key` de campo conhecido.
 *
 *   - Retorna a string formatada quando o valor existe.
 *   - Retorna `null` quando o campo não está no catálogo.
 *   - Retorna `""` (string vazia) quando o campo está no catálogo mas
 *     a fonte não trouxe valor — diferencia "campo desconhecido" de
 *     "campo conhecido mas vazio".
 */
export function resolveFieldValue(
  key: string,
  ctx: FieldResolveContext,
): string | null {
  const def = findField(key);
  if (!def) return null;
  return resolveDefinition(def, ctx);
}

/** Variante que recebe a definição direto — útil para iteração no painel. */
export function resolveDefinition(
  def: LaudoFieldDefinition,
  ctx: FieldResolveContext,
): string {
  const source = def.source;
  if (source.kind === "fixed") {
    return source.value;
  }
  if (source.kind === "system") {
    const now = ctx.now ?? new Date();
    if (source.field === "data_hoje") return formatDateBR(now);
    if (source.field === "data_hora_agora") return formatDateTimeBR(now);
    return "";
  }
  const bag =
    source.kind === "metadata"
      ? (ctx.metadata ?? null)
      : source.kind === "occurrence"
        ? (ctx.occurrence ?? null)
        : null;
  if (!bag) return "";
  const raw = bag[source.field];
  return formatRaw(raw);
}

/**
 * Resolve TODOS os campos do catálogo de uma vez. Útil para o painel
 * e para a validação de obrigatórios. Devolve `Map<key, value>`.
 */
export function resolveAllFields(
  ctx: FieldResolveContext,
  fields: ReadonlyArray<LaudoFieldDefinition>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const def of fields) {
    out.set(def.key, resolveDefinition(def, ctx));
  }
  return out;
}

/**
 * Lista de campos obrigatórios SEM valor. Caller decide o que mostrar
 * (warning amarelo, badge no botão de exportar, etc.).
 */
export function findMissingRequiredFields(
  ctx: FieldResolveContext,
  fields: ReadonlyArray<LaudoFieldDefinition>,
): LaudoFieldDefinition[] {
  return fields.filter((def) => {
    if (def.required !== true) return false;
    return resolveDefinition(def, ctx).trim() === "";
  });
}

// ---------------------------------------------------------------------------
// Formatadores internos.

function formatRaw(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) {
    return raw
      .map((item) => formatRaw(item))
      .filter((s) => s.length > 0)
      .join("; ");
  }
  // Object: best-effort. Caller que queira controle fino formata na origem.
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

function formatDateBR(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatDateTimeBR(d: Date): string {
  return (
    `${formatDateBR(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
