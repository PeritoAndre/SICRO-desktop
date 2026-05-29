/**
 * ImageEditor — bancada do MVP 7 (Editor de Imagem Pericial).
 *
 * Layout (inspirado em Peritus, com Design System SICRO):
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ ← Voltar  [Título]                          [Salvar][Export] │
 *   ├────┬────────────────────────────────────────────┬────────────┤
 *   │ T  │                                            │  Right     │
 *   │ b  │            Konva canvas                    │  panel     │
 *   │ ar │       (image base + annotations)           │  (tabs)    │
 *   │    │                                            │            │
 *   ├────┴────────────────────────────────────────────┴────────────┤
 *   │ zoom · x,y · ferramenta · tamanho · hash · status · feedback │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Tabs do painel direito:
 *   Camadas · Ajustes · Anotações · Histórico · Metadados.
 *
 * Decisão arquitetural (MVP):
 *   - Os ajustes (brightness/contrast/etc) são aplicados em **CSS
 *     filter** para o preview ao vivo — barato e instantâneo;
 *   - Na exportação enviamos os ajustes ao **backend Rust** que
 *     re-aplica via `image` crate produzindo bytes destrutivos
 *     reproduzíveis. O sidecar JSON registra exatamente os valores.
 *
 * As anotações são renderizadas em Konva por cima da imagem e ficam
 * no `.sicroimage` (não destrutivas).
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Circle as CircleIcon,
  Crop as CropIcon,
  Eye,
  EyeOff,
  FileImage,
  FilePlus,
  Hand,
  Hash,
  Image as ImageIconLucide,
  ListOrdered,
  MousePointer2,
  PenLine,
  Ruler,
  Save,
  Square,
  Trash2,
  Type as TypeIcon,
  X as XIcon,
  XSquare,
  ZoomIn,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useImageEditRoundtripStore } from "@stores/imageEditRoundtripStore";
import {
  Circle,
  Ellipse,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text as KonvaText,
  Transformer,
} from "react-konva";
import type Konva from "konva";
import { Button } from "@components/Button/Button";
import { commands } from "@core/commands";
import { toSicroError } from "@core/errors";
import type { BackendAdjustments, ImageOperationLog } from "@domain/image_analysis";
import { useImagemStore } from "../store/imagemStore";
import {
  makeArrow,
  makeEllipse,
  makeLine,
  makeMeasurement,
  makeNumberedMarker,
  makePoint,
  makeRect,
  makeRedaction,
  makeText,
  type SicroAnnotation,
  type SicroImageDoc,
} from "../engine";
import { adjustmentsToCssFilter, assetUrl, prettyBytes, shortHash } from "./shared";
import { HistogramPanel } from "./HistogramPanel";
import { ExifPanel } from "./ExifPanel";
import { ProcessingStackPanel } from "./ProcessingStackPanel";
import { ReportPreviewDialog } from "./ReportPreviewDialog";
import { FileText } from "lucide-react";
import styles from "./ImageEditor.module.css";

type Tool =
  | "select"
  | "pan"
  | "arrow"
  | "line"
  | "rect"
  | "ellipse"
  | "text"
  | "marker"
  | "point"
  | "measurement"
  | "redaction"
  | "set_scale"
  | "crop";

interface Props {
  workspacePath: string;
  onClose: () => void;
}

const RIGHT_TABS: Array<{ key: RightTab; label: string }> = [
  { key: "layers", label: "Camadas" },
  { key: "adjust", label: "Ajustes" },
  // G12 — novas abas:
  { key: "filters", label: "Filtros" },
  { key: "histogram", label: "Histograma" },
  { key: "exif", label: "EXIF" },
  { key: "annotations", label: "Objetos" },
  { key: "history", label: "Histórico" },
  { key: "meta", label: "Metadados" },
];
type RightTab =
  | "layers"
  | "adjust"
  | "filters"
  | "histogram"
  | "exif"
  | "annotations"
  | "history"
  | "meta";

export function ImageEditor({ workspacePath, onClose }: Props) {
  const analysis = useImagemStore((s) => s.activeAnalysis)!;
  const initialDoc = useImagemStore((s) => s.activeDoc)!;
  const saveActive = useImagemStore((s) => s.saveActive);

  // Pós-laudo S — Round-trip Laudo ↔ Imagem.
  const navigate = useNavigate();
  const roundtripState = useImageEditRoundtripStore((s) => s.state);
  const roundtripRequest = useImageEditRoundtripStore((s) => s.request);
  const completeRoundtrip = useImageEditRoundtripStore((s) => s.completeEdit);
  const isRoundtripActive = roundtripState === "editing" && !!roundtripRequest;
  const [returningToLaudo, setReturningToLaudo] = useState(false);

  const [doc, setDoc] = useState<SicroImageDoc>(initialDoc);
  // G12.22 — Modal de relatório pericial.
  const [reportOpen, setReportOpen] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);

  // Pós-laudo S — Crop tool state.
  // O fluxo: clica "Cortar" → tool="crop" → um retângulo de seleção
  // aparece já posicionado no centro da imagem (ou no crop atual, se
  // houver um). O perito ajusta arrastando o retângulo inteiro (move)
  // ou as 8 handles (4 cantos + 4 lados). "Aplicar" empurra a op
  // pra processing_stack + atualiza `cropApplied` para que o
  // KonvaImage renderize só a região recortada.
  const [cropPending, setCropPending] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  // Limite mínimo do retângulo de crop em pixels (impede colapsos).
  const CROP_MIN_PX = 16;

  // Crop ATIVO derivado do processing_stack: pega o último op crop habilitado
  // e usa as params {x,y,width,height} pra crop o KonvaImage.
  const cropApplied = useMemo(() => {
    const ops = doc.processing_stack ?? [];
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      if (op && op.enabled && op.kind === "crop") {
        const p = op.params as {
          x?: number;
          y?: number;
          width?: number;
          height?: number;
        };
        if (
          typeof p.x === "number" &&
          typeof p.y === "number" &&
          typeof p.width === "number" &&
          typeof p.height === "number"
        ) {
          return { x: p.x, y: p.y, width: p.width, height: p.height };
        }
      }
    }
    return null;
  }, [doc.processing_stack]);
  const [rightTab, setRightTab] = useState<RightTab>("adjust");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 });
  const [logs, setLogs] = useState<ImageOperationLog[]>([]);

  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const objectsLayerRef = useRef<Konva.Layer | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });

  // ----- Sync doc when store changes (e.g. opened a different analysis) -----
  useEffect(() => {
    setDoc(initialDoc);
  }, [initialDoc]);

  // ----- Resize observer for the canvas column -----
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setStageSize({
        width: Math.max(200, rect.width),
        height: Math.max(200, rect.height),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ----- Load the image and fit-to-screen on first paint -----
  const imageUrl = useMemo(
    () => assetUrl(workspacePath, doc.source.original_relative_path),
    [workspacePath, doc.source.original_relative_path],
  );
  const [htmlImage, setHtmlImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!imageUrl) return;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      setHtmlImage(img);
      // Fit to screen if the source dimensions and stage are known.
      const sw = img.width;
      const sh = img.height;
      const padding = 20;
      const scale = Math.min(
        (stageSize.width - padding * 2) / sw,
        (stageSize.height - padding * 2) / sh,
        1,
      );
      const ox = (stageSize.width - sw * scale) / 2;
      const oy = (stageSize.height - sh * scale) / 2;
      setViewport({ scale, x: ox, y: oy });
    };
    img.onerror = () => setHtmlImage(null);
  }, [imageUrl, stageSize.width, stageSize.height]);

  // ----- Pós-laudo S — Inicializa o retângulo de crop ao entrar em modo -----
  //
  // Quando o perito ativa a tool "crop", o retângulo aparece pronto:
  //   - se já existe um crop aplicado: começa por ele (deixa ajustar);
  //   - senão: 80% centralizado da imagem.
  // Saída do modo (tool muda) limpa cropPending.
  useEffect(() => {
    if (tool !== "crop") {
      setCropPending(null);
      return;
    }
    if (!htmlImage) return;
    if (cropPending) return; // já inicializado
    if (cropApplied) {
      setCropPending({ ...cropApplied });
      return;
    }
    const iw = htmlImage.width;
    const ih = htmlImage.height;
    const w = Math.round(iw * 0.8);
    const h = Math.round(ih * 0.8);
    setCropPending({
      x: Math.round((iw - w) / 2),
      y: Math.round((ih - h) / 2),
      width: w,
      height: h,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, htmlImage]);

  // ----- Load logs when history tab opens -----
  useEffect(() => {
    if (rightTab !== "history") return;
    commands
      .listImageOperationLogs(workspacePath, analysis.id, 50)
      .then(setLogs)
      .catch(() => setLogs([]));
  }, [rightTab, workspacePath, analysis.id]);

  // ----- Transformer wiring -----
  useEffect(() => {
    const tr = transformerRef.current;
    const layer = objectsLayerRef.current;
    if (!tr || !layer) return;
    if (!selectedId) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const node = layer.findOne(`#${selectedId}`);
    if (node) {
      tr.nodes([node]);
      tr.getLayer()?.batchDraw();
    } else {
      tr.nodes([]);
    }
  }, [selectedId, doc.annotations]);

  // ----- Mutators -----
  const addAnnotation = (a: SicroAnnotation) => {
    setDoc((d) => ({
      ...d,
      annotations: [...d.annotations, a],
    }));
    setSelectedId(a.id);
  };

  const updateAnnotation = (id: string, patch: Partial<SicroAnnotation>) => {
    setDoc((d) => ({
      ...d,
      annotations: d.annotations.map((a) =>
        a.id === id ? { ...a, ...patch } : a,
      ),
    }));
  };

  const deleteAnnotation = (id: string) => {
    setDoc((d) => ({
      ...d,
      annotations: d.annotations.filter((a) => a.id !== id),
    }));
    setSelectedId(null);
  };

  const updateAdjustments = (patch: Partial<BackendAdjustments>) => {
    setDoc((d) => ({
      ...d,
      view_adjustments: { ...d.view_adjustments, ...patch },
    }));
  };

  // ----- Canvas click dispatcher -----
  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target !== e.target.getStage()) {
      if (!isAddTool(tool)) return;
    }
    if (tool === "select") {
      setSelectedId(null);
      return;
    }
    if (tool === "pan") return;
    const stage = stageRef.current;
    if (!stage) return;
    const screen = stage.getPointerPosition();
    if (!screen) return;
    const world = {
      x: (screen.x - viewport.x) / viewport.scale,
      y: (screen.y - viewport.y) / viewport.scale,
    };

    // Pós-laudo S — Em modo "crop", clique no canvas é no-op. O retângulo
    // de seleção é manipulado direto via drag das handles + corpo (ver
    // CropOverlayLayer abaixo).
    if (tool === "crop") return;

    if (tool === "marker") {
      const nextNumber =
        doc.annotations.filter((a) => a.kind === "numbered_marker").length + 1;
      addAnnotation(makeNumberedMarker(world.x, world.y, nextNumber));
      setTool("select");
      return;
    }
    if (tool === "point") {
      addAnnotation(makePoint(world.x, world.y));
      setTool("select");
      return;
    }
    if (tool === "text") {
      const text = window.prompt("Texto:", "Anotação");
      if (text == null || text.trim() === "") return;
      addAnnotation(makeText(world.x, world.y, text.trim()));
      setTool("select");
      return;
    }
    // Two-click tools: arrow, line, rect, ellipse, measurement, redaction, set_scale
    if (!pending) {
      setPending(world);
      return;
    }
    const p1 = pending;
    const p2 = world;
    setPending(null);
    if (tool === "arrow") addAnnotation(makeArrow(p1.x, p1.y, p2.x, p2.y));
    else if (tool === "line") addAnnotation(makeLine(p1.x, p1.y, p2.x, p2.y));
    else if (tool === "rect")
      addAnnotation(makeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y));
    else if (tool === "ellipse")
      addAnnotation(makeEllipse(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y));
    else if (tool === "redaction")
      addAnnotation(makeRedaction(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y));
    else if (tool === "measurement")
      addAnnotation(makeMeasurement(p1.x, p1.y, p2.x, p2.y));
    else if (tool === "set_scale") {
      const px = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const declared = window.prompt(
        `Distância real entre os dois pontos (em metros)?\nPixels medidos: ${px.toFixed(1)}`,
        "1",
      );
      if (!declared) return;
      const real = Number(declared.replace(",", "."));
      if (!Number.isFinite(real) || real <= 0) {
        setFeedback("Valor inválido — escala não atualizada.");
        return;
      }
      const pxPerUnit = px / real;
      setDoc((d) => ({
        ...d,
        scale: {
          px_per_unit: pxPerUnit,
          unit: "m",
          calibrated_by: [p1, p2],
          calibration_real_distance: real,
          created_at: new Date().toISOString(),
        },
      }));
      setFeedback(`Escala definida: ${pxPerUnit.toFixed(2)} px/m.`);
    }
    setTool("select");
  };

  // ----- Mouse + zoom handlers -----
  const handleStageMouseMove = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const world = {
      x: (pos.x - viewport.x) / viewport.scale,
      y: (pos.y - viewport.y) / viewport.scale,
    };
    setPointer(world);
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;
    const oldScale = viewport.scale;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const factor = direction > 0 ? 1.08 : 0.92;
    const newScale = Math.max(0.1, Math.min(8, oldScale * factor));
    const mousePointTo = {
      x: (pointerPos.x - viewport.x) / oldScale,
      y: (pointerPos.y - viewport.y) / oldScale,
    };
    setViewport({
      scale: newScale,
      x: pointerPos.x - mousePointTo.x * newScale,
      y: pointerPos.y - mousePointTo.y * newScale,
    });
  };

  // ----- Keyboard shortcuts -----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") {
        setPending(null);
        setSelectedId(null);
        setTool("select");
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteAnnotation(selectedId);
      } else if (e.key === "v" && !e.ctrlKey && !e.metaKey) {
        setTool("select");
      } else if (e.key === "h" && !e.ctrlKey && !e.metaKey) {
        setTool("pan");
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, doc]);

  // ----- Crop tool actions (pós-laudo S) -----
  const applyCrop = () => {
    if (!cropPending) return;
    // Clamp ao tamanho da imagem natural (htmlImage).
    if (!htmlImage) return;
    const iw = htmlImage.width;
    const ih = htmlImage.height;
    const x = Math.max(0, Math.min(iw - 1, Math.round(cropPending.x)));
    const y = Math.max(0, Math.min(ih - 1, Math.round(cropPending.y)));
    const width = Math.max(1, Math.min(iw - x, Math.round(cropPending.width)));
    const height = Math.max(1, Math.min(ih - y, Math.round(cropPending.height)));
    const op = {
      id: `crop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      kind: "crop" as const,
      enabled: true,
      params: { x, y, width, height },
      created_at: new Date().toISOString(),
    };
    // Substitui qualquer crop anterior (apenas um crop ativo por vez).
    setDoc((d) => ({
      ...d,
      processing_stack: [
        ...d.processing_stack.filter(
          (o) => !(o.kind === "crop" && o.enabled),
        ),
        op,
      ],
    }));
    setCropPending(null);
    setTool("select");
    setFeedback(`Corte aplicado (${width}×${height}px).`);
  };
  const cancelCrop = () => {
    setCropPending(null);
    setTool("select");
  };
  const removeAppliedCrop = () => {
    setDoc((d) => ({
      ...d,
      processing_stack: d.processing_stack.filter((o) => o.kind !== "crop"),
    }));
    setFeedback("Corte removido — imagem original restaurada.");
  };

  // ----- Round-trip: Salvar e voltar pro laudo (pós-laudo S) -----
  const handleReturnToLaudo = async () => {
    if (!roundtripRequest) return;
    setReturningToLaudo(true);
    setFeedback("Salvando e exportando…");
    try {
      // Salva o doc atual (com processing_stack incluindo o crop).
      const metadata = {
        annotations_count: doc.annotations.length,
        has_scale: !!doc.scale,
        view_adjustments: doc.view_adjustments,
        roundtrip: true,
      };
      await saveActive(workspacePath, doc, JSON.stringify(metadata));

      // Compõe o PNG visual via Konva (com o crop aplicado visualmente —
      // veja o KonvaImage abaixo). Backend não re-aplica ajustes pra
      // evitar dupla aplicação.
      const dataUrl =
        stageRef.current?.toDataURL({
          pixelRatio: 2,
          mimeType: "image/png",
        }) ?? null;
      const composedBase64 = dataUrl
        ? dataUrl.replace(/^data:image\/png;base64,/, "")
        : null;

      const exp = await commands.exportImageDerivative(
        workspacePath,
        analysis.id,
        {
          apply_backend_adjustments: false,
          composed_png_base64: composedBase64,
          adjustments: doc.view_adjustments,
          operations: [],
          format: "png",
          operation_summary_json: JSON.stringify({
            roundtrip_source: roundtripRequest.source_relative_path,
            laudo_id: roundtripRequest.laudo_id,
            crop_applied: cropApplied,
            annotations: doc.annotations.length,
          }),
        },
      );

      // Sinaliza o store: o laudo vai pegar isso ao montar.
      completeRoundtrip({
        output_relative_path: exp.output_relative_path,
        source_relative_path: roundtripRequest.source_relative_path,
      });
      // Volta pro laudo. O LaudoEditorView aplica o novo path nas figures.
      navigate("/laudo");
    } catch (err) {
      setFeedback(`Falha ao voltar para o laudo: ${toSicroError(err).message}`);
      setReturningToLaudo(false);
    }
  };

  // ----- Actions -----
  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const metadata = {
        annotations_count: doc.annotations.length,
        has_scale: !!doc.scale,
        view_adjustments: doc.view_adjustments,
      };
      await saveActive(workspacePath, doc, JSON.stringify(metadata));
      setFeedback("Análise salva.");
      setTimeout(() => setFeedback(null), 2500);
    } catch (err) {
      setFeedback(`Falha ao salvar: ${toSicroError(err).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setFeedback(null);
    try {
      // Save sessão antes do export para sidecar refletir o último estado.
      await saveActive(workspacePath, doc);
      // Compose PNG client-side via Konva (image + annotations + filter
      // via stage option pixelRatio + transform). The filter applied
      // here is CSS, so we duplicate the math in the backend pipeline
      // to keep the bytes truly reproducible. The backend will run the
      // adjustments again on top of the composed PNG IF
      // `apply_backend_adjustments=true`. To avoid double application
      // we send composed PNG and skip backend adjustments.
      const dataUrl =
        stageRef.current?.toDataURL({ pixelRatio: 2, mimeType: "image/png" }) ??
        null;
      const composedBase64 = dataUrl
        ? dataUrl.replace(/^data:image\/png;base64,/, "")
        : null;
      const exp = await commands.exportImageDerivative(
        workspacePath,
        analysis.id,
        {
          apply_backend_adjustments: false,
          composed_png_base64: composedBase64,
          adjustments: doc.view_adjustments,
          operations: [],
          format: "png",
          operation_summary_json: JSON.stringify({
            annotations: doc.annotations.length,
            has_scale: !!doc.scale,
            scale: doc.scale,
            view_adjustments: doc.view_adjustments,
          }),
        },
      );
      setFeedback(`Imagem exportada: ${exp.output_relative_path}`);
    } catch (err) {
      setFeedback(`Falha ao exportar: ${toSicroError(err).message}`);
    } finally {
      setExporting(false);
    }
  };

  // ----- Render -----
  const cssFilter = adjustmentsToCssFilter(doc.view_adjustments);
  const annotationsLayerVisible = doc.layers.find(
    (l) => l.id === "layer_annotations",
  )?.visible !== false;

  return (
    <div className={styles.wrap}>
      {/* Pós-laudo S — Banner do round-trip Laudo↔Imagem. */}
      {isRoundtripActive && roundtripRequest && (
        <div
          style={{
            background:
              "linear-gradient(90deg, rgba(14,165,233,0.15), rgba(14,165,233,0.05))",
            borderBottom: "1px solid rgba(14,165,233,0.4)",
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 12,
            color: "var(--sicro-fg)",
          }}
        >
          <CropIcon size={14} color="#0ea5e9" />
          <strong>Editando foto do laudo</strong>
          {roundtripRequest.laudo_title && (
            <span style={{ color: "var(--sicro-fg-dim)" }}>
              — {roundtripRequest.laudo_title}
            </span>
          )}
          <span style={{ marginLeft: "auto", color: "var(--sicro-fg-dim)" }}>
            Clique <strong>Salvar e voltar</strong> para devolver ao laudo
            com as edições aplicadas.
          </span>
        </div>
      )}
      <header className={styles.topBar}>
        <button type="button" className={styles.backBtn} onClick={onClose}>
          <ArrowLeft size={14} /> Voltar
        </button>
        <input
          className={styles.titleInput}
          value={doc.title}
          onChange={(e) => setDoc((d) => ({ ...d, title: e.target.value }))}
          aria-label="Título da análise"
        />
        <div className={styles.topActions}>
          <Button
            variant="secondary"
            leftIcon={<Save size={14} />}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
          {/* G12.22 — Botão de relatório pericial. */}
          <Button
            variant="secondary"
            leftIcon={<FileText size={14} />}
            onClick={() => setReportOpen(true)}
          >
            Relatório
          </Button>
          {isRoundtripActive ? (
            // Pós-laudo S — Botão dedicado de round-trip. Substitui o
            // botão "Exportar" enquanto o roundtrip estiver ativo —
            // o perito só precisa decidir Salvar+voltar, não exportação
            // genérica.
            <Button
              variant="primary"
              leftIcon={<Check size={14} />}
              onClick={() => void handleReturnToLaudo()}
              disabled={returningToLaudo}
            >
              {returningToLaudo ? "Voltando…" : "Salvar e voltar pro laudo"}
            </Button>
          ) : (
            <Button
              variant="primary"
              leftIcon={<FileImage size={14} />}
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              {exporting ? "Exportando…" : "Exportar"}
            </Button>
          )}
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.toolbar} aria-label="Ferramentas">
          <ToolBtn icon={<MousePointer2 size={14} />} active={tool === "select"} onClick={() => setTool("select")} title="Selecionar (V)" />
          <ToolBtn icon={<Hand size={14} />} active={tool === "pan"} onClick={() => setTool("pan")} title="Pan (H)" />
          <div className={styles.toolDivider} />
          <ToolBtn icon={<ArrowUpRight size={14} />} active={tool === "arrow"} onClick={() => setTool("arrow")} title="Seta" />
          <ToolBtn icon={<PenLine size={14} />} active={tool === "line"} onClick={() => setTool("line")} title="Linha" />
          <ToolBtn icon={<Square size={14} />} active={tool === "rect"} onClick={() => setTool("rect")} title="Retângulo" />
          <ToolBtn icon={<CircleIcon size={14} />} active={tool === "ellipse"} onClick={() => setTool("ellipse")} title="Elipse" />
          <ToolBtn icon={<TypeIcon size={14} />} active={tool === "text"} onClick={() => setTool("text")} title="Texto" />
          <ToolBtn icon={<ListOrdered size={14} />} active={tool === "marker"} onClick={() => setTool("marker")} title="Marcador numerado" />
          <div className={styles.toolDivider} />
          <ToolBtn icon={<Ruler size={14} />} active={tool === "measurement"} onClick={() => setTool("measurement")} title="Medida" />
          <ToolBtn icon={<Hash size={14} />} active={tool === "set_scale"} onClick={() => setTool("set_scale")} title="Definir escala" />
          <div className={styles.toolDivider} />
          <ToolBtn icon={<XSquare size={14} />} active={tool === "redaction"} onClick={() => setTool("redaction")} title="Tarja" />
          <div className={styles.toolDivider} />
          {/* Pós-laudo S — Crop tool. */}
          <ToolBtn
            icon={<CropIcon size={14} />}
            active={tool === "crop"}
            onClick={() => {
              // O retângulo é inicializado pelo useEffect — limpa o
              // estado anterior pra forçar reinit a partir do crop
              // aplicado (ou default).
              setCropPending(null);
              setTool("crop");
            }}
            title="Cortar imagem (arraste o retângulo)"
          />
          {cropApplied && tool !== "crop" && (
            <ToolBtn
              icon={<XIcon size={14} />}
              active={false}
              onClick={removeAppliedCrop}
              title="Remover corte aplicado"
            />
          )}
        </aside>

        <div
          className={styles.canvasArea}
          ref={canvasWrapRef}
          style={{ position: "relative" }}
        >
          {/* Pós-laudo S — Barra flutuante de Apply/Cancel do crop tool. */}
          {tool === "crop" && (
            <div
              style={{
                position: "absolute",
                top: 12,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 10,
                background: "rgba(15, 23, 42, 0.92)",
                color: "#fff",
                padding: "8px 12px",
                borderRadius: 6,
                display: "flex",
                gap: 8,
                alignItems: "center",
                fontSize: 12,
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              }}
            >
              {cropPending ? (
                <span>
                  Arraste o retângulo ou as alças —{" "}
                  <strong>
                    {Math.round(cropPending.width)}×
                    {Math.round(cropPending.height)} px
                  </strong>
                </span>
              ) : (
                <span>Preparando seleção…</span>
              )}
              <div
                style={{
                  width: 1,
                  height: 16,
                  background: "rgba(255,255,255,0.2)",
                  margin: "0 4px",
                }}
              />
              <button
                type="button"
                onClick={applyCrop}
                disabled={!cropPending}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  background: cropPending ? "#0ea5e9" : "rgba(255,255,255,0.1)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: cropPending ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <Check size={12} /> Aplicar
              </button>
              <button
                type="button"
                onClick={cancelCrop}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  background: "rgba(255,255,255,0.1)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 12,
                }}
              >
                <XIcon size={12} /> Cancelar
              </button>
            </div>
          )}
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            x={viewport.x}
            y={viewport.y}
            scaleX={viewport.scale}
            scaleY={viewport.scale}
            draggable={tool === "pan"}
            onClick={handleStageClick}
            onMouseMove={handleStageMouseMove}
            onWheel={handleWheel}
            onDragEnd={(e) => {
              if (tool !== "pan") return;
              const stage = e.target;
              setViewport({
                scale: stage.scaleX(),
                x: stage.x(),
                y: stage.y(),
              });
            }}
            style={{ background: doc.canvas.background_color, cursor: tool === "pan" ? "grab" : "default" }}
          >
            {/* Image layer with CSS filter applied via filter attr on KonvaImage's parent group is not possible.
                Konva supports image filters (Konva.Filters.Brighten etc.), but they require pixelRatio updates.
                For MVP we apply a CSS filter to the outer canvas via a layer of Konva.Image with .filters([]).
                Pragmatic approach: render the HTMLImageElement and rely on the visual presentation through
                a stage-wrapping div CSS filter. We pass the filter through the wrapper container. */}
            <Layer listening={false}>
              {htmlImage && cropApplied ? (
                // Pós-laudo S — crop aplicado: usa `crop` do Konva.Image pra
                // limitar a região renderizada à do crop_op. x/y/width/height
                // viram as dimensões cortadas — a imagem aparece "encolhida"
                // pro tamanho do recorte.
                <KonvaImage
                  image={htmlImage}
                  x={0}
                  y={0}
                  width={cropApplied.width}
                  height={cropApplied.height}
                  crop={{
                    x: cropApplied.x,
                    y: cropApplied.y,
                    width: cropApplied.width,
                    height: cropApplied.height,
                  }}
                />
              ) : htmlImage ? (
                <KonvaImage
                  image={htmlImage}
                  x={0}
                  y={0}
                  width={htmlImage.width}
                  height={htmlImage.height}
                />
              ) : null}
            </Layer>
            {/* Pós-laudo S — Crop tool: retângulo arrastável + 8 handles +
                dim outside. Tudo em escala de "imagem source" (coords
                world). Os handles usam 1/viewport.scale pra ficar com
                tamanho constante na tela mesmo quando o usuário dá zoom. */}
            {tool === "crop" && cropPending && htmlImage && (
              <CropOverlayLayer
                imageWidth={htmlImage.width}
                imageHeight={htmlImage.height}
                crop={cropPending}
                viewportScale={viewport.scale}
                minSize={CROP_MIN_PX}
                onChange={(next) => setCropPending(next)}
              />
            )}
            <Layer ref={objectsLayerRef} visible={annotationsLayerVisible}>
              {doc.annotations.map((a) => (
                <AnnotationNode
                  key={a.id}
                  a={a}
                  draggable={tool === "select" && !a.locked}
                  onSelect={() => setSelectedId(a.id)}
                  onChange={(patch) => updateAnnotation(a.id, patch)}
                />
              ))}
              <Transformer
                ref={transformerRef}
                rotateEnabled
                enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
                boundBoxFunc={(_, next) => {
                  if (Math.abs(next.width) < 4 || Math.abs(next.height) < 4) return _;
                  return next;
                }}
              />
            </Layer>
            <Layer listening={false}>
              {pending && (
                <PendingMarker x={pending.x} y={pending.y} cursor={pointer} />
              )}
            </Layer>
          </Stage>

          {/* CSS-filter overlay for preview adjustments. The Konva stage is
              wrapped in an absolutely positioned div that applies the
              filter to a sibling. This approach keeps the Konva pixels
              untouched (annotations stay sharp). */}
          {cssFilter && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                backdropFilter: cssFilter,
                mixBlendMode: "normal",
              }}
            />
          )}

          <StatusBar
            tool={tool}
            pointer={pointer}
            viewport={viewport}
            doc={doc}
            saving={saving}
            exporting={exporting}
            feedback={feedback}
          />
        </div>

        <aside className={styles.right} aria-label="Painel direito">
          <nav className={styles.rightTabs} role="tablist">
            {RIGHT_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={rightTab === t.key}
                className={`${styles.rightTab} ${rightTab === t.key ? styles.rightTabActive : ""}`}
                onClick={() => setRightTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className={styles.rightBody}>
            {rightTab === "layers" && (
              <LayersPanel
                doc={doc}
                onToggleLayer={(id) =>
                  setDoc((d) => ({
                    ...d,
                    layers: d.layers.map((l) =>
                      l.id === id ? { ...l, visible: !l.visible } : l,
                    ),
                  }))
                }
              />
            )}
            {rightTab === "adjust" && (
              <AdjustmentsPanel
                adjustments={doc.view_adjustments}
                onChange={updateAdjustments}
                onReset={() =>
                  updateAdjustments({
                    brightness: 0,
                    contrast: 0,
                    gamma: 1,
                    saturation: 0,
                    grayscale: false,
                    invert: false,
                  })
                }
              />
            )}
            {rightTab === "annotations" && (
              <AnnotationsListPanel
                doc={doc}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onDelete={deleteAnnotation}
                onToggleVisibility={(id) => {
                  const a = doc.annotations.find((x) => x.id === id);
                  if (!a) return;
                  updateAnnotation(id, { visible: a.visible === false });
                }}
              />
            )}
            {rightTab === "filters" && (
              <ProcessingStackPanel
                stack={doc.processing_stack ?? []}
                onChange={(next) =>
                  setDoc((d) => ({ ...d, processing_stack: next }))
                }
              />
            )}
            {rightTab === "histogram" && (
              <HistogramPanel
                workspacePath={workspacePath}
                relativePath={doc.source.original_relative_path}
              />
            )}
            {rightTab === "exif" && (
              <ExifPanel
                workspacePath={workspacePath}
                relativePath={doc.source.original_relative_path}
              />
            )}
            {rightTab === "history" && <HistoryPanel logs={logs} />}
            {rightTab === "meta" && <MetaPanel doc={doc} />}
          </div>
        </aside>
      </div>
      {/* G12.22 — Modal global do relatório pericial */}
      <ReportPreviewDialog
        open={reportOpen}
        workspacePath={workspacePath}
        analysisId={analysis.id}
        onClose={() => setReportOpen(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool button

function ToolBtn({
  icon,
  active,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      className={`${styles.toolBtn} ${active ? styles.toolBtnActive : ""}`}
      onClick={onClick}
      title={title}
    >
      {icon}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Pós-laudo S — Crop Overlay (Konva)
//
// Camada de seleção do crop tool. Renderiza:
//   - 4 retângulos escuros cobrindo a área que será descartada (dim);
//   - 1 retângulo brilhante (claro) com borda azul = a área que fica;
//   - 8 handles (4 cantos + 4 lados) draggables.
//
// Todas as coordenadas estão no espaço da imagem source (mundo).
// `viewportScale` escala os elementos visuais (handles, traços) para
// manter tamanho constante na tela mesmo com zoom.
//
// O componente é totalmente controlado pelo pai via `crop` + `onChange`.

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function CropOverlayLayer({
  imageWidth,
  imageHeight,
  crop,
  viewportScale,
  minSize,
  onChange,
}: {
  imageWidth: number;
  imageHeight: number;
  crop: CropRect;
  viewportScale: number;
  minSize: number;
  onChange: (next: CropRect) => void;
}) {
  // Tamanhos visuais constantes em pixels de tela (independentes do zoom).
  const handleSize = 10 / viewportScale; // lado do quadrado handle
  const handleHit = 16 / viewportScale; // área de clique invisível extra
  const strokeWidth = 2 / viewportScale;
  const dashLen = 6 / viewportScale;

  // Clamp helper — garante: dentro da imagem + tamanho mínimo.
  const clampRect = (r: CropRect): CropRect => {
    const x = Math.max(0, Math.min(imageWidth - minSize, r.x));
    const y = Math.max(0, Math.min(imageHeight - minSize, r.y));
    const width = Math.max(minSize, Math.min(imageWidth - x, r.width));
    const height = Math.max(minSize, Math.min(imageHeight - y, r.height));
    return { x, y, width, height };
  };

  // Mover o retângulo inteiro (drag no corpo).
  const onBodyDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const nx = node.x();
    const ny = node.y();
    onChange(clampRect({ ...crop, x: nx, y: ny }));
  };

  // Helpers para handles: cada um atualiza 1 ou 2 bordas (left, top, right, bottom).
  type Edge = "l" | "t" | "r" | "b";
  const dragHandle = (edges: Edge[]) =>
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      const nx = node.x();
      const ny = node.y();
      let left = crop.x;
      let top = crop.y;
      let right = crop.x + crop.width;
      let bottom = crop.y + crop.height;
      if (edges.includes("l")) left = nx;
      if (edges.includes("t")) top = ny;
      if (edges.includes("r")) right = nx;
      if (edges.includes("b")) bottom = ny;
      // Garante invariantes (left < right, top < bottom).
      if (right < left + minSize) {
        if (edges.includes("r")) right = left + minSize;
        else left = right - minSize;
      }
      if (bottom < top + minSize) {
        if (edges.includes("b")) bottom = top + minSize;
        else top = bottom - minSize;
      }
      onChange(
        clampRect({
          x: left,
          y: top,
          width: right - left,
          height: bottom - top,
        }),
      );
    };

  // Posições das 8 handles (cx, cy) + edges que cada uma controla + cursor.
  const cx = crop.x + crop.width / 2;
  const cy = crop.y + crop.height / 2;
  const x2 = crop.x + crop.width;
  const y2 = crop.y + crop.height;
  const handles: Array<{
    key: string;
    cx: number;
    cy: number;
    edges: Edge[];
    cursor: string;
  }> = [
    { key: "nw", cx: crop.x, cy: crop.y, edges: ["l", "t"], cursor: "nwse-resize" },
    { key: "n", cx, cy: crop.y, edges: ["t"], cursor: "ns-resize" },
    { key: "ne", cx: x2, cy: crop.y, edges: ["r", "t"], cursor: "nesw-resize" },
    { key: "e", cx: x2, cy, edges: ["r"], cursor: "ew-resize" },
    { key: "se", cx: x2, cy: y2, edges: ["r", "b"], cursor: "nwse-resize" },
    { key: "s", cx, cy: y2, edges: ["b"], cursor: "ns-resize" },
    { key: "sw", cx: crop.x, cy: y2, edges: ["l", "b"], cursor: "nesw-resize" },
    { key: "w", cx: crop.x, cy, edges: ["l"], cursor: "ew-resize" },
  ];

  return (
    <Layer>
      {/* Dim outside: 4 retângulos ao redor da área de crop. */}
      <Rect
        x={0}
        y={0}
        width={imageWidth}
        height={crop.y}
        fill="rgba(0,0,0,0.55)"
        listening={false}
      />
      <Rect
        x={0}
        y={crop.y + crop.height}
        width={imageWidth}
        height={Math.max(0, imageHeight - crop.y - crop.height)}
        fill="rgba(0,0,0,0.55)"
        listening={false}
      />
      <Rect
        x={0}
        y={crop.y}
        width={crop.x}
        height={crop.height}
        fill="rgba(0,0,0,0.55)"
        listening={false}
      />
      <Rect
        x={crop.x + crop.width}
        y={crop.y}
        width={Math.max(0, imageWidth - crop.x - crop.width)}
        height={crop.height}
        fill="rgba(0,0,0,0.55)"
        listening={false}
      />

      {/* Retângulo principal: borda + corpo draggable para mover tudo. */}
      <Rect
        x={crop.x}
        y={crop.y}
        width={crop.width}
        height={crop.height}
        stroke="#0ea5e9"
        strokeWidth={strokeWidth}
        dash={[dashLen, dashLen * 0.6]}
        fill="transparent"
        draggable
        onDragMove={onBodyDragMove}
        onMouseEnter={(e) => {
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = "move";
        }}
        onMouseLeave={(e) => {
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = "";
        }}
      />

      {/* Linhas de regra dos terços — ajudam composição visual. */}
      {[1, 2].map((i) => (
        <Line
          key={`v${i}`}
          points={[
            crop.x + (crop.width * i) / 3,
            crop.y,
            crop.x + (crop.width * i) / 3,
            crop.y + crop.height,
          ]}
          stroke="rgba(255,255,255,0.35)"
          strokeWidth={1 / viewportScale}
          listening={false}
        />
      ))}
      {[1, 2].map((i) => (
        <Line
          key={`h${i}`}
          points={[
            crop.x,
            crop.y + (crop.height * i) / 3,
            crop.x + crop.width,
            crop.y + (crop.height * i) / 3,
          ]}
          stroke="rgba(255,255,255,0.35)"
          strokeWidth={1 / viewportScale}
          listening={false}
        />
      ))}

      {/* 8 handles draggables. Cada handle é um Rect branco com borda azul. */}
      {handles.map((h) => (
        <Rect
          key={h.key}
          x={h.cx}
          y={h.cy}
          width={handleSize}
          height={handleSize}
          offsetX={handleSize / 2}
          offsetY={handleSize / 2}
          fill="#fff"
          stroke="#0ea5e9"
          strokeWidth={1.5 / viewportScale}
          draggable
          onDragMove={dragHandle(h.edges)}
          // Aumenta área de clique invisível (hitStrokeWidth → padding clicável).
          hitStrokeWidth={handleHit}
          onMouseEnter={(e) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = h.cursor;
          }}
          onMouseLeave={(e) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = "";
          }}
        />
      ))}
    </Layer>
  );
}

// ---------------------------------------------------------------------------
// Annotation node (Konva)

function AnnotationNode({
  a,
  draggable,
  onSelect,
  onChange,
}: {
  a: SicroAnnotation;
  draggable: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<SicroAnnotation>) => void;
}) {
  if (a.visible === false) return null;
  const stroke = a.stroke ?? "#ef4444";
  const fill = a.fill ?? "transparent";
  const strokeWidth = a.stroke_width ?? 2;
  const opacity = a.opacity ?? 1;

  const commonHandlers = {
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) =>
      onChange({ x: e.target.x(), y: e.target.y() }),
  };

  if (a.kind === "rect" || a.kind === "redaction") {
    return (
      <Rect
        id={a.id}
        x={a.x}
        y={a.y}
        width={a.width ?? 0}
        height={a.height ?? 0}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill={a.kind === "redaction" ? "#000000" : fill}
        opacity={a.kind === "redaction" ? 1 : opacity}
        draggable={draggable}
        {...commonHandlers}
      />
    );
  }
  if (a.kind === "ellipse") {
    return (
      <Ellipse
        id={a.id}
        x={a.x + (a.width ?? 0) / 2}
        y={a.y + (a.height ?? 0) / 2}
        radiusX={Math.abs((a.width ?? 0) / 2)}
        radiusY={Math.abs((a.height ?? 0) / 2)}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill={fill}
        opacity={opacity}
        draggable={draggable}
        {...commonHandlers}
      />
    );
  }
  if (a.kind === "arrow" || a.kind === "line" || a.kind === "measurement") {
    return (
      <Group
        id={a.id}
        draggable={draggable}
        {...commonHandlers}
        onDragEnd={(e) => {
          const dx = e.target.x();
          const dy = e.target.y();
          e.target.position({ x: 0, y: 0 });
          onChange({
            x: a.x + dx,
            y: a.y + dy,
            x2: (a.x2 ?? 0) + dx,
            y2: (a.y2 ?? 0) + dy,
          });
        }}
      >
        <Line
          points={[a.x, a.y, a.x2 ?? a.x, a.y2 ?? a.y]}
          stroke={stroke}
          strokeWidth={strokeWidth}
          opacity={opacity}
          dash={a.kind === "measurement" ? [8, 4] : undefined}
          hitStrokeWidth={Math.max(strokeWidth, 12)}
        />
        {a.kind === "arrow" && a.x2 != null && a.y2 != null && (
          <ArrowHead x1={a.x} y1={a.y} x2={a.x2} y2={a.y2} color={stroke} size={Math.max(strokeWidth * 4, 12)} />
        )}
        {a.kind === "measurement" && (
          <KonvaText
            x={(a.x + (a.x2 ?? a.x)) / 2}
            y={(a.y + (a.y2 ?? a.y)) / 2 - 14}
            text={`${Math.hypot((a.x2 ?? a.x) - a.x, (a.y2 ?? a.y) - a.y).toFixed(1)} px`}
            fontSize={11}
            fill={stroke}
            listening={false}
          />
        )}
      </Group>
    );
  }
  if (a.kind === "text") {
    return (
      <KonvaText
        id={a.id}
        x={a.x}
        y={a.y}
        text={a.text ?? ""}
        fontSize={16}
        fontStyle="bold"
        fill={a.fill ?? stroke}
        opacity={opacity}
        draggable={draggable}
        {...commonHandlers}
      />
    );
  }
  if (a.kind === "numbered_marker") {
    return (
      <Group
        id={a.id}
        x={a.x}
        y={a.y}
        draggable={draggable}
        {...commonHandlers}
      >
        <Circle radius={11} fill={a.fill ?? "#dc2626"} stroke={a.stroke ?? "#ffffff"} strokeWidth={2} />
        <KonvaText
          text={String(a.number ?? a.text ?? "")}
          fontSize={12}
          fontStyle="bold"
          fill="#ffffff"
          align="center"
          verticalAlign="middle"
          width={22}
          height={22}
          offsetX={11}
          offsetY={11}
          listening={false}
        />
      </Group>
    );
  }
  if (a.kind === "point") {
    return (
      <Circle
        id={a.id}
        x={a.x}
        y={a.y}
        radius={5}
        fill={a.fill ?? "#22c55e"}
        stroke={stroke}
        strokeWidth={1}
        draggable={draggable}
        {...commonHandlers}
      />
    );
  }
  return null;
}

