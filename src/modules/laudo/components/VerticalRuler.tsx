/**
 * VerticalRuler — régua estilo Word lateral, desenhada em SVG.
 *
 * Mostra escala em centímetros (igual à horizontal), marcadores triangulares
 * nas margens superior e inferior, e — por causa da paginação visual soft —
 * uma marca tracejada com label "Página N" a cada 29,7 cm.
 *
 * Quanto à altura total: a régua acompanha a altura da tira branca contínua
 * (igual a `pageCount * 29.7 cm`).
 */

import styles from "./Ruler.module.css";
import { PX_PER_CM, RULER_THICKNESS } from "./HorizontalRuler";

interface VerticalRulerProps {
  /** Total visual height in cm (usually pageCount * 29.7). */
  heightCm: number;
  /** Top margin of the FIRST page in cm. */
  topMarginCm: number;
  /** Bottom margin of the LAST page in cm. */
  bottomMarginCm: number;
  /** Height of a single virtual page (A4 = 29.7 cm). */
  pageHeightCm: number;
  /** How many virtual pages the editor is currently showing. */
  pageCount: number;
}

export function VerticalRuler({
  heightCm,
  topMarginCm,
  bottomMarginCm,
  pageHeightCm,
  pageCount,
}: VerticalRulerProps) {
  const heightPx = heightCm * PX_PER_CM;
  const ticks: number[] = [];
  for (let half = 0; half <= heightCm * 2; half++) {
    ticks.push(half / 2);
  }

  const topMarginPx = topMarginCm * PX_PER_CM;
  const bottomMarginPx = (heightCm - bottomMarginCm) * PX_PER_CM;

  return (
    <svg
      role="presentation"
      className={styles.vertical}
      width={RULER_THICKNESS}
      height={heightPx}
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
        y={topMarginPx}
        width={RULER_THICKNESS}
        height={Math.max(0, bottomMarginPx - topMarginPx)}
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
      {/* Numbers at 5, 10, 15, 20, 25, 30, ... up to heightCm */}
      {numberStops(heightCm).map((n) => (
        <text
          key={n}
          x={9}
          y={n * PX_PER_CM}
          className={styles.label}
          textAnchor="middle"
          /* Rotate around the anchor so the digits are easier to read. */
          transform={`rotate(-90 9 ${n * PX_PER_CM})`}
        >
          {n}
        </text>
      ))}
      {/* Margin handles (left-pointing triangle so tip points at the page). */}
      <MarginHandle y={topMarginPx} />
      <MarginHandle y={bottomMarginPx} />

      {/* Page markers and labels. */}
      {Array.from({ length: pageCount }).map((_, i) => {
        const yTop = i * pageHeightCm * PX_PER_CM;
        const yMid = yTop + (pageHeightCm * PX_PER_CM) / 2;
        return (
          <g key={i}>
            {i > 0 && (
              <line
                x1={0}
                x2={RULER_THICKNESS}
                y1={yTop}
                y2={yTop}
                className={styles.pageMark}
              />
            )}
            <text
              x={RULER_THICKNESS / 2}
              y={yMid}
              className={styles.pageLabel}
              transform={`rotate(-90 ${RULER_THICKNESS / 2} ${yMid})`}
            >
              Pág {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function MarginHandle({ y }: { y: number }) {
  const size = 6;
  // Right-pointing triangle whose tip lands on the margin line, on the
  // editor side of the ruler.
  const points = [
    `${RULER_THICKNESS},${y}`,
    `${RULER_THICKNESS - size - 1},${y - size}`,
    `${RULER_THICKNESS - size - 1},${y + size}`,
  ].join(" ");
  return <polygon points={points} className={styles.handle} />;
}

function numberStops(heightCm: number): number[] {
  const out: number[] = [];
  for (let n = 5; n <= heightCm; n += 5) out.push(n);
  return out;
}
