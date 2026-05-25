/**
 * DossieModule — MVP 3 (Dossiê Operacional).
 *
 * Layout: TopBar with the BO/occurrence label + tab strip + content panel.
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Dossiê — BO 42/2026 — Macapá        [Recarregar pacote]  │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ Resumo · Fotos · Checklist · Entidades · Vestígios · ... │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  <Active tab content>                                    │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Each tab is a small, focused component in `./tabs/`. The module owns
 * the `DossieSummary` (which carries counts for the tab badges) and the
 * `workspacePath` plumbing. Tabs fetch their own list via the typed
 * commands when they mount.
 *
 * Auto-rehydration: when `summary.counts` looks mostly empty AND there's
 * a `latest_import` available, we call `rehydrateDossie` once so old
 * Spike D workspaces auto-fill the new tables without the user knowing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckSquare,
  FileArchive,
  FileText,
  History,
  Image as ImageIcon,
  ListChecks,
  MapPin,
  RefreshCw,
  Ruler,
  StickyNote,
  Users,
} from "lucide-react";
import { Button } from "@components/Button/Button";
import { commands } from "@core/commands";
import { toSicroError } from "@core/errors";
import {
  selectActiveOccurrence,
  selectActiveWorkspacePath,
  useWorkspaceStore,
} from "@stores/workspaceStore";
import type { DossieSummary } from "@domain/dossie";
import styles from "./DossieModule.module.css";

import { SummaryTab } from "./tabs/SummaryTab";
import { PhotosTab } from "./tabs/PhotosTab";
import { ChecklistTab } from "./tabs/ChecklistTab";
import { EntitiesTab } from "./tabs/EntitiesTab";
import { TracesTab } from "./tabs/TracesTab";
import { MeasurementsTab } from "./tabs/MeasurementsTab";
import { NotesTab } from "./tabs/NotesTab";
import { TimelineTab } from "./tabs/TimelineTab";
import { ImportTab } from "./tabs/ImportTab";

type TabKey =
  | "summary"
  | "photos"
  | "checklist"
  | "entities"
  | "traces"
  | "measurements"
  | "notes"
  | "timeline"
  | "import";

interface TabDef {
  key: TabKey;
  label: string;
  icon: typeof ImageIcon;
  /** Badge text shown next to the label; null = hide. */
  badge?: string | null;
}

