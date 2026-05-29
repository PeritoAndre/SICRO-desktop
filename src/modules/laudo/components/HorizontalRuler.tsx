/**
 * HorizontalRuler — régua estilo Word desenhada em SVG.
 *
 * F7.1: handles agora DRAGÁVEIS. Quando o pai passa
 * `onLeftMarginChange` / `onRightMarginChange`, o usuário pode arrastar o
 * triângulo dourado pra alterar a margem em tempo real (mouse move +
 * mouse up commit). Sem callbacks, a régua se comporta como antes —
 * apenas indicação visual.
 */

import { useEffect, useRef, useState } from "react";
import styles from "./Ruler.module.css";

export const PX_PER_CM = 96 / 2.54;
export const RULER_THICKNESS = 22;

interface HorizontalRulerProps {
  widthCm: number;
  leftMarginCm: number;
  rightMarginCm: number;
  /** F7.1 — Drag em tempo real. cm já clamped (0..8) pelo handler. */
  onLeftMarginChange?: (cm: number) => void;
  onRightMarginChange?: (cm: number) => void;
  /** R — Recuo da primeira linha do parágrafo onde o cursor está. cm
   *  relativo à margem esquerda (positivo = recuado pra dentro). */
  firstLineIndentCm?: number;
  onFirstLineIndentChange?: (cm: number) => void;
}