function ArrowHead({
  x1,
  y1,
  x2,
  y2,
  color,
  size,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  size: number;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return null;
  const ux = dx / len;
  const uy = dy / len;
  const rad = (30 * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const back1x = x2 - size * (ux * cos - uy * sin);
  const back1y = y2 - size * (uy * cos + ux * sin);
  const back2x = x2 - size * (ux * cos + uy * sin);
  const back2y = y2 - size * (uy * cos - ux * sin);
  return (
    <Line
      points={[x2, y2, back1x, back1y, back2x, back2y]}
      closed
      fill={color}
      stroke={color}
      strokeWidth={1}
      listening={false}
    />
  );
}

function PendingMarker({
  x,
  y,
  cursor,
}: {
  x: number;
  y: number;
  cursor: { x: number; y: number };
}) {
  return (
    <Group listening={false}>
      <Line
        points={[x, y, cursor.x, cursor.y]}
        stroke="#0ea5e9"
        strokeWidth={1}
        dash={[6, 4]}
      />
      <Rect x={x - 3} y={y - 3} width={6} height={6} fill="#0ea5e9" />
    </Group>
  );
}

function isAddTool(t: Tool): boolean {
  return (
    t !== "select" &&
    t !== "pan"
  );
}

// ---------------------------------------------------------------------------
// StatusBar

function StatusBar({
  tool,
  pointer,
  viewport,
  doc,
  saving,
  exporting,
  feedback,
}: {
  tool: Tool;
  pointer: { x: number; y: number };
  viewport: { scale: number };
  doc: SicroImageDoc;
  saving: boolean;
  exporting: boolean;
  feedback: string | null;
}) {
  return (
    <div className={styles.statusBar}>
      <span>
        Ferramenta: <code>{tool}</code>
      </span>
      <span>
        x={pointer.x.toFixed(0)} · y={pointer.y.toFixed(0)}
      </span>
      <span>zoom {(viewport.scale * 100).toFixed(0)}%</span>
      <span>
        {doc.source.width}×{doc.source.height} px
      </span>
      <span>
        {doc.scale
          ? `escala ${doc.scale.px_per_unit.toFixed(2)} px/${doc.scale.unit}`
          : "escala indefinida"}
      </span>
      <span>{doc.annotations.length} anot.</span>
      <span>{prettyBytes(doc.source.size_bytes)}</span>
      <span>SHA {shortHash(doc.source.original_hash_sha256)}</span>
      <span className={styles.statusFeedback}>
        {saving ? "salvando…" : exporting ? "exportando…" : feedback}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right panel — Layers

function LayersPanel({
  doc,
  onToggleLayer,
}: {
  doc: SicroImageDoc;
  onToggleLayer: (id: string) => void;
}) {
  return (
    <>
      <h3 className={styles.sectionTitle}>Camadas</h3>
      <ul className={styles.objectList}>
        {doc.layers.map((l) => (
          <li
            key={l.id}
            className={styles.objectItem}
          >
            <button
              type="button"
              className={styles.objectVisBtn}
              onClick={() => onToggleLayer(l.id)}
            >
              {l.visible ? <Eye size={11} /> : <EyeOff size={11} />}
            </button>
            <span className={styles.objectLabel}>{l.name}</span>
            <span className={styles.objectKind}>{l.kind}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Right panel — Adjustments

function AdjustmentsPanel({
  adjustments,
  onChange,
  onReset,
}: {
  adjustments: BackendAdjustments;
  onChange: (patch: Partial<BackendAdjustments>) => void;
  onReset: () => void;
}) {
  return (
    <>
      <h3 className={styles.sectionTitle}>Ajustes não destrutivos</h3>
      <Slider
        label="Brilho"
        min={-100}
        max={100}
        step={1}
        value={adjustments.brightness}
        onChange={(v) => onChange({ brightness: v })}
      />
      <Slider
        label="Contraste"
        min={-100}
        max={100}
        step={1}
        value={adjustments.contrast}
        onChange={(v) => onChange({ contrast: v })}
      />
      <Slider
        label="Gamma"
        min={0.2}
        max={3}
        step={0.05}
        value={adjustments.gamma}
        onChange={(v) => onChange({ gamma: v })}
        format={(v) => v.toFixed(2)}
      />
      <Slider
        label="Saturação"
        min={-100}
        max={100}
        step={1}
        value={adjustments.saturation}
        onChange={(v) => onChange({ saturation: v })}
      />
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={adjustments.grayscale}
          onChange={(e) => onChange({ grayscale: e.target.checked })}
        />
        Tons de cinza
      </label>
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={adjustments.invert}
          onChange={(e) => onChange({ invert: e.target.checked })}
        />
        Inverter cores
      </label>
      <button type="button" className={styles.resetBtn} onClick={onReset}>
        Resetar ajustes
      </button>
      <p style={{ fontSize: 10, color: "var(--sicro-fg-dim)", margin: 0, lineHeight: 1.4 }}>
        Os ajustes são <strong>não destrutivos</strong>: aplicados em preview
        no canvas e re-aplicados no export pelo backend.
      </p>
    </>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className={styles.slider}>
      <header>
        <strong>{label}</strong>
        <code>{format ? format(value) : value}</code>
      </header>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right panel — Annotations list

function AnnotationsListPanel({
  doc,
  selectedId,
  onSelect,
  onDelete,
  onToggleVisibility,
}: {
  doc: SicroImageDoc;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onToggleVisibility: (id: string) => void;
}) {
  if (doc.annotations.length === 0) {
    return (
      <p style={{ fontSize: 11, color: "var(--sicro-fg-dim)", margin: 0 }}>
        Nenhuma anotação ainda. Use a barra à esquerda para inserir.
      </p>
    );
  }
  return (
    <>
      <h3 className={styles.sectionTitle}>Anotações ({doc.annotations.length})</h3>
      <ul className={styles.objectList}>
        {doc.annotations.map((a) => (
          <li
            key={a.id}
            className={`${styles.objectItem} ${selectedId === a.id ? styles.objectItemActive : ""}`}
          >
            <button
              type="button"
              className={styles.objectVisBtn}
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility(a.id);
              }}
            >
              {a.visible !== false ? <Eye size={11} /> : <EyeOff size={11} />}
            </button>
            <span className={styles.objectKind}>{a.kind}</span>
            <button
              type="button"
              className={styles.objectLabel}
              style={{
                background: "transparent",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                padding: 0,
                textAlign: "left",
              }}
              onClick={() => onSelect(a.id)}
            >
              {a.label ?? a.text ?? a.id.slice(0, 8)}
            </button>
            <button
              type="button"
              className={styles.objectVisBtn}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(a.id);
              }}
              title="Excluir"
            >
              <Trash2 size={10} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Right panel — History

function HistoryPanel({ logs }: { logs: ImageOperationLog[] }) {
  if (logs.length === 0) {
    return (
      <p style={{ fontSize: 11, color: "var(--sicro-fg-dim)", margin: 0 }}>
        Sem operações registradas ainda.
      </p>
    );
  }
  return (
    <>
      <h3 className={styles.sectionTitle}>Histórico</h3>
      {logs.map((l) => (
        <div key={l.id} className={styles.logEntry}>
          <code>{l.action}</code>
          <span style={{ color: "var(--sicro-fg-dim)", fontSize: 10 }}>
            {new Date(l.created_at).toLocaleString("pt-BR")}
          </span>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Right panel — Metadata

function MetaPanel({ doc }: { doc: SicroImageDoc }) {
  return (
    <>
      <h3 className={styles.sectionTitle}>Metadados da origem</h3>
      <dl className={styles.metaList}>
        <dt>Origem</dt>
        <dd>{doc.source.kind}</dd>
        <dt>Caminho</dt>
        <dd>{doc.source.original_relative_path}</dd>
        <dt>Mime</dt>
        <dd>{doc.source.mime_type ?? "—"}</dd>
        <dt>Dimensões</dt>
        <dd>
          {doc.source.width} × {doc.source.height}
        </dd>
        <dt>Tamanho</dt>
        <dd>{prettyBytes(doc.source.size_bytes)}</dd>
        <dt>SHA-256</dt>
        <dd>{shortHash(doc.source.original_hash_sha256, 24)}</dd>
      </dl>
      {doc.scale && (
        <>
          <h3 className={styles.sectionTitle}>Escala</h3>
          <dl className={styles.metaList}>
            <dt>px / {doc.scale.unit}</dt>
            <dd>{doc.scale.px_per_unit.toFixed(2)}</dd>
            <dt>Calibrado</dt>
            <dd>
              {doc.scale.calibration_real_distance.toFixed(2)} {doc.scale.unit}
            </dd>
          </dl>
        </>
      )}
    </>
  );
}

// Silence tree-shake warnings for icons left for future tools.
void FilePlus;
void ImageIconLucide;
void ZoomIn;
// forwardRef/useImperativeHandle preserved for future PNG export via stage ref.
void forwardRef;
void useImperativeHandle;
