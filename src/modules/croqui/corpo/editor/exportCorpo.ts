/**
 * stampCorpoPng — compõe o PNG técnico do croqui corporal: cabeçalho + a
 * prancha com os marcadores + a TABELA DE LEGENDA numerada, tudo numa imagem
 * (que entra no laudo como uma figura, igual ao croqui de via). Espelha o
 * estilo de `stampPng` do CroquiEditor (bandas azul/cinza).
 *
 * §13: rodapé deixa explícito que é documento técnico sujeito a revisão e que
 * a prancha é um esquema ilustrativo (não escala métrica).
 */

import type { LegendRow } from "../engine";

export interface CorpoStampMeta {
  title: string;
  occurrence: {
    numero_bo?: string | null;
    tipo_pericia?: string | null;
    municipio?: string | null;
  } | null;
  templateLabel: string;
  timestamp: Date;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(
    d.getHours(),
  )}:${p(d.getMinutes())}`;
}

const HEADER_H = 64;
const FOOTER_H = 30;
const PAD = 20;
const ROW_H = 26;
const LEGEND_HEADER_H = 30;
const MIN_W = 760;

/**
 * @param bodyPng data URL da prancha (CorpoCanvas.toPng)
 * @param legend  linhas já numeradas/ordenadas (buildLegend)
 */
export async function stampCorpoPng(
  bodyPng: string,
  legend: LegendRow[],
  meta: CorpoStampMeta,
): Promise<string> {
  const body = await loadImage(bodyPng);

  const legendBlockH =
    legend.length > 0 ? LEGEND_HEADER_H + legend.length * ROW_H + PAD : 0;
  const contentW = Math.max(MIN_W, body.width + PAD * 2);
  const canvasW = contentW;
  const canvasH = HEADER_H + body.height + PAD + legendBlockH + FOOTER_H;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d indisponível");

  // Fundo
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Cabeçalho
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvasW, HEADER_H);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 17px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(meta.title, PAD, HEADER_H / 2 - 8);
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#cbd5e1";
  const sub: string[] = [`Carta de lesões — ${meta.templateLabel}`];
  if (meta.occurrence?.numero_bo) sub.push(`BO ${meta.occurrence.numero_bo}`);
  if (meta.occurrence?.municipio) sub.push(meta.occurrence.municipio);
  ctx.fillText(sub.join(" · "), PAD, HEADER_H / 2 + 12);
  ctx.textAlign = "right";
  ctx.fillText(`Exportado em ${fmtDate(meta.timestamp)}`, canvasW - PAD, HEADER_H / 2);

  // Prancha (centralizada horizontalmente)
  const bodyX = (canvasW - body.width) / 2;
  ctx.drawImage(body, bodyX, HEADER_H);

  // Legenda
  let y = HEADER_H + body.height + PAD;
  if (legend.length > 0) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 13px Inter, system-ui, sans-serif";
    ctx.fillText("Legenda das lesões / achados", PAD, y + 6);
    y += LEGEND_HEADER_H;

    for (const row of legend) {
      // Badge numerado colorido
      const cx = PAD + 11;
      const cy = y + ROW_H / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.fillStyle = row.color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(row.number), cx, cy);

      // Texto da linha
      ctx.textAlign = "left";
      ctx.fillStyle = "#0f172a";
      ctx.font = "12px Inter, system-ui, sans-serif";
      const parts = [row.tipo];
      if (row.regiao) parts.push(row.regiao);
      if (row.instrumento) parts.push(row.instrumento);
      if (row.dimensoes) parts.push(row.dimensoes);
      let line = parts.join(" — ");
      if (row.observacao) line += ` (${row.observacao})`;
      // Trunca p/ caber na largura
      const maxW = canvasW - (PAD + 28) - PAD;
      while (ctx.measureText(line).width > maxW && line.length > 4) {
        line = line.slice(0, -2);
      }
      ctx.fillText(line, PAD + 28, cy);

      // separador
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, y + ROW_H);
      ctx.lineTo(canvasW - PAD, y + ROW_H);
      ctx.stroke();
      y += ROW_H;
    }
    y += PAD;
  }

  // Rodapé
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(0, canvasH - FOOTER_H, canvasW, FOOTER_H);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(
    "SICRO Desktop — Croqui corporal · esquema ilustrativo (não escala métrica) · documento técnico sujeito a revisão pelo perito.",
    PAD,
    canvasH - FOOTER_H / 2,
  );

  return canvas.toDataURL("image/png");
}
