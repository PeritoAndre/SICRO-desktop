/**
 * DossieModule — minimal "imported occurrence" view (Spike D).
 *
 * Scope: show what got into the workspace, NOT a full forensic dossier UI.
 *
 * Sections:
 *   - Header card: BO, type, location pulled from `Occurrence`.
 *   - Imports list: every `imports` row in the workspace (for audit).
 *   - Photo gallery: thumbnails of `media_assets` of type 'photo',
 *     served via Tauri's `convertFileSrc` so the WebView can render them
 *     without copying into base64.
 *
 * Anything beyond this (croqui, vídeo, dossier editing) is out of scope.
 */

import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { FileArchive, ImageOff, MapPin } from "lucide-react";
import { commands } from "@core/commands";
import { toSicroError } from "@core/errors";
import { formatDateTime } from "@core/formatters";
import {
  selectActiveOccurrence,
  selectActiveWorkspacePath,
  useWorkspaceStore,
} from "@stores/workspaceStore";
import type { Import, MediaAsset } from "@domain/import";
import styles from "./DossieModule.module.css";

export function DossieModule() {
  const occurrence = useWorkspaceStore(selectActiveOccurrence);
  const workspacePath = useWorkspaceStore(selectActiveWorkspacePath);

  const [imports, setImports] = useState<Import[]>([]);
  const [photos, setPhotos] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspacePath) {
      setImports([]);
      setPhotos([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      commands.listWorkspaceImports(workspacePath),
      commands.listWorkspacePhotos(workspacePath),
    ])
      .then(([imps, phs]) => {
        if (cancelled) return;
        setImports(imps);
        setPhotos(phs);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(toSicroError(err).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspacePath]);

  if (!workspacePath || !occurrence) {
    return (
      <div className={styles.empty}>
        <p>Abra uma ocorrência para ver o dossiê.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.container}>
        <header className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Dossiê — visualização básica</h1>
            <p className={styles.subtitle}>
              Spike D — dados importados de pacote <code>.sicroapp</code>. UI
              completa do dossiê chega em MVP 3.
            </p>
          </div>
        </header>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Identificação da ocorrência</h2>
          <dl className={styles.metaGrid}>
            <Row label="BO" value={occurrence.numero_bo} />
            <Row label="Protocolo" value={occurrence.protocolo} />
            <Row label="Tipo de perícia" value={occurrence.tipo_pericia} />
            <Row label="Natureza" value={occurrence.natureza} />
            <Row label="Resultado" value={occurrence.resultado ?? null} />
            <Row label="Município" value={occurrence.municipio} />
            <Row label="Bairro" value={occurrence.bairro} />
            <Row label="Logradouro" value={occurrence.logradouro} />
            <Row label="Referência" value={occurrence.referencia} />
            <Row
              label="Coordenada"
              value={
                occurrence.latitude != null && occurrence.longitude != null
                  ? `${occurrence.latitude.toFixed(6)}, ${occurrence.longitude.toFixed(6)}${
                      occurrence.primary_accuracy_m != null
                        ? ` (±${occurrence.primary_accuracy_m} m)`
                        : ""
                    }`
                  : null
              }
              icon={<MapPin size={12} />}
            />
            <Row
              label="ID mobile original"
              value={occurrence.original_mobile_id ?? null}
              mono
            />
          </dl>
        </section>

        {error && <p className={styles.error}>{error}</p>}

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>
            Imports neste workspace ({imports.length})
          </h2>
          {loading && imports.length === 0 ? (
            <p className={styles.dim}>Carregando…</p>
          ) : imports.length === 0 ? (
            <p className={styles.dim}>
              Nenhum import registrado neste workspace.
            </p>
          ) : (
            <ul className={styles.importList}>
              {imports.map((imp) => (
                <li key={imp.id} className={styles.importItem}>
                  <FileArchive size={16} />
                  <div>
                    <div className={styles.importHeader}>
                      <strong>{imp.original_filename ?? "(pacote)"}</strong>
                      <span className={styles.importBadge}>
                        {imp.format} {imp.schema_version}
                      </span>
                      <span className={styles.importStatus}>{imp.status}</span>
                    </div>
                    <div className={styles.importMeta}>
                      <span>
                        Importado em {formatDateTime(imp.imported_at)}
                      </span>
                      <span>
                        SHA-256:{" "}
                        <code>{imp.package_sha256.slice(0, 24)}…</code>
                      </span>
                      {imp.mobile_occurrence_id && (
                        <span>
                          ID mobile: <code>{imp.mobile_occurrence_id}</code>
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>
            Fotos importadas ({photos.length})
          </h2>
          {loading && photos.length === 0 ? (
            <p className={styles.dim}>Carregando…</p>
          ) : photos.length === 0 ? (
            <p className={styles.dim}>
              Nenhuma foto importada neste workspace.
            </p>
          ) : (
            <PhotoGallery photos={photos} workspacePath={workspacePath} />
          )}
        </section>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  icon,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={mono ? styles.mono : undefined}>
        {icon && <span className={styles.rowIcon}>{icon}</span>}
        {value ?? "—"}
      </dd>
    </>
  );
}

function PhotoGallery({
  photos,
  workspacePath,
}: {
  photos: MediaAsset[];
  workspacePath: string;
}) {
  return (
    <div className={styles.gallery}>
      {photos.map((p) => (
        <PhotoCard key={p.id} photo={p} workspacePath={workspacePath} />
      ))}
    </div>
  );
}

function PhotoCard({
  photo,
  workspacePath,
}: {
  photo: MediaAsset;
  workspacePath: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Tauri's `convertFileSrc` rewrites the absolute filesystem path so the
    // WebView can fetch it through Tauri's secure protocol — no base64
    // copying through invoke is needed.
    const sep = workspacePath.includes("\\") ? "\\" : "/";
    const abs = `${workspacePath}${sep}${photo.relative_path.replace(/\//g, sep)}`;
    try {
      setSrc(convertFileSrc(abs));
    } catch {
      setFailed(true);
    }
  }, [workspacePath, photo.relative_path]);

  return (
    <figure className={styles.photoCard}>
      {failed || !src ? (
        <div className={styles.photoFailed}>
          <ImageOff size={24} />
          <span>Sem visualização</span>
        </div>
      ) : (
        <img
          src={src}
          alt={photo.caption ?? photo.original_filename ?? photo.id}
          onError={() => setFailed(true)}
          className={styles.photoImg}
          loading="lazy"
        />
      )}
      <figcaption className={styles.photoCaption}>
        <strong className={styles.photoTitle}>
          {photo.original_id ?? photo.id.slice(0, 8)}
        </strong>
        {photo.category && (
          <span className={styles.photoCategory}>{photo.category}</span>
        )}
        {photo.caption && (
          <span className={styles.photoText}>{photo.caption}</span>
        )}
      </figcaption>
    </figure>
  );
}
