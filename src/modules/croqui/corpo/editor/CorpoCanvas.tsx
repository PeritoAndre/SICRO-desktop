/**
 * CorpoCanvas — palco Konva do croqui corporal.
 *
 * Renderiza a prancha de corpo (SVG → imagem de fundo) + os marcadores de lesão
 * numerados e tipados por cima. Zoom (scroll), pan (arrastar o palco) e:
 *   - ferramenta de lesão ativa + clique no vazio → coloca marcador (onPlace);
 *   - clique num marcador → seleciona (onSelect);
 *   - arrastar um marcador → move (onMove).
 *
 * Padrão herdado do croqui viário (CanvasStage) e do marcador numerado do
 * módulo Imagem (Group: círculo + número branco).
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
  Circle,
  Group,
  Image as KonvaImage,
  Layer,
  Stage,
  Text as KonvaText,
} from "react-konva";
import type Konva from "konva";
import {
  BODY_TEMPLATES,
  bodyTemplateDataUri,
  lesaoMeta,
  type LesaoTipo,
  type SicroCorpoDoc,
} from "../engine";

export interface CorpoCanvasHandle {
  /** PNG data URL da prancha + marcadores (sem chrome). */
  toPng(pixelRatio?: number): string | null;
}

export type CorpoTool = LesaoTipo | "select";

interface Props {
  doc: SicroCorpoDoc;
  tool: CorpoTool;
  selectedId: string | null;
  containerWidth: number;
  containerHeight: number;
  onPlace: (x: number, y: number) => void;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
}

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 8;
const PADDING = 0.88; // sobra ao redor da prancha no fit inicial

export const CorpoCanvas = forwardRef<CorpoCanvasHandle, Props>(
  function CorpoCanvas(
    { doc, tool, selectedId, containerWidth, containerHeight, onPlace, onSelect, onMove },
    ref,
  ) {
    const stageRef = useRef<Konva.Stage | null>(null);
    const tpl = BODY_TEMPLATES[doc.template_id];

    // Imagem da prancha (SVG → HTMLImageElement), recarrega ao trocar de prancha.
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    useEffect(() => {
      let alive = true;
      const im = new Image();
      im.onload = () => {
        if (alive) setImg(im);
      };
      im.src = bodyTemplateDataUri(doc.template_id);
      setImg(null);
      return () => {
        alive = false;
      };
    }, [doc.template_id]);

    // Fit inicial (centraliza a prancha na viewport). Recalcula quando a
    // viewport ou a prancha mudam de tamanho.
    const fit = useMemo(() => {
      if (containerWidth <= 0 || containerHeight <= 0) {
        return { scale: 1, x: 0, y: 0 };
      }
      const s =
        Math.min(containerWidth / tpl.width, containerHeight / tpl.height) *
        PADDING;
      return {
        scale: s,
        x: (containerWidth - tpl.width * s) / 2,
        y: (containerHeight - tpl.height * s) / 2,
      };
    }, [containerWidth, containerHeight, tpl.width, tpl.height]);

    const [view, setView] = useState(fit);
    // Re-fit quando a prancha troca ou a viewport muda significativamente.
    useEffect(() => {
      setView(fit);
    }, [fit]);

    useImperativeHandle(ref, () => ({
      toPng(pixelRatio = 2) {
        const stage = stageRef.current;
        if (!stage) return null;
        try {
          return stage.toDataURL({ pixelRatio });
        } catch {
          return null;
        }
      },
    }));

    const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const oldScale = view.scale;
      const factor = e.evt.deltaY > 0 ? 0.9 : 1.1;
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldScale * factor));
      const worldX = (pointer.x - view.x) / oldScale;
      const worldY = (pointer.y - view.y) / oldScale;
      setView({
        scale: next,
        x: pointer.x - worldX * next,
        y: pointer.y - worldY * next,
      });
    };

    const isLesionTool = tool !== "select";

    const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Clique no fundo (palco/imagem), não num marcador.
      const targetName = e.target.name?.() ?? "";
      const clickedEmpty =
        e.target === e.target.getStage() || targetName === "bg" || targetName === "";
      if (!clickedEmpty) return;
      if (isLesionTool) {
        const stage = stageRef.current;
        const pos = stage?.getRelativePointerPosition();
        if (pos) onPlace(pos.x, pos.y);
      } else {
        onSelect(null);
      }
    };

    return (
      <Stage
        ref={stageRef}
        width={Math.max(1, containerWidth)}
        height={Math.max(1, containerHeight)}
        scaleX={view.scale}
        scaleY={view.scale}
        x={view.x}
        y={view.y}
        draggable={tool === "select"}
        onWheel={onWheel}
        onMouseDown={onStageMouseDown}
        onDragEnd={(e) => {
          // Só o palco (pan) atualiza a view; drag de marcador é tratado nele.
          if (e.target === e.target.getStage()) {
            setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
          }
        }}
        style={{ background: "#ffffff", cursor: isLesionTool ? "crosshair" : "default" }}
      >
        <Layer listening={false}>
          {img && (
            <KonvaImage
              image={img}
              width={tpl.width}
              height={tpl.height}
              name="bg"
            />
          )}
        </Layer>
        <Layer>
          {doc.markers.map((m) => {
            const meta = lesaoMeta(m.tipo);
            const color = m.color || meta.color;
            const r = m.size ?? 12;
            const selected = m.id === selectedId;
            return (
              <Group
                key={m.id}
                x={m.x}
                y={m.y}
                draggable={tool === "select"}
                onMouseDown={(e) => {
                  e.cancelBubble = true;
                  onSelect(m.id);
                }}
                onDragEnd={(e) => {
                  onMove(m.id, e.target.x(), e.target.y());
                }}
              >
                {selected && (
                  <Circle
                    radius={r + 4}
                    stroke="#0f172a"
                    strokeWidth={2}
                    dash={[4, 3]}
                  />
                )}
                <Circle
                  radius={r}
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth={2}
                  shadowColor="#000000"
                  shadowBlur={2}
                  shadowOpacity={0.4}
                />
                <KonvaText
                  text={String(m.number)}
                  fontSize={r * 1.1}
                  fontStyle="bold"
                  fill="#ffffff"
                  width={r * 2}
                  height={r * 2}
                  offsetX={r}
                  offsetY={r}
                  align="center"
                  verticalAlign="middle"
                  listening={false}
                />
              </Group>
            );
          })}
        </Layer>
      </Stage>
    );
  },
);
