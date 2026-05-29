/**
 * GridOverlay — grid e/ou rulers sobre o canvas.
 *
 * G12.18 — Renderizado como overlay SVG absoluto que cobre o canvas
 * inteiro. Toggleable. Quando há escala calibrada, mostra unidade
 * real; senão, pixels.
 *
 * Performance: pre-computa as linhas necessárias. Para imagens
 * gigapixel + grid muito fino seria pesado — mas mantemos
 * `spacing_px` mínimo de 8 (acima disso fica visualmente útil).
 */

import { useMemo } from "react";
import type { SicroImageScale } from "../engine/schema";

interface Props {
  /** Dimensões da imagem original (px). */
  imageWidth: number;
  imageHeight: number;
  /** Transform aplicado pelo Konva: scale + translate (x, y). */
  viewport: { scale: number; x: number; y: number };
  /** Espaçamento entre linhas em px da imagem. */
  spacingPx?: number;
  /** Escala calibrada (px → unidade real), opcional. */
  scale?: SicroImageScale | null;
  /** Renderiza grid full-field. */
  showGrid?: boolean;
  /** Renderiza só rulers nas bordas. */
  showRulers?: boolean;
  /** Cor das linhas leves. */
  color?: string;
}

export function GridOverlay({
  imageWidth,
  imageHeight,
  viewport,
  spacingPx = 50,
  scale = null,
  showGrid = true,
  showRulers = true,
  color = "rgba(90, 169, 230, 0.18)",
}: Props) {
  const lines = useMemo(() => {
    const s = Math.max(8, spacingPx);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = 0; x <= imageWidth; x += s) xs.push(x);
    for (let y = 0; y <= imageHeight; y += s) ys.push(y);
    return { xs, ys, spacing: s };
  }, [imageWidth, imageHeight, spacingPx]);

  const toScreenX = (px: number) => viewport.x + px * viewport.scale;
  const toScreenY = (py: number) => viewport.y + py * viewport.scale;

  const formatTick = (px: number): string => {
    if (scale && scale.px_per_unit > 0) {
      const v = px / scale.px_per_unit;
      return `${v.toFixed(2)}${scale.unit}`;
    }
    return `${px}`;
  };

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      {showGrid && (
        <g>
          {lines.xs.map((x) => (
            <line
              key={`gx${x}`}
              x1={toScreenX(x)}
              y1={toScreenY(0)}
              x2={toScreenX(x)}
              y2={toScreenY(imageHeight)}
              stroke={color}
              strokeWidth={x % (lines.spacing * 5) === 0 ? 1 : 0.5}
            />
          ))}
          {lines.ys.map((y) => (
            <line
              key={`gy${y}`}
              x1={toScreenX(0)}
              y1={toScreenY(y)}
              x2={toScreenX(imageWidth)}
              y2={toScreenY(y)}
              stroke={color}
              strokeWidth={y % (lines.spacing * 5) === 0 ? 1 : 0.5}
            />
          ))}
        </g>
      )}
      {showRulers && (
        <g>
          {/* Top ruler */}
          {lines.xs.map(
            (x) =>
              x % (lines.spacing * 2) === 0 && (
                <text
                  key={`rx${x}`}
                  x={toScreenX(x)}
                  y={Math.max(toScreenY(0) - 4, 10)}
                  fontSize="9"
                  fill="rgba(90, 169, 230, 0.85)"
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                >
                  {formatTick(x)}
                </text>
              ),
          )}
          {/* Left ruler */}
          {lines.ys.map(
            (y) =>
              y % (lines.spacing * 2) === 0 && (
                <text
                  key={`ry${y}`}
                  x={Math.max(toScreenX(0) - 6, 4)}
                  y={toScreenY(y) + 3}
                  fontSize="9"
                  fill="rgba(90, 169, 230, 0.85)"
                  textAnchor="end"
                  fontFamily="var(--font-mono)"
                >
                  {formatTick(y)}
                </text>
              ),
          )}
        </g>
      )}
    </svg>
  );
}
