/**
 * Road Render Lab — interface comparativa.
 *
 * Permite ao perito:
 *   - escolher uma fixture (curva / U / X / T / rotatória / Macapá);
 *   - escolher um renderer (Konva / SVG / lado-a-lado);
 *   - ajustar zoom;
 *   - selecionar/desselecionar uma via para ver handles;
 *   - exportar PNG do resultado.
 *
 * Esta página NÃO modifica nada do app real. Acessível via URL hash
 * `#spike=road-render-lab` no `App.tsx`.
 */

import { useMemo, useRef, useState } from "react";
import { KonvaLabRenderer } from "./konva/KonvaRoadRenderer";
import { SvgLabRenderer } from "./svg/SvgRoadRenderer";
import { ParityLabRenderer } from "./parity/ParityLabRenderer";
import { FIXTURES } from "./fixtures";
import type { LabScene } from "./model";

type RendererChoice =
  | "konva"
  | "svg"
  | "parity"
  | "side_by_side"
  | "parity_vs_konva";

export function RoadRenderLabApp() {
  const [fixtureName, setFixtureName] = useState<string>(
    FIXTURES[0]?.name ?? "",
  );
  const [renderer, setRenderer] = useState<RendererChoice>("side_by_side");
  const [selectedRoadId, setSelectedRoadId] = useState<string | null>(null);
  const [zoomMul, setZoomMul] = useState<number>(1);

  const fixture =
    FIXTURES.find((f) => f.name === fixtureName) ?? FIXTURES[0];
  if (!fixture) return <div>Sem fixture disponível.</div>;

  // Aplica zoom multiplier mantendo o offset centralizado.
  const adjustedScene: LabScene = useMemo(() => {
    const baseZoom = fixture.canvas.zoom;
    return {
      ...fixture,
      canvas: {
        ...fixture.canvas,
        zoom: baseZoom * zoomMul,
      },
    };
  }, [fixture, zoomMul]);

  const konvaRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<HTMLDivElement>(null);
  const parityRef = useRef<HTMLDivElement>(null);

  const exportRendererPng = async (which: "konva" | "svg" | "parity") => {
    let container: HTMLDivElement | null = null;
    if (which === "konva") container = konvaRef.current;
    else if (which === "svg") container = svgRef.current;
    else container = parityRef.current;
    if (!container) {
      alert(`Renderer ${which} não está visível.`);
      return;
    }
    if (which === "konva" || which === "parity") {
      // Konva.Stage tem um método nativo `toDataURL()`. Mas como
      // estamos via react-konva, precisamos achar o canvas DOM.
      const canvas = container.querySelector("canvas");
      if (!canvas) {
        alert("Canvas Konva não encontrado.");
        return;
      }
      const url = canvas.toDataURL("image/png");
      downloadDataUrl(url, `${fixture.name}_${which}.png`);
    } else {
      // SVG → serializar + desenhar em canvas → toDataURL.
      const svg = container.querySelector("svg");
      if (!svg) {
        alert("SVG não encontrado.");
        return;
      }
      const w = adjustedScene.canvas.width_px;
      const h = adjustedScene.canvas.height_px;
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svg);
      const blob = new Blob([svgString], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          alert("Não foi possível criar contexto 2D.");
          return;
        }
        ctx.fillStyle = "#e5e7eb";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/png");
        URL.revokeObjectURL(url);
        downloadDataUrl(dataUrl, `${fixture.name}_svg.png`);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        alert("Falha ao carregar SVG como imagem.");
      };
      img.src = url;
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 1800, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>
            Road Render Lab — spike comparativo
          </h1>
          <p style={{ marginTop: 8, color: "#94a3b8", fontSize: 14 }}>
            Comparação visual Konva vs SVG no mesmo modelo simplificado
            (8 campos por via, paridade SICRO 1.0 Python). Nenhuma alteração
            é feita no app real.
          </p>
        </header>

        <section
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 16,
            padding: 16,
            background: "#1e293b",
            borderRadius: 8,
          }}
        >
          <div>
            <label
              style={{ display: "block", fontSize: 12, color: "#94a3b8" }}
            >
              Fixture
            </label>
            <select
              value={fixtureName}
              onChange={(e) => {
                setFixtureName(e.target.value);
                setSelectedRoadId(null);
              }}
              style={{
                background: "#0f172a",
                color: "#e2e8f0",
                border: "1px solid #334155",
                padding: "6px 10px",
                borderRadius: 4,
                fontSize: 14,
                minWidth: 280,
              }}
            >
              {FIXTURES.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              style={{ display: "block", fontSize: 12, color: "#94a3b8" }}
            >
              Renderer
            </label>
            <select
              value={renderer}
              onChange={(e) =>
                setRenderer(e.target.value as RendererChoice)
              }
              style={{
                background: "#0f172a",
                color: "#e2e8f0",
                border: "1px solid #334155",
                padding: "6px 10px",
                borderRadius: 4,
                fontSize: 14,
              }}
            >
              <option value="parity">Parity Engine REAL (sozinho)</option>
              <option value="parity_vs_konva">Parity | Konva (lado a lado)</option>
              <option value="side_by_side">Konva | SVG (lado a lado)</option>
              <option value="konva">Konva spike (sozinho)</option>
              <option value="svg">SVG spike (sozinho)</option>
            </select>
          </div>
          <div style={{ minWidth: 200 }}>
            <label
              style={{ display: "block", fontSize: 12, color: "#94a3b8" }}
            >
              Zoom × {zoomMul.toFixed(2)}
            </label>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.05}
              value={zoomMul}
              onChange={(e) => setZoomMul(parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <button
              onClick={() => exportRendererPng("parity")}
              style={btnStyle("#a78bfa")}
              disabled={
                renderer !== "parity" && renderer !== "parity_vs_konva"
              }
            >
              PNG Parity
            </button>
            <button
              onClick={() => exportRendererPng("konva")}
              style={btnStyle()}
              disabled={
                renderer !== "konva" &&
                renderer !== "side_by_side" &&
                renderer !== "parity_vs_konva"
              }
            >
              PNG Konva
            </button>
            <button
              onClick={() => exportRendererPng("svg")}
              style={btnStyle()}
              disabled={renderer !== "svg" && renderer !== "side_by_side"}
            >
              PNG SVG
            </button>
          </div>
        </section>

        <section
          style={{
            padding: 12,
            background: "#1e293b",
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 14, color: "#cbd5e1" }}>
            {fixture.name}
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>
            {fixture.description}
          </p>
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "#64748b" }}>
            {fixture.roads.length} via(s) ·{" "}
            {fixture.roundabouts.length} rotatória(s) · zoom efetivo{" "}
            {(fixture.canvas.zoom * zoomMul).toFixed(2)} px/m
          </p>
        </section>

        <section style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {(renderer === "parity" || renderer === "parity_vs_konva") && (
            <div
              style={{
                flex: 1,
                minWidth: 600,
                background: "#0b1220",
                padding: 12,
                borderRadius: 8,
              }}
            >
              <h4
                style={{
                  margin: 0,
                  marginBottom: 8,
                  fontSize: 14,
                  color: "#a78bfa",
                }}
              >
                PARITY ENGINE (production renderer)
              </h4>
              <div
                ref={parityRef}
                style={{
                  background: "#e5e7eb",
                  borderRadius: 4,
                  overflow: "hidden",
                  display: "inline-block",
                }}
              >
                <ParityLabRenderer
                  scene={adjustedScene}
                  selectedRoadId={selectedRoadId}
                  onSelectRoad={setSelectedRoadId}
                />
              </div>
            </div>
          )}

          {(renderer === "konva" ||
            renderer === "side_by_side" ||
            renderer === "parity_vs_konva") && (
            <div
              style={{
                flex: 1,
                minWidth: 600,
                background: "#0b1220",
                padding: 12,
                borderRadius: 8,
              }}
            >
              <h4
                style={{
                  margin: 0,
                  marginBottom: 8,
                  fontSize: 14,
                  color: "#fbbf24",
                }}
              >
                KONVA
              </h4>
              <div
                ref={konvaRef}
                style={{
                  background: "#e5e7eb",
                  borderRadius: 4,
                  overflow: "hidden",
                  display: "inline-block",
                }}
              >
                <KonvaLabRenderer
                  scene={adjustedScene}
                  selectedRoadId={selectedRoadId}
                  onSelectRoad={setSelectedRoadId}
                />
              </div>
            </div>
          )}

          {(renderer === "svg" || renderer === "side_by_side") && (
            <div
              style={{
                flex: 1,
                minWidth: 600,
                background: "#0b1220",
                padding: 12,
                borderRadius: 8,
              }}
            >
              <h4
                style={{
                  margin: 0,
                  marginBottom: 8,
                  fontSize: 14,
                  color: "#34d399",
                }}
              >
                SVG
              </h4>
              <div
                ref={svgRef}
                style={{
                  background: "#e5e7eb",
                  borderRadius: 4,
                  overflow: "hidden",
                  display: "inline-block",
                }}
              >
                <SvgLabRenderer
                  scene={adjustedScene}
                  selectedRoadId={selectedRoadId}
                  onSelectRoad={setSelectedRoadId}
                />
              </div>
            </div>
          )}
        </section>

        <footer
          style={{
            marginTop: 24,
            padding: 16,
            background: "#1e293b",
            borderRadius: 8,
            fontSize: 12,
            color: "#94a3b8",
          }}
        >
          <strong>Como usar:</strong> escolha uma fixture, troque entre
          Konva e SVG. Compare visualmente as curvas, marcações, junções e
          rotatórias. Use Exportar PNG para arquivar prints. Clique em uma
          via para ver os handles.
          <br />
          <strong>Modelo:</strong> 8 campos por via (ax, ay, bx, by, cx1,
          cy1, cx2, cy2, largura_m, superficie, mao_dupla, marcacao). Largura
          em <em>metros</em>; o renderer multiplica pelo zoom.
          <br />
          <strong>Clipping:</strong> ambos os renderers usam o mesmo
          algoritmo per-polilinha — emula `_em_outra` do Python sem precisar
          de junction detection topológica.
        </footer>
      </div>
    </div>
  );
}

function btnStyle(background = "#3b82f6"): React.CSSProperties {
  return {
    background,
    color: "#fff",
    border: "none",
    padding: "8px 16px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
  };
}

function downloadDataUrl(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
