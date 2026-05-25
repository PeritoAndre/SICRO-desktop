/**
 * AlphaDashboard — bloco da Home exibido quando há um workspace ativo
 * (MVP 8 — Consolidação Alpha).
 *
 * Mostra:
 *   - resumo da ocorrência aberta (BO, tipo, município);
 *   - contadores por módulo (carregados via getSystemHealthSnapshot);
 *   - status de integridade resumido;
 *   - atalhos para todos os módulos;
 *   - ações rápidas: Backup, Relatório de saúde, Verificar integridade.
 *
 * Mantém o foco em "porta de entrada operacional" sem reimplementar
 * funcionalidades — todas as chamadas vão para commands existentes.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Boxes,
  Camera,
  Database,
  FileImage,
  FileText,
  Film,
  FolderArchive,
  FolderOpen,
  Layers,
  Map as MapIcon,
  RefreshCw,
  Shield,
} from "lucide-react";
import { Button } from "@components/Button/Button";
import { commands } from "@core/commands";
import { toSicroError } from "@core/errors";
import {
  selectActiveOccurrence,
  selectActiveWorkspacePath,
  useWorkspaceStore,
} from "@stores/workspaceStore";
import type {
  BackupArtifact,
  HealthReportArtifact,
  SystemHealthSnapshot,
} from "@domain/alpha";
import styles from "./AlphaDashboard.module.css";

export function AlphaDashboard() {
  const navigate = useNavigate();
  const workspacePath = useWorkspaceStore(selectActiveWorkspacePath);
  const occurrence = useWorkspaceStore(selectActiveOccurrence);

  const [snapshot, setSnapshot] = useState<SystemHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"none" | "backup" | "health">("none");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!workspacePath) {
      setSnapshot(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const snap = await commands.getSystemHealthSnapshot(workspacePath);
      setSnapshot(snap);
    } catch (err) {
      setError(toSicroError(err).message);
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleBackup = async () => {
    if (!workspacePath) return;
    setBusy("backup");
    setFeedback(null);
    try {
      const bo = occurrence?.numero_bo?.trim() || undefined;
      const a: BackupArtifact = await commands.generateWorkspaceBackup(
        workspacePath,
        undefined,
        bo,
      );
      setFeedback(
        `Backup gerado: ${a.filename} (${a.file_count} arquivo(s), ${prettyBytes(a.size_bytes)})`,
      );
      void reload();
    } catch (err) {
      setError(toSicroError(err).message);
    } finally {
      setBusy("none");
    }
  };

  const handleHealth = async () => {
    if (!workspacePath) return;
    setBusy("health");
    setFeedback(null);
    try {
      const a: HealthReportArtifact = await commands.generateSystemHealthReport(
        workspacePath,
      );
      setFeedback(`Relatório de saúde salvo em ${a.relative_path}`);
    } catch (err) {
      setError(toSicroError(err).message);
    } finally {
      setBusy("none");
    }
  };

  const handleOpenIntegrity = () => navigate("/evidencias");

  const occLabel = useMemo(() => {
    if (!occurrence) return "—";
    const parts: string[] = [];
    if (occurrence.numero_bo) parts.push(`BO ${occurrence.numero_bo}`);
    if (occurrence.tipo_pericia) parts.push(occurrence.tipo_pericia);
    if (occurrence.municipio) parts.push(occurrence.municipio);
    return parts.length > 0
      ? parts.join(" — ")
      : `Ocorrência ${occurrence.id.slice(0, 8)}`;
  }, [occurrence]);

  if (!workspacePath || !occurrence) {
    return null; // Nothing to show when no workspace is active.
  }

  const ws = snapshot?.workspace ?? null;
  const overall = ws?.integrity_overall_status ?? "ok";
  const overallPill =
    overall === "ok"
      ? styles.pillOk
      : overall === "warning"
        ? styles.pillWarn
        : overall === "critical"
          ? styles.pillCrit
          : styles.pillInfo;

  return (
    <section className={styles.section} aria-label="Painel Alpha">
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Workspace ativo</h2>
          <p className={styles.subtitle}>{occLabel}</p>
          <p className={styles.path}>
            <code>{workspacePath}</code>
          </p>
        </div>
        <div className={styles.actions}>
          <Button
            variant="secondary"
            leftIcon={<RefreshCw size={14} />}
            onClick={() => void reload()}
            disabled={loading}
          >
            {loading ? "Verificando…" : "Atualizar"}
          </Button>
          <Button
            variant="secondary"
            leftIcon={<Shield size={14} />}
            onClick={handleOpenIntegrity}
          >
            Verificar integridade
          </Button>
          <Button
            variant="secondary"
            leftIcon={<FileText size={14} />}
            onClick={() => void handleHealth()}
            disabled={busy !== "none"}
          >
            {busy === "health" ? "Gerando…" : "Relatório de saúde"}
          </Button>
          <Button
            variant="primary"
            leftIcon={<FolderArchive size={14} />}
            onClick={() => void handleBackup()}
            disabled={busy !== "none"}
          >
            {busy === "backup" ? "Compactando…" : "Gerar backup"}
          </Button>
        </div>
      </header>

      {error && (
        <div className={styles.errorBanner}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}
      {feedback && <p className={styles.feedback}>{feedback}</p>}

      {/* Counters */}
      {ws && (
        <div className={styles.counters}>
          <Counter n={ws.counters.photos} label="Fotos" />
          <Counter n={ws.counters.croquis} label="Croquis" />
          <Counter n={ws.counters.videos} label="Vídeos" />
          <Counter n={ws.counters.storyboard_frames} label="Frames" />
          <Counter n={ws.counters.image_analyses} label="Análises de imagem" />
          <Counter n={ws.counters.image_exports} label="Derivados" />
          <Counter n={ws.counters.laudos} label="Laudos" />
          <Counter n={ws.counters.laudo_exports} label="Exports laudo" />
          <Counter n={ws.counters.evidence_links} label="evidence_links" />
          <Counter
            n={ws.files_ok}
            label="Arquivos OK"
            tone={ws.files_ok > 0 ? "ok" : "muted"}
          />
          <Counter
            n={ws.files_missing}
            label="Ausentes"
            tone={ws.files_missing > 0 ? "warn" : "muted"}
          />
          <Counter
            n={ws.broken_links}
            label="Links quebrados"
            tone={ws.broken_links > 0 ? "warn" : "muted"}
          />
          <Counter
            n={ws.unsafe_paths}
            label="Path inseguro"
            tone={ws.unsafe_paths > 0 ? "crit" : "muted"}
          />
          <Counter
            n={Math.round(ws.workspace_size_bytes / 1024 / 1024)}
            label="Tamanho (MB)"
          />
        </div>
      )}

      {/* Integrity pill + warnings */}
      <div className={styles.statusLine}>
        <span className={`${styles.pill} ${overallPill}`}>
          {overall === "ok"
            ? "íntegro"
            : overall === "warning"
              ? "atenção"
              : overall === "critical"
                ? "crítico"
                : "—"}
        </span>
        {snapshot?.dependencies.map((d) => (
          <span
            key={d.name}
            className={`${styles.pill} ${d.found ? styles.pillOk : styles.pillWarn}`}
            title={
              d.found
                ? d.version_hint ?? d.path ?? ""
                : `${d.name} não encontrado no PATH`
            }
          >
            {d.name}: {d.found ? "ok" : "ausente"}
          </span>
        ))}
        {snapshot?.warnings.map((w, i) => (
          <span key={i} className={styles.warning} title={w}>
            <AlertTriangle size={11} /> {w}
          </span>
        ))}
      </div>

      {/* Module shortcuts */}
      <div className={styles.shortcutsTitle}>Atalhos</div>
      <div className={styles.shortcuts}>
        <Shortcut to="/dossie" icon={<FolderOpen size={16} />} label="Dossiê" />
        <Shortcut to="/laudo" icon={<FileText size={16} />} label="Laudo" />
        <Shortcut to="/croqui" icon={<MapIcon size={16} />} label="Croqui" />
        <Shortcut to="/video" icon={<Film size={16} />} label="Vídeo" />
        <Shortcut to="/imagem" icon={<FileImage size={16} />} label="Imagem" />
        <Shortcut to="/evidencias" icon={<Boxes size={16} />} label="Evidências" />
      </div>

      {/* Silence tree-shake on unused icons reserved for future */}
      {(() => {
        void Camera;
        void Database;
        void Layers;
        return null;
      })()}
    </section>
  );
}

function Counter({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone?: "ok" | "warn" | "crit" | "muted";
}) {
  const cls =
    tone === "ok"
      ? styles.counterOk
      : tone === "warn"
        ? styles.counterWarn
        : tone === "crit"
          ? styles.counterCrit
          : "";
  return (
    <div className={`${styles.counter} ${cls}`}>
      <span className={styles.counterN}>{n}</span>
      <span className={styles.counterL}>{label}</span>
    </div>
  );
}

function Shortcut({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={styles.shortcut}
      onClick={() => navigate(to)}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
