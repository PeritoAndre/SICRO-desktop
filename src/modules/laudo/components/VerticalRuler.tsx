/**
 * VerticalRuler — régua vertical estilo Word com SEGMENTOS POR PÁGINA.
 *
 * F7.3 — Em vez de uma régua contínua, renderiza N segmentos
 * INDEPENDENTES (uma régua por página). Cada segmento mostra ticks
 * 0–29.7 cm e exibe "Pág N" no centro. Entre segmentos, um gap
 * transparente acompanha o gap visual entre os page cards.
 *
 * Handles dragáveis:
 *   - TOP: triângulo no primeiro segmento, em y = topMarginCm.
 *   - BOTTOM: triângulo no último segmento, em y = pageHeightCm - bottomMarginCm.
 *
 * O cálculo do drag usa proporção `(yPx - segmentTop) / segmentHeight * pageHeightCm`,
 * independente de zoom.
 */

import { useEffect, useRef, useState } from "react";
import styles from "./Ruler.module.css";
import { PX_PER_CM, RULER_THICKNESS } from "./HorizontalRuler";

interface VerticalRulerProps {
  pageHeightCm: number;
  pageCount: number;
  pageGapCm: number;
  topMarginCm: number;
  bottomMarginCm: number;
  onTopMarginChange?: (cm: number) => void;
  onBottomMarginChange?: (cm: number) => void;
}

