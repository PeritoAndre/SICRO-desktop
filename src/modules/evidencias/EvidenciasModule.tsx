/**
 * EvidenciasModule — MVP 5 (Central de Evidências e Integridade).
 *
 * Layout: top bar with the occurrence label + tab strip + content panel.
 * Tabs:
 *   1. Resumo               — counters + status pill + actions
 *   2. Todas as evidências  — unified table with filter / busca
 *   3. Fotos                — gallery of imported photos
 *   4. Croquis              — list of .sicrocroqui + last PNG export
 *   5. Vídeos               — list of registered videos
 *   6. Frames               — storyboard frames extracted by FFmpeg
 *   7. Laudos & vínculos    — laudos + evidence_links + broken links
 *   8. Integridade          — full integrity report (deep on demand)
 *   9. Logs                 — consolidated event log
 *
 * The module is read-only: it does NOT mutate any other module's state.
 * Actions are limited to opening files, revealing them in the folder,
 * copying paths/refs and generating an HTML integrity report.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  Camera,
  Film,
  FileSearch,
  FileText,
  Layers,
  Link as LinkIcon,
  Map as MapIcon,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { commands } from "@core/commands";
import { toSicroError } from "@core/errors";
import {
  selectActiveOccurrence,
  selectActiveWorkspacePath,
  useWorkspaceStore,
} from "@stores/workspaceStore";
import type {
  EvidenceRegistryItem,
  RegistrySummary,
  WorkspaceIntegrityReport,
} from "@domain/evidence_registry";
import { SummaryTab } from "./tabs/SummaryTab";
import { AllItemsTab } from "./tabs/AllItemsTab";
import { PhotosTab } from "./tabs/PhotosTab";
import { CroquisTab } from "./tabs/CroquisTab";
import { VideosTab } from "./tabs/VideosTab";
import { FramesTab } from "./tabs/FramesTab";
import { LaudosLinksTab } from "./tabs/LaudosLinksTab";
import { IntegrityTab } from "./tabs/IntegrityTab";
import { LogsTab } from "./tabs/LogsTab";
import styles from "./EvidenciasModule.module.css";

type TabKey =
  | "summary"
  | "all"
  | "photos"
  | "croquis"
  | "videos"
  | "frames"
  | "laudos"
  | "integrity"
  | "logs";

interface TabDef {
  key: TabKey;
  label: string;
  icon: typeof Boxes;
  badge?: string | null;
  badgeKind?: "neutral" | "alert" | "critical";
}

export function EvidenciasModule() {
  const occurrence = useWorkspaceStore(selectActiveOccurrence);
  const workspacePath = useWorkspaceStore(selectActiveWorkspacePath);

  const [items, setItems] = useState<EvidenceRegistryItem[] | null>(null);
  const [summary, setSummary] = useState<RegistrySummary | null>(null);
  const [report, setReport] = useState<WorkspaceIntegrityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("summary");

  /** Reload registry + summary. The integrity tab manages its own
   *  deep-verification life cycle. */
  const reload = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        // Run verify (deep=false) once — it gives us BOTH the items
        // already enriched with integrity status AND the summary.
        const r = await commands.verifyWorkspaceIntegrity(path, { deep: false });
        setReport(r);
        setItems(r.items);
        setSummary(r.summary);
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
      setItems(null);
      setSummary(null);
      setReport(null);
      return;
    }
    void reload(workspacePath);
  }, [workspacePath, reload]);

  const tabs = useMemo<TabDef[]>(() => {
    const s = summary;
    const overall = s?.overall_status ?? "ok";
    const badgeKindFor = (count: number, critical = false) =>
      count > 0 ? (critical ? "critical" : "alert") : "neutral";

    return [
      {
        key: "summary",
        label: "Resumo",
        icon: ShieldCheck,
        badge:
          overall === "ok" ? "íntegro" : overall === "warning" ? "atenção" : overall === "critical" ? "crítico" : null,
        badgeKind:
          overall === "critical" ? "critical" : overall === "warning" ? "alert" : "neutral",
      },
      {
        key: "all",
        label: "Todas",
        icon: Boxes,
        badge: s ? String(s.total_items) : null,
      },
      {
        key: "photos",
        label: "Fotos",
        icon: Camera,
        badge: s ? String(s.photos) : null,
      },
      {
        key: "croquis",
        label: "Croquis",
        icon: MapIcon,
        badge: s ? String(s.croquis) : null,
      },
      {
        key: "videos",
        label: "Vídeos",
        icon: Film,
        badge: s ? String(s.videos) : null,
      },
      {
        key: "frames",
        label: "Frames",
        icon: Layers,
        badge: s ? String(s.storyboard_frames) : null,
      },
      {
        key: "laudos",
        label: "Laudos & vínculos",
        icon: LinkIcon,
        badge: s ? `${s.laudos}/${s.linked_in_laudos}` : null,
      },
      {
        key: "integrity",
        label: "Integridade",
        icon: FileSearch,
        badge: s
          ? s.files_missing + s.broken_links + s.unsafe_paths + s.hash_mismatches > 0
            ? String(s.files_missing + s.broken_links + s.unsafe_paths + s.hash_mismatches)
            : "ok"
          : null,
        badgeKind: s
          ? badgeKindFor(
              s.files_missing + s.broken_links,
              s.unsafe_paths + s.hash_mismatches > 0,
            )
          : "neutral",
      },
      {
        key: "logs",
        label: "Logs",
        icon: ScrollText,
        badge: null,
      },
    ];
  }, [summary]);

  if (!workspacePath || !occurrence) {
    return (
      <div className={styles.empty}>
        <Boxes size={36} strokeWidth={1.5} aria-hidden />
        <p>Abra uma ocorrência para ver a Central de Evidências.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.topBar}>
        <div className={styles.title}>
          <h1>Evidências — {occurrenceHeader(occurrence)}</h1>
          <p className={styles.subtitle}>
            Camada de confiança do workspace · {summary
              ? `${summary.total_items} item(ns)`
              : "carregando…"}
          </p>
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
              <span
                className={`${styles.badge} ${
                  t.badgeKind === "alert"
                    ? styles.badgeAlert
                    : t.badgeKind === "critical"
                      ? styles.badgeCritical
                      : ""
                }`}
              >
                {t.badge}
              </span>
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
          <p className={styles.loading}>Carregando registro…</p>
        ) : !summary || !items ? (
          <p className={styles.loading}>Sem dados.</p>
        ) : (
          <>
            {tab === "summary" && (
              <SummaryTab
                summary={summary}
                report={report}
                workspacePath={workspacePath}
                onReload={() => void reload(workspacePath)}
              />
            )}
            {tab === "all" && (
              <AllItemsTab
                items={items}
                workspacePath={workspacePath}
                onReload={() => void reload(workspacePath)}
              />
            )}
            {tab === "photos" && (
              <PhotosTab items={items} workspacePath={workspacePath} />
            )}
            {tab === "croquis" && (
              <CroquisTab items={items} workspacePath={workspacePath} />
            )}
            {tab === "videos" && (
              <VideosTab items={items} workspacePath={workspacePath} />
            )}
            {tab === "frames" && (
              <FramesTab items={items} workspacePath={workspacePath} />
            )}
            {tab === "laudos" && (
              <LaudosLinksTab
                items={items}
                workspacePath={workspacePath}
                brokenLinks={report?.broken_laudo_links ?? []}
              />
            )}
            {tab === "integrity" && (
              <IntegrityTab
                workspacePath={workspacePath}
                summary={summary}
                report={report}
                onReportRefresh={(r) => {
                  setReport(r);
                  setItems(r.items);
                  setSummary(r.summary);
                }}
              />
            )}
            {tab === "logs" && (
              <LogsTab
                workspacePath={workspacePath}
                videos={items.filter((i) => i.kind === "video")}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function occurrenceHeader(
  o: NonNullable<ReturnType<typeof selectActiveOccurrence>>,
): string {
  const parts: string[] = [];
  if (o.numero_bo) parts.push(`BO ${o.numero_bo}`);
  if (o.tipo_pericia) parts.push(o.tipo_pericia);
  if (o.municipio) parts.push(o.municipio);
  if (parts.length === 0) return `Ocorrência ${o.id.slice(0, 8)}`;
  return parts.join(" — ");
}

// Silence tree-shake warnings for icons we'll use later.
void BookOpen;
void FileText;