export function HorizontalRuler({
  widthCm,
  leftMarginCm,
  rightMarginCm,
  onLeftMarginChange,
  onRightMarginChange,
  firstLineIndentCm = 0,
  onFirstLineIndentChange,
}: HorizontalRulerProps) {
  const widthPx = widthCm * PX_PER_CM;
  const svgRef = useRef<SVGSVGElement>(null);

  // Overlay visual durante o drag — não persistimos a cada pixel para
  // evitar disparar saves o tempo todo; só persistimos no mouseup.
  const [dragPreview, setDragPreview] = useState<{
    side: "left" | "right";
    cm: number;
  } | null>(null);
  // R — Drag state separado pro handle do recuo da primeira linha.
  const [indentDragPreview, setIndentDragPreview] = useState<number | null>(
    null,
  );

  const ticks: number[] = [];
  for (let half = 0; half <= widthCm * 2; half++) {
    ticks.push(half / 2);
  }

  // Posições (em px) — usam preview se houver drag ativo.
  const leftPx =
    dragPreview?.side === "left"
      ? dragPreview.cm * PX_PER_CM
      : leftMarginCm * PX_PER_CM;
  const rightPxFromRight =
    dragPreview?.side === "right"
      ? dragPreview.cm * PX_PER_CM
      : rightMarginCm * PX_PER_CM;
  const rightMarginPx = widthPx - rightPxFromRight;
  const usableWidthPx = Math.max(0, rightMarginPx - leftPx);

  const startDrag = (
    e: React.MouseEvent<SVGElement>,
    side: "left" | "right",
  ) => {
    if (side === "left" && !onLeftMarginChange) return;
    if (side === "right" && !onRightMarginChange) return;
    e.preventDefault();
    e.stopPropagation();

    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const widthVisualPx = rect.width;
    if (widthVisualPx <= 0) return;

    // M5 — Trabalha INTEIRAMENTE em centímetros para evitar a mistura de
    // sistemas de coordenadas. Antes o cálculo usava:
    //   - cursorXAtStart = clientX - rect.left  (px VISUAL, com zoom)
    //   - handleXAtStart = leftMarginCm * PX_PER_CM  (px INTERNO, sem zoom)
    //   - offsetPx = visual - internal  (mistura!)
    // Em zoom != 1 isso fazia o handle pular no mousedown porque
    // o offset capturava o erro de proporção (visual/internal). A correção
    // F11.4 minimizava o salto mas não eliminava a raiz. Agora normalizo
    // tudo em cm, que é unit-consistent independente de zoom.
    const cursorCm = (cursorX: number): number =>
      ((cursorX - rect.left) / widthVisualPx) * widthCm;

    const cursorCmAtStart = cursorCm(e.clientX);
    const handleCmAtStart =
      side === "left" ? leftMarginCm : widthCm - rightMarginCm;
    const offsetCm = cursorCmAtStart - handleCmAtStart;

    const compute = (clientX: number): number => {
      const newHandlePosCm = cursorCm(clientX) - offsetCm;
      if (side === "left") {
        // Distância em cm do canto esquerdo da página.
        return clamp(newHandlePosCm, 0, 8);
      } else {
        // Distância em cm do canto DIREITO da página.
        return clamp(widthCm - newHandlePosCm, 0, 8);
      }
    };

    // F11.4 — Não fazer setDragPreview no mousedown — só no mousemove.
    // Isso evita o handle "pular" instantaneamente para a posição do
    // cursor mesmo quando o user só clicou sem arrastar.
    let didMove = false;

    const onMove = (ev: MouseEvent) => {
      didMove = true;
      setDragPreview({ side, cm: compute(ev.clientX) });
    };
    const onUp = (ev: MouseEvent) => {
      // Só commita se o user realmente moveu o mouse (não foi click puro).
      if (didMove) {
        const final = compute(ev.clientX);
        if (side === "left") onLeftMarginChange?.(final);
        else onRightMarginChange?.(final);
        // M7 — NÃO limpa o dragPreview aqui. O commit acima dispara
        // uma atualização do store que eventualmente atualiza a prop
        // `leftMarginCm`/`rightMarginCm`. Entre o commit e a chegada
        // da prop nova, há um frame onde a prop ainda está com o valor
        // ANTIGO — se limpássemos dragPreview agora, o handle pintaria
        // no valor antigo nesse frame (jump visual). Em vez disso, o
        // useEffect abaixo limpa o preview quando a prop alinha.
        setDragPreview({ side, cm: final });
      } else {
        // Click puro (sem drag): limpa imediatamente.
        setDragPreview(null);
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Cursor + cleanup
  useEffect(() => {
    if (!dragPreview && indentDragPreview === null) return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = "ew-resize";
    return () => {
      document.body.style.cursor = prev;
    };
  }, [dragPreview, indentDragPreview]);

  // R — Sincroniza indentDragPreview com a prop (igual margens M7).
  useEffect(() => {
    if (indentDragPreview === null) return;
    if (Math.abs(firstLineIndentCm - indentDragPreview) < 0.005) {
      setIndentDragPreview(null);
    } else {
      setIndentDragPreview(firstLineIndentCm);
    }
  }, [firstLineIndentCm, indentDragPreview]);

  // R — Drag handler do recuo da primeira linha. Diferente das margens:
  // a posição é relativa à margem esquerda (não absoluta na régua), e
  // permite valores negativos (recuo deslocado pra esquerda, "hanging").
  const startIndentDrag = (e: React.MouseEvent<SVGElement>) => {
    if (!onFirstLineIndentChange) return;
    e.preventDefault();
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const svgRect = svg.getBoundingClientRect();
    const onMove = (ev: MouseEvent) => {
      const xPx = ev.clientX - svgRect.left;
      // Indent relativo à margem esquerda. Permite -2cm a +8cm de range.
      const indentPx = xPx - leftPx;
      const cm = clamp(indentPx / PX_PER_CM, -2, 8);
      setIndentDragPreview(cm);
      onFirstLineIndentChange(cm);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setIndentDragPreview((curr) => curr); // segura até prop alinhar (M7)
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // M7 — Sincroniza dragPreview com a prop depois do commit. Se a prop
  // recebida bater (dentro de uma tolerância pequena) com o valor do
  // preview, limpa o preview — então a renderização passa a usar a prop
  // sem flicker. Se a prop divergir (ex: hardcap fez recuar), atualiza
  // o preview pra prop primeiro, e o próximo tick limpa.
  useEffect(() => {
    if (!dragPreview) return;
    const propValue =
      dragPreview.side === "left" ? leftMarginCm : rightMarginCm;
    if (Math.abs(propValue - dragPreview.cm) < 0.005) {
      setDragPreview(null);
    } else {
      setDragPreview({ side: dragPreview.side, cm: propValue });
    }
  }, [leftMarginCm, rightMarginCm, dragPreview]);

  const draggableLeft = !!onLeftMarginChange;
  const draggableRight = !!onRightMarginChange;

  return (
    <svg
      ref={svgRef}
      role="presentation"
      className={styles.horizontal}
      width={widthPx}
      height={RULER_THICKNESS}
      viewBox={`0 0 ${widthPx} ${RULER_THICKNESS}`}
    >
      <rect
        x={0}
        y={0}
        width={widthPx}
        height={RULER_THICKNESS}
        className={styles.bg}
      />
      <rect
        x={leftPx}
        y={0}
        width={usableWidthPx}
        height={RULER_THICKNESS}
        className={styles.usable}
      />
      {ticks.map((t) => {
        const x = t * PX_PER_CM;
        const isMajor = Number.isInteger(t) && t > 0 && t % 5 === 0;
        const isInt = Number.isInteger(t);
        const tickH = isMajor ? 12 : isInt ? 8 : 4;
        return (
          <line
            key={t}
            x1={x}
            x2={x}
            y1={RULER_THICKNESS - tickH}
            y2={RULER_THICKNESS}
            className={styles.tick}
          />
        );
      })}
      {[5, 10, 15, 20].filter((n) => n <= widthCm).map((n) => (
        <text
          key={n}
          x={n * PX_PER_CM}
          y={9}
          className={styles.label}
          textAnchor="middle"
        >
          {n}
        </text>
      ))}
      {/* Left margin handle (top + bottom triangles) */}
      <MarginHandle
        x={leftPx}
        draggable={draggableLeft}
        active={dragPreview?.side === "left"}
        onMouseDown={(e) => startDrag(e, "left")}
        tooltip={
          draggableLeft
            ? `Margem esquerda: ${(leftPx / PX_PER_CM).toFixed(2)} cm — arraste para ajustar`
            : `Margem esquerda: ${leftMarginCm.toFixed(2)} cm`
        }
      />
      {/* Right margin handle */}
      <MarginHandle
        x={rightMarginPx}
        draggable={draggableRight}
        active={dragPreview?.side === "right"}
        onMouseDown={(e) => startDrag(e, "right")}
        tooltip={
          draggableRight
            ? `Margem direita: ${(rightPxFromRight / PX_PER_CM).toFixed(2)} cm — arraste para ajustar`
            : `Margem direita: ${rightMarginCm.toFixed(2)} cm`
        }
      />
      {/* R — Handle do recuo da primeira linha (triângulo SUPERIOR
       *  apontando pra baixo). Posição = margem esquerda + indent. */}
      {onFirstLineIndentChange && (() => {
        const effectiveIndent =
          indentDragPreview ?? firstLineIndentCm;
        const indentX = leftPx + effectiveIndent * PX_PER_CM;
        return (
          <IndentHandle
            x={indentX}
            active={indentDragPreview !== null}
            onMouseDown={startIndentDrag}
            tooltip={`Recuo da primeira linha: ${effectiveIndent.toFixed(2)} cm — arraste para ajustar`}
          />
        );
      })()}
      {/* Preview line while dragging */}
      {dragPreview && (
        <line
          x1={
            dragPreview.side === "left"
              ? leftPx
              : rightMarginPx
          }
          x2={
            dragPreview.side === "left"
              ? leftPx
              : rightMarginPx
          }
          y1={0}
          y2={RULER_THICKNESS}
          className={styles.dragLine}
        />
      )}
    </svg>
  );
}

function MarginHandle({
  x,
  draggable,
  active,
  onMouseDown,
  tooltip,
}: {
  x: number;
  draggable: boolean;
  active: boolean;
  onMouseDown: (e: React.MouseEvent<SVGElement>) => void;
  tooltip: string;
}) {
  const size = 6;
  const points = [
    `${x},${RULER_THICKNESS}`,
    `${x - size},${RULER_THICKNESS - size - 1}`,
    `${x + size},${RULER_THICKNESS - size - 1}`,
  ].join(" ");
  return (
    <g>
      {/* Hit area maior para drag confortável */}
      {draggable && (
        <rect
          x={x - 8}
          y={RULER_THICKNESS - 12}
          width={16}
          height={12}
          fill="transparent"
          style={{ cursor: "ew-resize" }}
          onMouseDown={onMouseDown}
        >
          <title>{tooltip}</title>
        </rect>
      )}
      <polygon
        points={points}
        className={`${styles.handle} ${active ? styles.handleActive : ""}`}
        style={draggable ? { cursor: "ew-resize" } : undefined}
        onMouseDown={draggable ? onMouseDown : undefined}
      >
        <title>{tooltip}</title>
      </polygon>
    </g>
  );
}

/**
 * R — IndentHandle: triângulo SUPERIOR (apontando pra baixo) que controla
 * o recuo da primeira linha do parágrafo onde o cursor está. Estilo Word.
 */
function IndentHandle({
  x,
  active,
  onMouseDown,
  tooltip,
}: {
  x: number;
  active: boolean;
  onMouseDown: (e: React.MouseEvent<SVGElement>) => void;
  tooltip: string;
}) {
  const size = 5;
  // Triângulo apontando pra BAIXO, no topo da régua.
  const points = [
    `${x},${size + 1}`, // ponta inferior
    `${x - size},0`, // topo esquerda
    `${x + size},0`, // topo direita
  ].join(" ");
  return (
    <g>
      {/* Hit area maior pra drag confortável */}
      <rect
        x={x - 7}
        y={0}
        width={14}
        height={size + 4}
        fill="transparent"
        style={{ cursor: "ew-resize" }}
        onMouseDown={onMouseDown}
      >
        <title>{tooltip}</title>
      </rect>
      <polygon
        points={points}
        className={`${styles.indentHandle} ${active ? styles.indentHandleActive : ""}`}
        style={{ cursor: "ew-resize" }}
        onMouseDown={onMouseDown}
      >
        <title>{tooltip}</title>
      </polygon>
    </g>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
