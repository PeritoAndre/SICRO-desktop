/**
 * VideoListView — landing of the Video module: lista de vídeos registrados
 * + botão "Adicionar vídeo" (abre file dialog → registerMedia).
 */

import { useEffect, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { Film, Plus } from "lucide-react";
import { Button } from "@components/Button/Button";
import { EmptyState } from "@components/EmptyState/EmptyState";
import { formatDateTime } from "@core/formatters";
import { toSicroError } from "@core/errors";
import {
  selectActiveWorkspacePath,
  useWorkspaceStore,
} from "@stores/workspaceStore";
import { useVideoStore } from "./store/videoStore";
import { formatDuration, prettyBytes } from "./editor/format";
import styles from "./VideoListView.module.css";

export function VideoListView() {
  const workspacePath = useWorkspaceStore(selectActiveWorkspacePath);
  const list = useVideoStore((s) => s.list);
  const isLoadingList = useVideoStore((s) => s.isLoadingList);
  const loadList = useVideoStore((s) => s.loadList);
  const registerMedia = useVideoStore((s) => s.registerMedia);
  const openMedia = useVideoStore((s) => s.openMedia);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workspacePath) void loadList(workspacePath);
  }, [workspacePath, loadList]);

  const handleAdd = async () => {
    if (!workspacePath) return;
    setError(null);
    try {
      const selected = await openFileDialog({
        multiple: false,
        title: "Selecione um vídeo",
        filters: [
          { name: "Vídeos", extensions: ["mp4", "mov", "mkv", "avi", "webm", "m4v"] },
        ],
      });
      if (typeof selected !== "string") return;
      setBusy(true);
      const media = await registerMedia(workspacePath, selected);
      await openMedia(workspacePath, media.id);
    } catch (err) {
      setError(toSicroError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = async (mediaId: string) => {
    if (!workspacePath) return;
    setBusy(true);
    setError(null);
    try {
      await openMedia(workspacePath, mediaId);
    } catch (err) {
      setError(toSicroError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Vídeo</h1>
            <p className={styles.subtitle}>
              Spike F — Video Engine. Cada vídeo vira <code>video_media</code> com
              SHA-256, metadados via <code>ffprobe</code>, eventos temporais,
              coleta técnica de frame por <code>ffmpeg</code> e storyboard
              pericial.
            </p>
          </div>
          <Button
            variant="primary"
            leftIcon={<Plus size={14} />}
            onClick={() => void handleAdd()}
            disabled={busy}
          >
            {busy ? "Adicionando…" : "Adicionar vídeo"}
          </Button>
        </header>

        {error && <p className={styles.error}>{error}</p>}

        <section>
          <h2 className={styles.sectionTitle}>
            Vídeos desta ocorrência ({list.length})
          </h2>
          {isLoadingList && list.length === 0 ? (
            <p className={styles.dim}>Carregando…</p>
          ) : list.length === 0 ? (
            <EmptyState
              icon={<Film size={32} strokeWidth={1.5} />}
              title="Nenhum vídeo importado ainda"
              description="Clique em 'Adicionar vídeo' para registrar a primeira mídia. O arquivo é copiado para videos/originais/, hasheado e analisado pelo ffprobe."
            />
          ) : (
            <ul className={styles.list}>
              {list.map((m) => (
                <li key={m.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <strong className={styles.rowTitle}>{m.filename}</strong>
                    <div className={styles.rowMeta}>
                      <span title={m.codec ?? ""}>
                        {m.codec ?? "codec desconhecido"}
                      </span>
                      <span>
                        {m.width && m.height
                          ? `${m.width}×${m.height}`
                          : "resolução —"}
                      </span>
                      <span>
                        {m.fps_declared
                          ? `${m.fps_declared.toFixed(2)} fps`
                          : "fps —"}
                      </span>
                      <span>
                        {m.duration_s != null
                          ? formatDuration(m.duration_s)
                          : "duração —"}
                      </span>
                      <span>{prettyBytes(m.size_bytes)}</span>
                      <span title={m.sha256}>
                        SHA <code>{m.sha256.slice(0, 10)}…</code>
                      </span>
                      <span>registrado {formatDateTime(m.created_at)}</span>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => void handleOpen(m.id)}
                    disabled={busy}
                  >
                    Abrir
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
