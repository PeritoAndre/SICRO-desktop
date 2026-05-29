/**
 * Magnifier — lente flutuante 8x sobre o canvas.
 *
 * G12.17 — Pequena janela circular que segue o mouse mostrando um
 * crop ampliado do canvas + crosshair central. Toggleable pelo
 * editor; usa `pointer-events: none` para não interferir nos clicks.
 */

import { useEffect, useRef } from "react";

interface Props {
  /** HTMLImageElement carregada (mesma que o Konva usa). */
  htmlImage: HTMLImageElement | null;
  /** Posição do mouse em coords da imagem original (px). */
  imagePointer: { x: number; y: number } | null;
  /** Posição do mouse em coords da tela (px), para posicionar a lente. */
  screenPointer: { x: number; y: number } | null;
  /** Zoom da lente. Default 8x. */
  zoom?: number;
  /** Diâmetro da lente em px. Default 140. */
  size?: number;
  /** Off-set da lente em relação ao mouse para evitar oclusão. */
  offset?: { x: number; y: number };
}

export function Magnifier({
  htmlImage,
  imagePointer,
  screenPointer,
  zoom = 8,
  size = 140,
  offset = { x: 24, y: 24 },
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !htmlImage || !imagePointer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = size;
    canvas.height = size;
    ctx.imageSmoothingEnabled = false;

    const cropSize = size / zoom; // em pixels da imagem original
    const sx = imagePointer.x - cropSize / 2;
    const sy = imagePointer.y - cropSize / 2;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    try {
      ctx.drawImage(htmlImage, sx, sy, cropSize, cropSize, 0, 0, size, size);
    } catch {
      /* defensive */
    }

    // Crosshair central + círculo de borda.
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();
  }, [htmlImage, imagePointer, size, zoom]);

  if (!screenPointer || !imagePointer) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: screenPointer.x + offset.x,
        top: screenPointer.y + offset.y,
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        border: "2px solid rgba(255,255,255,0.7)",
        boxShadow: "0 6px 22px rgba(0,0,0,0.55)",
        pointerEvents: "none",
        zIndex: 9999,
      }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} style={{ display: "block", width: size, height: size }} />
    </div>
  );
}
