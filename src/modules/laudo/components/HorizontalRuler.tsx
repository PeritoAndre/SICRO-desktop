/**
 * HorizontalRuler — régua estilo Word desenhada em SVG.
 *
 * Mostra escala em centímetros (ticks a cada 0,5 cm, marcas grandes a cada
 * 5 cm com numeração) e dois marcadores triangulares dourados nas posições
 * das margens esquerda e direita.
 *
 * Não há drag — esta versão é apenas indicação visual. Edição de margens
 * vive na aba "Página" do Inspector.
 */

import styles from "./Ruler.module.css";

export const PX_PER_CM = 96 / 2.54;
export const RULER_THICKNESS = 22;

interface HorizontalRulerProps {
  widthCm: number;
  leftMarginCm: number;
  rightMarginCm: number;
}

export function HorizontalRuler({
  widthCm,
  leftMarginCm,
  rightMarginCm,
}: HorizontalRulerProps) {
  const widthPx = widthCm * PX_PER_CM;
  const ticks: number[] = [];
  // Tick at every 0.5 cm.
  for (let half = 0; half <= widthCm * 2; half++) {
    ticks.push(half / 2);
  }
  const leftMarginPx = leftMarginCm * PX_PER_CM;
  const rightMarginPx = (widthCm - rightMarginCm) * PX_PER_CM;
  const usableWidthPx = Math.max(0, rightMarginPx - leftMarginPx);

  return (
    <svg
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
        x={leftMarginPx}
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
      {/* Left margin handle */}
      <MarginHandle x={leftMarginPx} />
      {/* Right margin handle */}
      <MarginHandle x={rightMarginPx} />
    </svg>
  );
}

function MarginHandle({ x }: { x: number }) {
  const size = 6;
  // Downward-pointing triangle whose tip sits exactly on the margin line.
  const points = [
    `${x},${RULER_THICKNESS}`,
    `${x - size},${RULER_THICKNESS - size - 1}`,
    `${x + size},${RULER_THICKNESS - size - 1}`,
  ].join(" ");
  return <polygon points={points} className={styles.handle} />;
}