export function DossieModule() {
  const occurrence = useWorkspaceStore(selectActiveOccurrence);
  const workspacePath = useWorkspaceStore(selectActiveWorkspacePath);

  const [summary, setSummary] = useState<DossieSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("summary");
  const [rehydrating, setRehydrating] = useState(false);
  const [rehydrateFeedback, setRehydrateFeedback] = useState<string | null>(null);
  const autoRehydrateAttemptedRef = useRef(false);

  const loadSummary = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const s = await commands.getDossieSummary(path);
        setSummary(s);
      } catch (err) {
        setError(toSicroError(err).message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!workspacePath) {
      setSummary(null);
      return;
    }
    void loadSummary(workspacePath);
  }, [workspacePath, loadSummary]);

  // Auto-rehydrate when the dossier looks empty but there's a staged
  // package available. Runs once per session per workspace.
  useEffect(() => {
    if (!workspacePath || !summary) return;
    if (autoRehydrateAttemptedRef.current) return;
    if (!summary.latest_import) return;

    const c = summary.counts;
    const isEmpty =
      c.checklist.total === 0 &&
      c.vehicles === 0 &&
      c.victims === 0 &&
      c.traces === 0 &&
      c.measurements === 0 &&
      c.notes === 0 &&
      c.timeline === 0;
    if (!isEmpty) return;

    autoRehydrateAttemptedRef.current = true;
    void (async () => {
      try {
        const outcome = await commands.rehydrateDossie(workspacePath);
        if (outcome.rehydrated) {
          await loadSummary(workspacePath);
        }
      } catch {
        // Silent — manual button still exposed on the Import tab.
      }
    })();
  }, [workspacePath, summary, loadSummary]);

  const handleRehydrate = useCallback(async () => {
    if (!workspacePath) return;
    setRehydrating(true);
    setRehydrateFeedback(null);
    try {
      const outcome = await commands.rehydrateDossie(workspacePath);
      if (!outcome.rehydrated) {
        setRehydrateFeedback("Nenhum pacote disponível para recarregar.");
      } else {
        setRehydrateFeedback(
          `Dados recarregados: ${outcome.checklist_loaded} checklist, ${outcome.entities_loaded} entidades, ${outcome.traces_loaded} vestígios, ${outcome.measurements_loaded} medições, ${outcome.notes_loaded} observações, ${outcome.timeline_loaded} eventos.`,
        );
        await loadSummary(workspacePath);
      }
    } catch (err) {
      setRehydrateFeedback(`Falha: ${toSicroError(err).message}`);
    } finally {
      setRehydrating(false);
      setTimeout(() => setRehydrateFeedback(null), 6000);
    }
  }, [workspacePath, loadSummary]);

  const tabs = useMemo<TabDef[]>(
    () => [
      { key: "summary", label: "Resumo", icon: FileText, badge: null },
      {
        key: "photos",
        label: "Fotos",
        icon: ImageIcon,
        badge: summary ? String(summary.counts.photos) : null,
      },
      {
        key: "checklist",
        label: "Checklist",
        icon: CheckSquare,
        badge: summary
          ? `${summary.counts.checklist.answered}/${summary.counts.checklist.total}`
          : null,
      },
      {
        key: "entities",
        label: "Entidades",
        icon: Users,
        badge: summary
          ? String(summary.counts.vehicles + summary.counts.victims)
          : null,
      },
      {
        key: "traces",
        label: "Vestígios",
        icon: MapPin,
        badge: summary ? String(summary.counts.traces) : null,
      },
      {
        key: "measurements",
        label: "Medições",
        icon: Ruler,
        badge: summary ? String(summary.counts.measurements) : null,
      },
      {
        key: "notes",
        label: "Observações",
        icon: StickyNote,
        badge: summary ? String(summary.counts.notes) : null,
      },
      {
        key: "timeline",
        label: "Timeline",
        icon: History,
        badge: summary ? String(summary.counts.timeline) : null,
      },
      { key: "import", label: "Importação / Integridade", icon: FileArchive, badge: null },
    ],
    [summary],
  );

  if (!workspacePath || !occurrence) {
    return (
      <div className={styles.empty}>
        <ListChecks size={36} strokeWidth={1.5} aria-hidden />
        <p>Abra uma ocorrência para ver o dossiê.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.topBar}>
        <div className={styles.title}>
          <h1>Dossiê — {summaryHeader(summary, occurrence)}</h1>
          <p className={styles.subtitle}>
            {summary?.latest_import
              ? `Importado de pacote ${summary.latest_import.format} ${summary.latest_import.schema_version}`
              : "Sem importação registrada neste workspace"}
          </p>
        </div>
        <div className={styles.topActions}>
          {rehydrateFeedback && (
            <span className={styles.feedback}>{rehydrateFeedback}</span>
          )}
          <Button
            variant="secondary"
            leftIcon={<RefreshCw size={14} />}
            onClick={() => void handleRehydrate()}
            disabled={rehydrating || !summary?.latest_import}
            title={
              summary?.latest_import
                ? "Re-extrai todos os dados estruturados do pacote .sicroapp staged"
                : "Sem pacote .sicroapp staged neste workspace"
            }
          >
            {rehydrating ? "Recarregando…" : "Recarregar pacote"}
          </Button>
        </div>
      </header>

      <nav className={styles.tabStrip} role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ""}`}
            onClick={() => setTab(t.key)}
          >
            <t.icon size={14} aria-hidden />
            <span>{t.label}</span>
            {t.badge != null && (
              <span className={styles.badge}>{t.badge}</span>
            )}
          </button>
        ))}
      </nav>

      <main className={styles.content}>
        {error && (
          <div className={styles.errorBanner}>
            <AlertTriangle size={14} /> {error}
          </div>
        )}
        {loading && !summary ? (
          <p className={styles.loading}>Carregando dossiê…</p>
        ) : !summary ? (
          <p className={styles.loading}>Sem dados.</p>
        ) : (
          <>
            {tab === "summary" && <SummaryTab summary={summary} />}
            {tab === "photos" && <PhotosTab workspacePath={workspacePath} />}
            {tab === "checklist" && (
              <ChecklistTab workspacePath={workspacePath} />
            )}
            {tab === "entities" && (
              <EntitiesTab workspacePath={workspacePath} />
            )}
            {tab === "traces" && <TracesTab workspacePath={workspacePath} />}
            {tab === "measurements" && (
              <MeasurementsTab workspacePath={workspacePath} />
            )}
            {tab === "notes" && <NotesTab workspacePath={workspacePath} />}
            {tab === "timeline" && (
              <TimelineTab workspacePath={workspacePath} />
            )}
            {tab === "import" && (
              <ImportTab
                workspacePath={workspacePath}
                summary={summary}
                onRehydrated={() => void loadSummary(workspacePath)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function summaryHeader(
  summary: DossieSummary | null,
  fallbackOccurrence: NonNullable<ReturnType<typeof selectActiveOccurrence>>,
): string {
  const o = summary?.occurrence ?? fallbackOccurrence;
  const parts: string[] = [];
  if (o.numero_bo) parts.push(`BO ${o.numero_bo}`);
  if (o.tipo_pericia) parts.push(o.tipo_pericia);
  if (o.municipio) parts.push(o.municipio);
  if (parts.length === 0) return `Ocorrência ${o.id.slice(0, 8)}`;
  return parts.join(" — ");
}
