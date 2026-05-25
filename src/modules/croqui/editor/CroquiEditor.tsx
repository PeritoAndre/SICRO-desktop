/**
 * CroquiEditor — orchestrates the editor.
 *
 * Layout:
 *   [ Toolbar (left) ] [ Canvas (centre) ] [ Inspector (right) ]
 *   [           Status bar (bottom)                            ]
 *
 * The editor receives the persisted `SicroCroquiDoc` from the store and
 * keeps a local mutable copy. On Save/Export we call back into the store.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import {
  selectActiveWorkspacePath,
  useWorkspaceStore,
} from "@stores/workspaceStore";
import { toSicroError } from "@core/errors";
import { useCroquiStore } from "../store/croquiStore";
import {
  computePxPerMeter,
  distancePx,
  formatMeasurement,
  makeLine,
  makeMarker,
  makeMeasurement,
  makeText,
  makeVehicle,
  type LineSubtype,
  type SicroCroquiDoc,
  type SicroObject,
  type SicroPoint,
} from "../engine";
import { Toolbar } from "./Toolbar";
import { InspectorPanel } from "./InspectorPanel";
import { CanvasStage, type CanvasStageHandle } from "./CanvasStage";
import { useEditorState, type Tool } from "./useEditorState";
import styles from "./CroquiEditor.module.css";

export function CroquiEditor() {
  const workspacePath = useWorkspaceStore(selectActiveWorkspacePath);
  const activeCroqui = useCroquiStore((s) => s.activeCroqui);
  const activeDoc = useCroquiStore((s) => s.activeDoc);
  const saveCurrent = useCroquiStore((s) => s.saveCurrent);
  const exportPng = useCroquiStore((s) => s.exportPng);
  const clearCurrent = useCroquiStore((s) => s.clearCurrent);

  const [doc, setDoc] = useState<SicroCroquiDoc | null>(activeDoc);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const editor = useEditorState();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<CanvasStageHandle | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Sync the local doc with the store when the active croqui changes.
  useEffect(() => {
    if (activeDoc) setDoc(activeDoc);
  }, [activeDoc]);

  // Resize observer so the Stage fills the centre column.
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

  // Keyboard shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept input typing.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "Escape") {
        editor.setPending(null);
        editor.setSelectedId(null);
        editor.setTool("select");
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && editor.selectedId) {
        e.preventDefault();
        handleDelete();
      }
      if (e.key === "v" && !e.ctrlKey) editor.setTool("select");
      if (e.key === "h" && !e.ctrlKey) editor.setTool("pan");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
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

  const handleCanvasClick = (p: SicroPoint) => {
    const tool = editor.tool;
    if (tool === "vehicle") {
      addObject(makeVehicle(p));
      editor.setTool("select");
      return;
    }
    if (tool === "marker_x") {
      addObject(makeMarker(p, "collision_x"));
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
    if (
      tool === "line_road" ||
      tool === "line_r1" ||
      tool === "line_r2" ||
      tool === "measurement" ||
      tool === "set_scale"
    ) {
      if (!editor.pending) {
        editor.setPending({ tool, first: p });
        return;
      }
      const p1 = editor.pending.first;
      const p2 = p;
      editor.setPending(null);
      if (tool === "line_road") {
        addObject(makeLine(p1, p2, "road"));
        editor.setTool("select");
      } else if (tool === "line_r1") {
        addObject(makeLine(p1, p2, "r1"));
        editor.setTool("select");
      } else if (tool === "line_r2") {
        addObject(makeLine(p1, p2, "r2"));
        editor.setTool("select");
      } else if (tool === "measurement") {
        addObject(makeMeasurement(p1, p2));
        editor.setTool("select");
        setFeedback(
          `Medição: ${formatMeasurement(distancePx(p1, p2), doc.scale?.px_per_m)}`,
        );
      } else if (tool === "set_scale") {
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
          setFeedback(`Escala definida: ${pxPerM.toFixed(2)} px/m.`);
          editor.setTool("select");
        } catch (e) {
          setFeedback(`Falha ao calibrar: ${(e as Error).message}`);
        }
      }
      return;
    }
  };

  const handleObjectChange = (id: string, patch: Partial<SicroObject>) => {
    mutateObjects((objs) =>
      objs.map((o) => (o.id === id ? ({ ...o, ...patch } as SicroObject) : o)),
    );
  };

  const handleDelete = () => {
    if (!editor.selectedId) return;
    const id = editor.selectedId;
    mutateObjects((objs) => objs.filter((o) => o.id !== id));
    editor.setSelectedId(null);
  };

  const handleUndo = () => {
    const prev = editor.popHistory();
    if (prev) {
      setDoc((d) => (d ? { ...d, objects: prev } : d));
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
      setDoc((prev) =>
        prev
          ? {
              ...prev,
              background_image: {
                source_path: selected,
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
    } catch (e) {
      setFeedback(`Falha ao importar imagem: ${toSicroError(e).message}`);
    }
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
      // Save the doc first so the PNG is always coherent with what's on disk.
      await saveCurrent(workspacePath, doc);
      const dataUrl = stageRef.current.toPng(2);
      if (!dataUrl) throw new Error("toDataURL retornou null");
      const path = await exportPng(workspacePath, dataUrl);
      setFeedback(`PNG salvo em ${path}`);
    } catch (err) {
      setFeedback(`Falha ao exportar: ${toSicroError(err).message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleBackToList = () => {
    clearCurrent();
  };

  const visibleObjects = useMemo(() => {
    const hiddenLayers = new Set(
      doc.layers.filter((l) => !l.visible).map((l) => l.id),
    );
    return doc.objects.filter((o) => !hiddenLayers.has(o.layer_id));
  }, [doc.layers, doc.objects]);

  const docForStage: SicroCroquiDoc = useMemo(
    () => ({ ...doc, objects: visibleObjects }),
    [doc, visibleObjects],
  );

  return (
    <div className={styles.wrap}>
      <Toolbar
        activeTool={editor.tool}
        onSelectTool={(t: Tool) => {
          editor.setTool(t);
          editor.setPending(null);
        }}
        canDelete={!!editor.selectedId}
        onDelete={handleDelete}
        canUndo={editor.history.length > 0}
        onUndo={handleUndo}
        onImportBackground={() => void handleImportBackground()}
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
          scaleLabel={
            doc.scale
              ? `${doc.scale.px_per_m.toFixed(2)} px/m`
              : "escala indefinida"
          }
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
      />
    </div>
  );
}

function StatusBar({
  tool,
  pointer,
  viewport,
  scaleLabel,
  feedback,
  croquiTitle,
}: {
  tool: Tool;
  pointer: SicroPoint;
  viewport: { scale: number; x: number; y: number };
  scaleLabel: string;
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
      <span>{scaleLabel}</span>
      <span className={styles.statusFeedback}>{feedback}</span>
    </div>
  );
}

// Make sure LineSubtype is treated as used (re-exported by engine but not
// referenced here directly).
void (null as unknown as LineSubtype | null);
