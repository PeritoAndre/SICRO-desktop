/**
 * CroquiEditor — orquestra Toolbar + Canvas + InspectorPanel + StatusBar.
 *
 * MVP 6 (Croqui Pericial):
 *   - Toolbar agrupada por domínio (Seleção / Referencial / Via /
 *     Veículos / Pessoas / Vestígios / Anotação / Imagem / Export).
 *   - Mais ferramentas (subtipos de veículo, vestígios, pessoas,
 *     R1/R2 dedicados, setas, faixas, divisões tracejadas, calçada).
 *   - Templates de via inseríveis em um clique.
 *   - Layer panel com agrupamento por categoria + ações por objeto
 *     (visibilidade, lock, renomear, mover, excluir).
 *   - Atalhos: Esc, V, H, Delete, Ctrl+Z, Ctrl+Y/Ctrl+Shift+Z,
 *     Ctrl+D, Ctrl+S.
 *   - Exportação PNG com carimbo técnico (título + escala + timestamp).
 *
 * O `.sicrocroqui` continua sendo a fonte da verdade do croqui; PNG é
 * exportação. Compatibilidade total com docs do Spike E (v0.1) —
 * `coerceCroquiDoc` aplica defaults para campos novos.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import {
  selectActiveOccurrence,
  selectActiveWorkspacePath,
  useWorkspaceStore,
} from "@stores/workspaceStore";
import { toSicroError } from "@core/errors";
import { commands } from "@core/commands";
import type { MediaAsset } from "@domain/import";
import { useCroquiStore } from "../store/croquiStore";
import {
  cloneObject,
  computePxPerMeter,
  distancePx,
  findTemplate,
  formatMeasurement,
  inferCategory,
  makeLine,
  makeMarker,
  makeMeasurement,
  makeText,
  makeVehicle,
  type LineSubtype,
  type MarkerSubtype,
  type SicroCroquiDoc,
  type SicroObject,
  type SicroPoint,
  type TemplateId,
  type VehicleBodyType,
} from "../engine";
import { Toolbar } from "./Toolbar";
import { InspectorPanel } from "./InspectorPanel";
import { CanvasStage, type CanvasStageHandle } from "./CanvasStage";
import { useEditorState, type Tool } from "./useEditorState";
import styles from "./CroquiEditor.module.css";

export function CroquiEditor() {
  const workspacePath = useWorkspaceStore(selectActiveWorkspacePath);
  const occurrence = useWorkspaceStore(selectActiveOccurrence);
  const activeCroqui = useCroquiStore((s) => s.activeCroqui);
  const activeDoc = useCroquiStore((s) => s.activeDoc);
  const saveCurrent = useCroquiStore((s) => s.saveCurrent);
  const exportPng = useCroquiStore((s) => s.exportPng);
  const clearCurrent = useCroquiStore((s) => s.clearCurrent);

  const [doc, setDoc] = useState<SicroCroquiDoc | null>(activeDoc);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const editor = useEditorState();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<CanvasStageHandle | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Sync the local doc with the store when the active croqui changes.
  useEffect(() => {
    if (activeDoc) setDoc(activeDoc);
  }, [activeDoc]);

  // Resize observer for the central canvas column.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setCanvasSize({
        width: Math.max(200, rect.width),
        height: Math.max(200, rect.height),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ----- Mutation helpers (with undo/redo bookkeeping) -----

  const mutateObjects = useCallback(
    (mutator: (objs: SicroObject[]) => SicroObject[]) => {
      setDoc((prev) => {
        if (!prev) return prev;
        editor.pushHistory(prev.objects);
        return { ...prev, objects: mutator(prev.objects) };
      });
    },
    [editor],
  );

  const addObject = (obj: SicroObject) => {
    mutateObjects((objs) => [...objs, obj]);
    editor.setSelectedId(obj.id);
  };

  const addManyObjects = (objs: SicroObject[]) => {
    if (objs.length === 0) return;
    mutateObjects((cur) => [...cur, ...objs]);
    editor.setSelectedId(objs[objs.length - 1]!.id);
  };

  const handleObjectChange = (id: string, patch: Partial<SicroObject>) => {
    mutateObjects((objs) =>
      objs.map((o) => (o.id === id ? ({ ...o, ...patch } as SicroObject) : o)),
    );
  };

  const handleDelete = useCallback(() => {
    const id = editor.selectedId;
    if (!id) return;
    mutateObjects((objs) => objs.filter((o) => o.id !== id));
    editor.setSelectedId(null);
  }, [editor, mutateObjects]);

  const handleDuplicate = useCallback(() => {
    const id = editor.selectedId;
    if (!id || !doc) return;
    const src = doc.objects.find((o) => o.id === id);
    if (!src) return;
    const dup = cloneObject(src);
    mutateObjects((cur) => [...cur, dup]);
    editor.setSelectedId(dup.id);
  }, [doc, editor, mutateObjects]);

  const handleUndo = useCallback(() => {
    const prev = editor.popHistory();
    setDoc((d) => {
      if (!d) return d;
      // Push current onto redo before swapping in the undone snapshot.
      editor.pushRedo(d.objects);
      return prev ? { ...d, objects: prev } : d;
    });
  }, [editor]);

  const handleRedo = useCallback(() => {
    const next = editor.popRedo();
    setDoc((d) => {
      if (!d || !next) return d;
      editor.pushHistory(d.objects);
      return { ...d, objects: next };
    });
  }, [editor]);

  const handleMoveObject = (id: string, direction: "up" | "down") => {
    mutateObjects((objs) => {
      const idx = objs.findIndex((o) => o.id === id);
      if (idx < 0) return objs;
      const swapWith = direction === "up" ? idx + 1 : idx - 1;
      if (swapWith < 0 || swapWith >= objs.length) return objs;
      const next = [...objs];
      [next[idx], next[swapWith]] = [next[swapWith]!, next[idx]!];
      return next;
    });
  };

  const handleSelectTool = (t: Tool) => {
    editor.setTool(t);
    editor.setPending(null);
  };

  // ----- Background image helpers -----

  const setBackgroundFromPath = (sourcePath: string) => {
    setDoc((prev) =>
      prev
        ? {
            ...prev,
            background_image: {
              source_path: sourcePath,
              x: 0,
              y: 0,
              width: 0,
              height: 0,
              opacity: 0.6,
              locked: true,
            },
          }
        : prev,
    );
    setFeedback("Imagem de fundo carregada.");
  };

  const handleImportBackground = async () => {
    try {
      const selected = await openFileDialog({
        multiple: false,
        title: "Imagem de fundo do croqui",
        filters: [
          { name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp"] },
        ],
      });
      if (typeof selected !== "string") return;
      setBackgroundFromPath(selected);
    } catch (e) {
      setFeedback(`Falha ao importar imagem: ${toSicroError(e).message}`);
    }
  };

  const handleToggleBackgroundLock = () => {
    setDoc((prev) =>
      prev && prev.background_image
        ? {
            ...prev,
            background_image: {
              ...prev.background_image,
              locked: !prev.background_image.locked,
            },
          }
        : prev,
    );
  };
  const handleChangeBackgroundOpacity = (v: number) => {
    setDoc((prev) =>
      prev && prev.background_image
        ? {
            ...prev,
            background_image: { ...prev.background_image, opacity: v },
          }
        : prev,
    );
  };

  // ----- Canvas click dispatcher (after `doc` and helpers are defined) -----

  const handleCanvasClick = (p: SicroPoint) => {
    if (!doc) return;
    const tool = editor.tool;
    const vehicleType = toolToVehicleBody(tool);
    if (vehicleType) {
      const nextLabel = nextVehicleLabel(doc.objects);
      addObject(makeVehicle(p, nextLabel, vehicleType));
      editor.setTool("select");
      return;
    }
    const markerSubtype = toolToMarkerSubtype(tool);
    if (markerSubtype) {
      addObject(makeMarker(p, markerSubtype));
      editor.setTool("select");
      return;
    }
    if (tool === "text") {
      const text = window.prompt("Texto:", "Anotação");
      if (text == null || text.trim() === "") return;
      addObject(makeText(p, text.trim()));
      editor.setTool("select");
      return;
    }
    const lineSubtype = toolToLineSubtype(tool);
    if (lineSubtype) {
      if (!editor.pending) {
        editor.setPending({ tool, first: p });
        return;
      }
      const p1 = editor.pending.first;
      const p2 = p;
      editor.setPending(null);
      addObject(makeLine(p1, p2, lineSubtype));
      editor.setTool("select");
      return;
    }
    if (tool === "measurement") {
      if (!editor.pending) {
        editor.setPending({ tool, first: p });
        return;
      }
      const p1 = editor.pending.first;
      const p2 = p;
      editor.setPending(null);
      addObject(makeMeasurement(p1, p2));
      editor.setTool("select");
      const label = formatMeasurement(distancePx(p1, p2), doc.scale?.px_per_m);
      setFeedback(
        doc.scale
          ? `Medida: ${label}`
          : `Medida: ${label} · aviso: escala ainda não foi definida.`,
      );
      return;
    }
    if (tool === "set_scale") {
      if (!editor.pending) {
        editor.setPending({ tool, first: p });
        return;
      }
      const p1 = editor.pending.first;
      const p2 = p;
      editor.setPending(null);
      const px = distancePx(p1, p2);
      const declared = window.prompt(
        `Distância real entre os dois pontos (em metros)?\n\nPixels medidos: ${px.toFixed(1)}`,
        "10",
      );
      if (!declared) return;
      const real = Number(declared.replace(",", "."));
      if (!Number.isFinite(real) || real <= 0) {
        setFeedback("Valor inválido — escala não atualizada.");
        return;
      }
      try {
        const pxPerM = computePxPerMeter(p1, p2, real);
        setDoc((prev) =>
          prev
            ? {
                ...prev,
                scale: {
                  px_per_m: pxPerM,
                  definition: { p1, p2, real_distance_m: real },
                },
              }
            : prev,
        );
        setFeedback(`Escala definida: ${pxPerM.toFixed(2)} px/m (1 m = ${(pxPerM).toFixed(2)} px).`);
        editor.setTool("select");
      } catch (e) {
        setFeedback(`Falha ao calibrar: ${(e as Error).message}`);
      }
    }
  };

  // ----- Keyboard shortcuts -----

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Escape") {
        editor.setPending(null);
        editor.setSelectedId(null);
        editor.setTool("select");
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && editor.selectedId) {
        e.preventDefault();
        handleDelete();
        return;
      }
      if (e.key === "v" && !e.ctrlKey && !e.metaKey) {
        editor.setTool("select");
        return;
      }
      if (e.key === "h" && !e.ctrlKey && !e.metaKey) {
        editor.setTool("pan");
        return;
      }
      const cmd = e.ctrlKey || e.metaKey;
      if (!cmd) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((key === "y") || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      } else if (key === "d") {
        e.preventDefault();
        handleDuplicate();
      } else if (key === "s") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.selectedId, doc]);

  if (!workspacePath || !activeCroqui || !doc) {
    return <div className={styles.empty}>Sem croqui aberto.</div>;
  }

  const handleInsertTemplate = (id: TemplateId) => {
    const tpl = findTemplate(id);
    if (!tpl) return;
    const center: SicroPoint = {
      x: doc.canvas.width_px / 2,
      y: doc.canvas.height_px / 2,
    };
    const objs = tpl.build(center);
    addManyObjects(objs);
    setFeedback(`${tpl.label} inserido (${objs.length} objeto(s)).`);
  };

  const handleSave = async () => {
    if (!workspacePath || !doc) return;
    setSaving(true);
    setFeedback(null);
    try {
      await saveCurrent(workspacePath, doc);
      setFeedback("Croqui salvo.");
      setTimeout(() => setFeedback(null), 2500);
    } catch (err) {
      setFeedback(`Falha ao salvar: ${toSicroError(err).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleExportPng = async () => {
    if (!workspacePath || !doc || !stageRef.current) return;
    setExporting(true);
    setFeedback(null);
    try {
      await saveCurrent(workspacePath, doc);
      const rawDataUrl = stageRef.current.toPng(2);
      if (!rawDataUrl) throw new Error("toDataURL retornou null");
      // MVP 6: aplicar carimbo técnico antes de subir os bytes ao Rust.
      const stamped = await stampPng(rawDataUrl, {
        title: activeCroqui.title,
        occurrence,
        scaleLabel: doc.scale
          ? `Escala 1 m = ${doc.scale.px_per_m.toFixed(2)} px`
          : "Escala não definida",
        timestamp: new Date(),
      });
      const path = await exportPng(workspacePath, stamped);
      setFeedback(`PNG salvo em ${path}`);
    } catch (err) {
      setFeedback(`Falha ao exportar: ${toSicroError(err).message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleToggleLayerVisibility = (layerId: string) => {
    setDoc((prev) =>
      prev
        ? {
            ...prev,
            layers: prev.layers.map((l) =>
              l.id === layerId ? { ...l, visible: !l.visible } : l,
            ),
          }
        : prev,
    );
  };

  const visibleObjects = useMemo(() => {
    const hiddenLayers = new Set(
      doc.layers.filter((l) => !l.visible).map((l) => l.id),
    );
    return doc.objects.filter(
      (o) => o.visible !== false && !hiddenLayers.has(o.layer_id),
    );
  }, [doc.layers, doc.objects]);

  const docForStage: SicroCroquiDoc = useMemo(
    () => ({ ...doc, objects: visibleObjects }),
    [doc, visibleObjects],
  );

  const totalsByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of doc.objects) {
      const cat = o.category ?? inferCategory(o);
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [doc.objects]);

  const handleBackToList = () => clearCurrent();
  const handleInsertInLaudo = () => {
    // Navegação para o Laudo via window hash router — o painel
    // de evidências do Laudo já enxerga o PNG mais recente.
    window.location.hash = "#/laudo";
  };

  return (
    <div className={styles.wrap}>
      <Toolbar
        activeTool={editor.tool}
        onSelectTool={handleSelectTool}
        canDelete={!!editor.selectedId}
        onDelete={handleDelete}
        canUndo={editor.history.length > 0}
        onUndo={handleUndo}
        canRedo={editor.redoStack.length > 0}
        onRedo={handleRedo}
        canDuplicate={!!editor.selectedId}
        onDuplicate={handleDuplicate}
        onImportBackground={() => void handleImportBackground()}
        onPickFromDossie={() => setShowPhotoPicker(true)}
        hasBackground={!!doc.background_image}
        bgLocked={doc.background_image?.locked ?? true}
        onToggleBackgroundLock={handleToggleBackgroundLock}
        bgOpacity={doc.background_image?.opacity ?? 0.6}
        onChangeBackgroundOpacity={handleChangeBackgroundOpacity}
        onInsertTemplate={handleInsertTemplate}
        onInsertInLaudo={handleInsertInLaudo}
        onSave={() => void handleSave()}
        onExportPng={() => void handleExportPng()}
        onBackToList={handleBackToList}
        saving={saving}
        exporting={exporting}
      />
      <div className={styles.canvasArea} ref={canvasRef}>
        <CanvasStage
          ref={stageRef}
          doc={docForStage}
          editor={editor}
          containerWidth={canvasSize.width}
          containerHeight={canvasSize.height}
          onCanvasClick={handleCanvasClick}
          onObjectChange={handleObjectChange}
          onSelect={(id) => editor.setSelectedId(id)}
          workspacePath={workspacePath}
        />
        <StatusBar
          tool={editor.tool}
          pointer={editor.pointerWorld}
          viewport={editor.viewport}
          scale={doc.scale}
          objectCount={doc.objects.length}
          totalsByCategory={totalsByCategory}
          saving={saving}
          feedback={feedback}
          croquiTitle={activeCroqui.title}
        />
      </div>
      <InspectorPanel
        layers={doc.layers}
        objects={doc.objects}
        selectedId={editor.selectedId}
        scale={doc.scale}
        onSelectObject={(id) => editor.setSelectedId(id)}
        onToggleLayerVisibility={handleToggleLayerVisibility}
        onUpdateObject={handleObjectChange}
        onDeleteObject={(id) => {
          editor.setSelectedId(id);
          handleDelete();
        }}
        onMoveObject={handleMoveObject}
      />

      {showPhotoPicker && (
        <DossiePhotoPicker
          workspacePath={workspacePath}
          onPick={(rel) => {
            setBackgroundFromPath(rel);
            setShowPhotoPicker(false);
          }}
          onClose={() => setShowPhotoPicker(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool dispatching helpers

function toolToVehicleBody(tool: Tool): VehicleBodyType | null {
  switch (tool) {
    case "vehicle":
    case "vehicle_car":
      return "car";
    case "vehicle_sedan":
      return "sedan";
    case "vehicle_suv":
      return "suv";
    case "vehicle_hatch":
      return "hatch";
    case "vehicle_truck":
      return "truck";
    case "vehicle_moto":
      return "moto";
    case "vehicle_bike":
      return "bike";
    default:
      return null;
  }
}

function toolToMarkerSubtype(tool: Tool): MarkerSubtype | null {
  switch (tool) {
    case "marker_x":
      return "collision_x";
    case "marker_brake":
      return "brake_mark";
    case "marker_drag":
      return "drag_mark";
    case "marker_fluid":
      return "fluid";
    case "marker_blood":
      return "blood";
    case "marker_debris":
      return "debris";
    case "marker_pedestrian":
      return "pedestrian";
    case "marker_body":
      return "body";
    default:
      return null;
  }
}

function toolToLineSubtype(tool: Tool): LineSubtype | null {
  switch (tool) {
    case "line_road":
      return "road";
    case "line_r1":
      return "r1";
    case "line_r2":
      return "r2";
    case "line_lane":
      return "lane";
    case "line_lane_separator":
      return "lane_separator";
    case "line_sidewalk":
      return "sidewalk";
    case "line_arrow":
      return "arrow";
    default:
      return null;
  }
}

/** Find the next "V1", "V2", … label that isn't taken yet. */
function nextVehicleLabel(objs: SicroObject[]): string {
  const taken = new Set<number>();
  for (const o of objs) {
    if (o.kind !== "vehicle" || !o.label) continue;
    const m = /^V(\d+)$/.exec(o.label);
    if (m) taken.add(Number(m[1]));
  }
  for (let i = 1; i < 100; i++) {
    if (!taken.has(i)) return `V${i}`;
  }
  return "V";
}

