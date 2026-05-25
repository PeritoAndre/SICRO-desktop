/**
 * TopBar — institutional header, always shows the active occurrence context.
 *
 * doc 03 §6.3 — must expose brand, active occurrence, current module,
 * primary actions and notifications. The spike implements brand + occurrence +
 * module breadcrumb + app version stub. Actions/notifications stay as TODO.
 */

import { useLocation } from "react-router-dom";
import { useWorkspaceStore } from "@stores/workspaceStore";
import styles from "./TopBar.module.css";

const moduleNames: Record<string, string> = {
  "/": "Início",
  "/dossie": "Dossiê",
  "/laudo": "Laudo",
  "/croqui": "Croqui",
  "/video": "Vídeo",
  "/imagens": "Imagens",
  "/midias": "Mídias",
  "/estatisticas": "Estatísticas",
  "/configuracoes": "Configurações",
};

const APP_VERSION = "2.0.0-alpha.0";

export function TopBar() {
  const { pathname } = useLocation();
  const occurrence = useWorkspaceStore((s) => s.activeOccurrence);

  const moduleLabel = moduleNames[pathname] ?? "—";
  const occurrenceLabel = occurrence ? buildOccurrenceLabel(occurrence) : null;

  return (
    <header className={styles.bar}>
      <nav className={styles.breadcrumb} aria-label="Contexto da ocorrência">
        <span className={styles.brandText}>SICRO</span>
        <span className={styles.separator} aria-hidden>
          ▸
        </span>
        {occurrenceLabel ? (
          <>
            <span
              className={styles.occurrenceLabel}
              title={occurrenceLabel}
            >
              {occurrenceLabel}
            </span>
            <span className={styles.separator} aria-hidden>
              ▸
            </span>
            <span className={styles.module}>{moduleLabel}</span>
          </>
        ) : (
          <span className={styles.module}>{moduleLabel}</span>
        )}
      </nav>
      <div className={styles.spacer} />
      <div className={styles.actions}>
        <span className={styles.appVersion}>v{APP_VERSION}</span>
      </div>
    </header>
  );
}

function buildOccurrenceLabel(
  o: NonNullable<ReturnType<typeof useWorkspaceStore.getState>["activeOccurrence"]>,
): string {
  const parts: string[] = [];
  if (o.numero_bo) parts.push(`BO ${o.numero_bo}`);
  if (o.tipo_pericia) parts.push(o.tipo_pericia);
  if (o.municipio) parts.push(o.municipio);
  return parts.length > 0 ? parts.join(" — ") : "Ocorrência sem identificação";
}
