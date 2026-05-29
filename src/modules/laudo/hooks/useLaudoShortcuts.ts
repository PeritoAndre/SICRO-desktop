/**
 * useLaudoShortcuts — atalhos globais do editor de laudo.
 *
 * Captura combinações no `window` (com guard contra inputs externos) e
 * dispara callbacks correspondentes:
 *
 *   - Ctrl+S        → onSave
 *   - Ctrl+F        → onFind
 *   - Ctrl+H        → onReplace (opcional, mesma barra)
 *   - Ctrl+P        → onExport (PDF)
 *   - Ctrl+Shift+L  → onToggleNavigation (futuro)
 *   - Esc           → onEscape (fecha modais/barra de localizar)
 *
 * Ctrl+B/I/U/Z/Y já são tratados pelo TipTap nativamente — não duplicamos.
 *
 * MacOS: respeita `metaKey` (Cmd) como sinônimo de `ctrlKey`.
 *
 * O hook fica ativo enquanto montado — desabilitar via `enabled=false`.
 */

import { useEffect } from "react";

export interface LaudoShortcutHandlers {
  onSave?: () => void;
  onFind?: () => void;
  onReplace?: () => void;
  onExport?: () => void;
  onEscape?: () => void;
  /**
   * F3 — atalhos de zoom (Ctrl+=, Ctrl+−, Ctrl+0).
   *
   * Ctrl++ usa key === "=" porque a maioria dos teclados envia "=" quando
   * Shift+= não é segurado. Aceitamos "+" também por compatibilidade.
   */
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  /**
   * F4 — atalhos de estilo documental (Ctrl+Alt+0..7).
   *
   * Recebe o dígito da tecla e o callback decide para qual estilo
   * mapear. Mantém o mapeamento fora do hook (caller usa `applyLaudoStyle`).
   *
   *   - Ctrl+Alt+0 → Normal
   *   - Ctrl+Alt+1 → Título 1
   *   - Ctrl+Alt+2 → Título 2
   *   - Ctrl+Alt+3 → Título 3
   *   - Ctrl+Alt+4 → Subtítulo
   *   - Ctrl+Alt+5 → Seção técnica
   *   - Ctrl+Alt+6 → Quesito
   *   - Ctrl+Alt+7 → Resposta
   */
  onApplyStyle?: (digit: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7) => void;
  enabled?: boolean;
}

export function useLaudoShortcuts({
  onSave,
  onFind,
  onReplace,
  onExport,
  onEscape,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onApplyStyle,
  enabled = true,
}: LaudoShortcutHandlers): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;

    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Esc — sempre, mesmo sem modifier.
      if (key === "escape" && onEscape) {
        onEscape();
        return;
      }

      if (!mod) return;

      // Não interceptar atalhos do TipTap (B/I/U/Z/Y). Eles propagam
      // pelo próprio editor.
      if (key === "b" || key === "i" || key === "u") return;
      if (key === "z" || key === "y") return;

      // F4 — Ctrl+Alt+digit aplica estilos documentais. Tem prioridade
      // sobre os atalhos sem Alt para que Ctrl+Alt+1 vire "Título 1"
      // e não colida com o Ctrl+0/= do zoom (que NÃO usam Alt).
      if (e.altKey && onApplyStyle) {
        const digit = mapKeyToStyleDigit(key);
        if (digit !== null) {
          e.preventDefault();
          onApplyStyle(digit);
          return;
        }
      }

      if (key === "s" && onSave) {
        e.preventDefault();
        onSave();
      } else if (key === "f" && onFind) {
        e.preventDefault();
        onFind();
      } else if (key === "h" && onReplace) {
        e.preventDefault();
        onReplace();
      } else if (key === "p" && onExport) {
        e.preventDefault();
        onExport();
      } else if ((key === "=" || key === "+") && onZoomIn) {
        e.preventDefault();
        onZoomIn();
      } else if (key === "-" && onZoomOut) {
        e.preventDefault();
        onZoomOut();
      } else if (key === "0" && onZoomReset) {
        e.preventDefault();
        onZoomReset();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    enabled,
    onSave,
    onFind,
    onReplace,
    onExport,
    onEscape,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onApplyStyle,
  ]);
}

/** F4 — Mapeia uma key do KeyboardEvent para o dígito (0..7) ou null. */
function mapKeyToStyleDigit(key: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | null {
  switch (key) {
    case "0":
      return 0;
    case "1":
      return 1;
    case "2":
      return 2;
    case "3":
      return 3;
    case "4":
      return 4;
    case "5":
      return 5;
    case "6":
      return 6;
    case "7":
      return 7;
    default:
      return null;
  }
}