// ---------------------------------------------------------------------------
// Status bar (bottom)

function StatusBar({
  tool,
  pointer,
  viewport,
  scale,
  objectCount,
  totalsByCategory,
  saving,
  feedback,
  croquiTitle,
}: {
  tool: Tool;
  pointer: SicroPoint;
  viewport: { scale: number; x: number; y: number };
  scale: SicroCroquiDoc["scale"];
  objectCount: number;
  totalsByCategory: Record<string, number>;
  saving: boolean;
  feedback: string | null;
  croquiTitle: string;
}) {
  return (
    <div className={styles.statusBar}>
      <span className={styles.statusTitle}>{croquiTitle}</span>
      <span>
        Ferramenta: <code>{tool}</code>
      </span>
      <span>
        x={pointer.x.toFixed(0)} · y={pointer.y.toFixed(0)}
      </span>
      <span>zoom {(viewport.scale * 100).toFixed(0)}%</span>
      <span>
        {scale ? `escala ${scale.px_per_m.toFixed(2)} px/m` : "escala indefinida"}
      </span>
      <span>
        {objectCount} obj
        {Object.entries(totalsByCategory).length > 0 && (
          <span className={styles.statusCounts}>
            {" "}
            ({Object.entries(totalsByCategory)
              .map(([cat, n]) => `${cat}:${n}`)
              .join(" · ")})
          </span>
        )}
      </span>
      <span className={styles.statusFeedback}>
        {saving ? "salvando…" : feedback}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Picker para usar foto do Dossiê como fundo

function DossiePhotoPicker({
  workspacePath,
  onPick,
  onClose,
}: {
  workspacePath: string;
  onPick: (relativePath: string) => void;
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState<MediaAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    commands
      .listDossiePhotos(workspacePath)
      .then((data) => {
        if (!cancelled) setPhotos(data);
      })
      .catch((err) => {
        if (!cancelled) setError(toSicroError(err).message);
      });
    return () => {
      cancelled = true;
    };
  }, [workspacePath]);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Selecionar foto do Dossiê como fundo"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.dialog}>
        <header className={styles.dialogHeader}>
          <strong>Foto do Dossiê como fundo</strong>
          <button type="button" onClick={onClose} className={styles.dialogClose}>
            Fechar
          </button>
        </header>
        {photos === null && !error && (
          <p className={styles.dim}>Carregando fotos…</p>
        )}
        {error && <p className={styles.danger}>{error}</p>}
        {photos && photos.length === 0 && (
          <p className={styles.dim}>Nenhuma foto importada no Dossiê.</p>
        )}
        {photos && photos.length > 0 && (
          <ul className={styles.dialogList}>
            {photos.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={styles.dialogItem}
                  onClick={() => onPick(p.relative_path)}
                >
                  <span>{p.original_id ?? p.id.slice(0, 8)}</span>
                  <code>{p.relative_path}</code>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PNG stamping (MVP 6 — exportação técnica)

/**
 * Take the raw PNG data URL produced by Konva and prepend a thin
 * technical header (title · escala · timestamp · BO opcional). Runs
 * entirely off-screen via a 2D canvas; no Konva involved here. Returns
 * a new data URL.
 */
async function stampPng(
  rawDataUrl: string,
  meta: {
    title: string;
    occurrence:
      | { numero_bo?: string | null; tipo_pericia?: string | null; municipio?: string | null }
      | null;
    scaleLabel: string;
    timestamp: Date;
  },
): Promise<string> {
  const img = await loadImage(rawDataUrl);
  const headerH = 64;
  const footerH = 28;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height + headerH + footerH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return rawDataUrl;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header band
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvas.width, headerH);
  ctx.fillStyle = "#f8fafc";
  ctx.textBaseline = "middle";
  ctx.font = "bold 18px Inter, system-ui, sans-serif";
  ctx.fillText(meta.title, 18, headerH / 2 - 8);
  ctx.font = "12px Inter, system-ui, sans-serif";
  const subtitleParts: string[] = [];
  const occ = meta.occurrence;
  if (occ?.numero_bo) subtitleParts.push(`BO ${occ.numero_bo}`);
  if (occ?.tipo_pericia) subtitleParts.push(occ.tipo_pericia);
  if (occ?.municipio) subtitleParts.push(occ.municipio);
  if (subtitleParts.length > 0) {
    ctx.fillText(subtitleParts.join(" · "), 18, headerH / 2 + 12);
  }
  ctx.textAlign = "right";
  ctx.fillText(meta.scaleLabel, canvas.width - 18, headerH / 2 - 8);
  ctx.fillText(
    `Exportado em ${formatStampDate(meta.timestamp)}`,
    canvas.width - 18,
    headerH / 2 + 12,
  );
  ctx.textAlign = "left";

  // Sketch body
  ctx.drawImage(img, 0, headerH);

  // Footer band
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(0, headerH + img.height, canvas.width, footerH);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(
    "SICRO Desktop — Croqui Pericial · documento técnico, sujeito a revisão pelo perito.",
    18,
    headerH + img.height + footerH / 2,
  );

  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function formatStampDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