export function VerticalRuler({
  pageHeightCm,
  pageCount,
  pageGapCm,
  topMarginCm,
  bottomMarginCm,
  onTopMarginChange,
  onBottomMarginChange,
}: VerticalRulerProps) {
  // F7.4 — Mantemos a régua em UNITS CM (consistente com o pageStack)
  // para garantir alinhamento perfeito. O SVG interno usa viewBox em px
  // (necessário pra renderizar marks/handles em coords precisas), mas o
  // container outer é dimensionado em cm exatamente como os page cards.
  // M7 — pageHeightPx/pageGapPx removidos depois da refatoração do
  // startDrag pra cm puro. As medidas em px só são usadas dentro do
  // PageRulerSegment (recalculadas lá via PX_PER_CM).
  const totalHeightCm = pageCount * pageHeightCm + (pageCount - 1) * pageGapCm;

  const containerRef = useRef<HTMLDivElement>(null);
  const [dragPreview, setDragPreview] = useState<{
    side: "top" | "bottom";
    pageIndex: number;
    cm: number;
  } | null>(null);

  // Top y (in stack) onde cada segmento começa, EM CM (consistente com
  // o pageStack que posiciona os pageCards em cm).
  const segmentTopsCm: number[] = [];
  for (let i = 0; i < pageCount; i++) {
    segmentTopsCm.push(i * (pageHeightCm + pageGapCm));
  }

  const topMarginEffectiveCm =
    dragPreview?.side === "top" ? dragPreview.cm : topMarginCm;
  const bottomMarginEffectiveCm =
    dragPreview?.side === "bottom" ? dragPreview.cm : bottomMarginCm;

  const startDrag = (
    e: React.MouseEvent<SVGElement>,
    side: "top" | "bottom",
    pageIndex: number,
  ) => {
    if (side === "top" && !onTopMarginChange) return;
    if (side === "bottom" && !onBottomMarginChange) return;
    e.preventDefault();
    e.stopPropagation();

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const totalVisualPx = rect.height;
    if (totalVisualPx <= 0) return;

    // M7 — Trabalha em CM puro (mesmo padrão do HorizontalRuler pós-fix).
    // O cálculo anterior misturava visual-px (cursor) com internal-px
    // (handle position) escalando manualmente entre os dois. Em zoom != 1
    // ou com pequenos erros de floating-point isso fazia o handle dar
    // micro-saltos. Normalizando tudo em cm o cálculo fica unit-consistent
    // independente de zoom.
    const cursorCm = (cursorY: number): number =>
      ((cursorY - rect.top) / totalVisualPx) *
      (pageCount * pageHeightCm + (pageCount - 1) * pageGapCm);

    const pageTopInStackCm = pageIndex * (pageHeightCm + pageGapCm);
    const handleCmInStack =
      side === "top"
        ? pageTopInStackCm + topMarginCm
        : pageTopInStackCm + pageHeightCm - bottomMarginCm;

    const cursorCmAtStart = cursorCm(e.clientY);
    const offsetCm = cursorCmAtStart - handleCmInStack;

    const compute = (clientY: number): number => {
      const newHandleCmInStack = cursorCm(clientY) - offsetCm;
      if (side === "top") {
        const cm = newHandleCmInStack - pageTopInStackCm;
        return clamp(cm, 0, 8);
      } else {
        const cm = pageTopInStackCm + pageHeightCm - newHandleCmInStack;
        return clamp(cm, 0, 8);
      }
    };

    // F11.4 — Não setar dragPreview no mousedown. Só commit no mouseup
    // se o user realmente moveu o mouse (didMove = true).
    let didMove = false;

    const onMove = (ev: MouseEvent) => {
      didMove = true;
      setDragPreview({ side, pageIndex, cm: compute(ev.clientY) });
    };
    const onUp = (ev: MouseEvent) => {
      if (didMove) {
        const final = compute(ev.clientY);
        if (side === "top") onTopMarginChange?.(final);
        else onBottomMarginChange?.(final);
        // M7 — mantém dragPreview no valor final até a prop alinhar
        // (mesma estratégia do HorizontalRuler para evitar flicker
        // entre o commit e a atualização da prop via store).
        setDragPreview({ side, pageIndex, cm: final });
      } else {
        setDragPreview(null);
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    if (!dragPreview) return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = "ns-resize";
    return () => {
      document.body.style.cursor = prev;
    };
  }, [dragPreview]);

  // M7 — Sincroniza dragPreview com a prop depois do commit. Quando a
  // prop bater (dentro da tolerância), limpa o preview. Quando divergir
  // (ex: hardcap recuou), atualiza preview pra prop primeiro.
  useEffect(() => {
    if (!dragPreview) return;
    const propValue =
      dragPreview.side === "top" ? topMarginCm : bottomMarginCm;
    if (Math.abs(propValue - dragPreview.cm) < 0.005) {
      setDragPreview(null);
    } else {
      setDragPreview({
        side: dragPreview.side,
        pageIndex: dragPreview.pageIndex,
        cm: propValue,
      });
    }
  }, [topMarginCm, bottomMarginCm, dragPreview]);

  const draggableTop = !!onTopMarginChange;
  const draggableBottom = !!onBottomMarginChange;

  return (
    <div
      ref={containerRef}
      className={styles.verticalContainer}
      style={{
        width: `${RULER_THICKNESS}px`,
        // F7.4 — Altura em CM (mesmo unit do pageStack) garante alinhamento
        // pixel-perfect com os page cards. Antes usávamos px calculado via
        // PX_PER_CM, que somava arredondamento sub-pixel.
        height: `${totalHeightCm}cm`,
        flexShrink: 0,
      }}
    >
      {/* Segmento por página — handles TOP e BOTTOM em CADA página */}
      {segmentTopsCm.map((segTopCm, i) => (
        <PageRulerSegment
          key={i}
          topCm={segTopCm}
          pageHeightCm={pageHeightCm}
          pageIndex={i + 1}
          pageIndex0={i}
          showTopHandle={draggableTop}
          topHandleYInSegmentPx={topMarginEffectiveCm * PX_PER_CM}
          showBottomHandle={draggableBottom}
          bottomHandleYInSegmentPx={
            (pageHeightCm - bottomMarginEffectiveCm) * PX_PER_CM
          }
          onStartDrag={startDrag}
          topActive={
            dragPreview?.side === "top" && dragPreview.pageIndex === i
          }
          bottomActive={
            dragPreview?.side === "bottom" && dragPreview.pageIndex === i
          }
        />
      ))}
    </div>
  );
}

interface PageRulerSegmentProps {
  topCm: number;
  pageHeightCm: number;
  pageIndex: number;
  pageIndex0: number;
  showTopHandle: boolean;
  topHandleYInSegmentPx: number;
  showBottomHandle: boolean;
  bottomHandleYInSegmentPx: number;
  onStartDrag: (
    e: React.MouseEvent<SVGElement>,
    side: "top" | "bottom",
    pageIndex: number,
  ) => void;
  topActive: boolean;
  bottomActive: boolean;
}

function PageRulerSegment({
  topCm,
  pageHeightCm,
  pageIndex,
  pageIndex0,
  showTopHandle,
  topHandleYInSegmentPx,
  showBottomHandle,
  bottomHandleYInSegmentPx,
  onStartDrag,
  topActive,
  bottomActive,
}: PageRulerSegmentProps) {
  const heightPx = pageHeightCm * PX_PER_CM;
  const ticks: number[] = [];
  for (let half = 0; half <= pageHeightCm * 2; half++) {
    ticks.push(half / 2);
  }
  const stops: number[] = [];
  for (let n = 5; n <= pageHeightCm; n += 5) stops.push(n);

  // Posições do triângulo "área útil" — entre topMargin e (pH - bottomMargin)
  const usableTopPx = topHandleYInSegmentPx;
  const usableBottomPx = bottomHandleYInSegmentPx;

  // F7.4 — width/height do container em CM; SVG viewBox em px (escalado
  // automaticamente pelo browser). Garante alinhamento pixel-perfect com
  // os page cards que também usam cm.
  return (
    <svg
      className={styles.segment}
      style={{
        position: "absolute",
        left: 0,
        top: `${topCm}cm`,
        width: `${RULER_THICKNESS}px`,
        height: `${pageHeightCm}cm`,
      }}
      preserveAspectRatio="none"
      viewBox={`0 0 ${RULER_THICKNESS} ${heightPx}`}
    >
      <rect
        x={0}
        y={0}
        width={RULER_THICKNESS}
        height={heightPx}
        className={styles.bg}
      />
      <rect
        x={0}
        y={usableTopPx}
        width={RULER_THICKNESS}
        height={Math.max(0, usableBottomPx - usableTopPx)}
        className={styles.usable}
      />
      {ticks.map((t) => {
        const y = t * PX_PER_CM;
        const isMajor = Number.isInteger(t) && t > 0 && t % 5 === 0;
        const isInt = Number.isInteger(t);
        const tickW = isMajor ? 12 : isInt ? 8 : 4;
        return (
          <line
            key={t}
            x1={RULER_THICKNESS - tickW}
            x2={RULER_THICKNESS}
            y1={y}
            y2={y}
            className={styles.tick}
          />
        );
      })}
      {stops.map((n) => (
        <text
          key={n}
          x={9}
          y={n * PX_PER_CM}
          className={styles.label}
          textAnchor="middle"
          transform={`rotate(-90 9 ${n * PX_PER_CM})`}
        >
          {n}
        </text>
      ))}
      {/* Page label no centro do segmento */}
      <text
        x={RULER_THICKNESS / 2}
        y={heightPx / 2}
        className={styles.pageLabel}
        transform={`rotate(-90 ${RULER_THICKNESS / 2} ${heightPx / 2})`}
      >
        Pág {pageIndex}
      </text>
      {/* Top handle — em cada página (marca margem TOP global) */}
      {showTopHandle && (
        <MarginHandle
          y={topHandleYInSegmentPx}
          active={topActive}
          onMouseDown={(e) => onStartDrag(e, "top", pageIndex0)}
          tooltip={`Margem superior (pg ${pageIndex}): ${(topHandleYInSegmentPx / PX_PER_CM).toFixed(2)} cm — arraste`}
        />
      )}
      {/* Bottom handle — em cada página (marca margem BOTTOM global) */}
      {showBottomHandle && (
        <MarginHandle
          y={bottomHandleYInSegmentPx}
          active={bottomActive}
          onMouseDown={(e) => onStartDrag(e, "bottom", pageIndex0)}
          tooltip={`Margem inferior (pg ${pageIndex}): ${(pageHeightCm - bottomHandleYInSegmentPx / PX_PER_CM).toFixed(2)} cm — arraste`}
        />
      )}
    </svg>
  );
}

function MarginHandle({
  y,
  active,
  onMouseDown,
  tooltip,
}: {
  y: number;
  active: boolean;
  onMouseDown: (e: React.MouseEvent<SVGElement>) => void;
  tooltip: string;
}) {
  const size = 6;
  const points = [
    `${RULER_THICKNESS},${y}`,
    `${RULER_THICKNESS - size - 1},${y - size}`,
    `${RULER_THICKNESS - size - 1},${y + size}`,
  ].join(" ");
  return (
    <g>
      <rect
        x={RULER_THICKNESS - 12}
        y={y - 8}
        width={12}
        height={16}
        fill="transparent"
        style={{ cursor: "ns-resize" }}
        onMouseDown={onMouseDown}
      >
        <title>{tooltip}</title>
      </rect>
      <polygon
        points={points}
        className={`${styles.handle} ${active ? styles.handleActive : ""}`}
        style={{ cursor: "ns-resize" }}
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
