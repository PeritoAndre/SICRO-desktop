/**
 * CorpoEditor — orquestra o croqui corporal (carta de lesões): toolbar
 * (pranchas + tipos de lesão), CorpoCanvas, inspector do marcador selecionado e
 * a legenda numerada ao vivo. Gerencia o próprio `.sicrocorpo` via commands
 * (read/save) + coerceCorpoDoc — o croquiStore só guarda a linha/lista.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Save, ImageDown, MousePointer2, Trash2 } from "lucide-react";
import {
  selectActiveOccurrence,
  selectActiveWorkspacePath,
  useWorkspaceStore,
} from "@stores/workspaceStore";
import { commands } from "@core/commands";
import { toSicroError } from "@core/errors";
import { useCroquiStore } from "../../store/croquiStore";
import {
  BODY_TEMPLATES,
  BODY_VIEW_ORDER,
  LESAO_TIPOS,
  LATERALIDADE_LABEL,
  REGIOES,
  buildLegend,
  coerceCorpoDoc,
  lesaoMeta,
  makeLesao,
  nextMarkerNumber,
  summarizeLesoes,
  type BodyView,
  type Lateralidade,
  type LesaoTipo,
  type SicroCorpoDoc,
  type SicroLesaoMarker,
} from "../engine";
import { CorpoCanvas, type CorpoCanvasHandle, type CorpoTool } from "./CorpoCanvas";
import { stampCorpoPng } from "./exportCorpo";

export function CorpoEditor() {
  const workspacePath = useWorkspaceStore(selectActiveWorkspacePath);
  const occurrence = useWorkspaceStore(selectActiveOccurrence);
  const activeCroqui = useCroquiStore((s) => s.activeCroqui);
  const clearCurrent = useCroquiStore((s) => s.clearCurrent);
  const loadList = useCroquiStore((s) => s.loadList);

  const [doc, setDoc] = useState<SicroCorpoDoc | null>(null);
  const [tool, setTool] = useState<CorpoTool>("faf_entrada");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savedJson, setSavedJson] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const canvasRef = useRef<CorpoCanvasHandle>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 700 });

  // Carrega o .sicrocorpo ao abrir.
  useEffect(() => {
    if (!workspacePath || !activeCroqui) return;
    let alive = true;
    void commands
      .readCroqui(workspacePath, activeCroqui.id)
      .then((payload) => {
        if (!alive) return;
        const d = coerceCorpoDoc(payload.doc);
        setDoc(d);
        setSavedJson(JSON.stringify(d));
      })
      .catch((err) => {
        if (alive) setFeedback(`Falha ao abrir: ${toSicroError(err).message}`);
      });
    return () => {
      alive = false;
    };
  }, [workspacePath, activeCroqui]);

  // Mede o container do canvas.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [doc !== null]);

  const dirty = useMemo(
    () => (doc && savedJson ? JSON.stringify(doc) !== savedJson : false),
    [doc, savedJson],
  );

  const legend = useMemo(() => (doc ? buildLegend(doc) : []), [doc]);
  const selected = doc?.markers.find((m) => m.id === selectedId) ?? null;

  const mutate = useCallback((fn: (d: SicroCorpoDoc) => SicroCorpoDoc) => {
    setDoc((prev) => (prev ? fn(prev) : prev));
  }, []);

  const handlePlace = useCallback(
    (x: number, y: number) => {
      if (tool === "select") return;
      mutate((d) => {
        const marker = makeLesao(x, y, tool as LesaoTipo, nextMarkerNumber(d));
        return { ...d, markers: [...d.markers, marker] };
      });
    },
    [tool, mutate],
  );

  const handleMove = useCallback(
    (id: string, x: number, y: number) => {
      mutate((d) => ({
        ...d,
        markers: d.markers.map((m) => (m.id === id ? { ...m, x, y } : m)),
      }));
    },
    [mutate],
  );

  const patchMarker = useCallback(
    (id: string, patch: Partial<SicroLesaoMarker>) => {
      mutate((d) => ({
        ...d,
        markers: d.markers.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      }));
    },
    [mutate],
  );

  const deleteMarker = useCallback(
    (id: string) => {
      mutate((d) => ({ ...d, markers: d.markers.filter((m) => m.id !== id) }));
      setSelectedId(null);
    },
    [mutate],
  );

  const setTemplate = useCallback(
    (t: BodyView) => mutate((d) => ({ ...d, template_id: t })),
    [mutate],
  );

  const handleSave = useCallback(async () => {
    if (!workspacePath || !activeCroqui || !doc) return false;
    setBusy(true);
    try {
      const stamped: SicroCorpoDoc = { ...doc, updated_at: new Date().toISOString() };
      await commands.saveCroqui(workspacePath, activeCroqui.id, stamped);
      setDoc(stamped);
      setSavedJson(JSON.stringify(stamped));
      await loadList(workspacePath);
      setFeedback("Salvo.");
      return true;
    } catch (err) {
      setFeedback(`Falha ao salvar: ${toSicroError(err).message}`);
      return false;
    } finally {
      setBusy(false);
    }
  }, [workspacePath, activeCroqui, doc, loadList]);

  const handleExport = useCallback(async () => {
    if (!workspacePath || !activeCroqui || !doc) return;
    if (dirty) {
      const ok = await handleSave();
      if (!ok) return;
    }
    setBusy(true);
    try {
      const bodyPng = canvasRef.current?.toPng(2);
      if (!bodyPng) throw new Error("não foi possível capturar a prancha");
      const png = await stampCorpoPng(bodyPng, buildLegend(doc), {
        title: doc.title,
        occurrence: occurrence
          ? {
              numero_bo: occurrence.numero_bo,
              tipo_pericia: occurrence.tipo_pericia,
              municipio: occurrence.municipio,
            }
          : null,
        templateLabel: BODY_TEMPLATES[doc.template_id].label,
        timestamp: new Date(),
      });
      await commands.exportCroquiPng(workspacePath, activeCroqui.id, {
        png_base64: png.split(",")[1] ?? png,
      });
      await loadList(workspacePath);
      setFeedback("PNG técnico exportado (corpo + legenda).");
    } catch (err) {
      setFeedback(`Falha ao exportar: ${toSicroError(err).message}`);
    } finally {
      setBusy(false);
    }
  }, [workspacePath, activeCroqui, doc, dirty, occurrence, handleSave, loadList]);

  if (!doc) {
    return (
      <div style={{ padding: 24, color: "#64748b" }}>
        Carregando croqui corporal…
        {feedback && <div style={{ color: "#b91c1c", marginTop: 8 }}>{feedback}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar superior */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid #1e293b",
          background: "#0f172a",
          flexWrap: "wrap",
        }}
      >
        <button type="button" onClick={() => clearCurrent()} style={btnStyle()}>
          <ArrowLeft size={14} /> Croquis
        </button>
        <strong style={{ color: "#f8fafc", fontSize: 13 }}>{doc.title}</strong>
        {dirty && <span style={{ color: "#fbbf24", fontSize: 11 }}>● não salvo</span>}

        {/* Pranchas */}
        <div style={{ display: "inline-flex", gap: 4, marginLeft: 12 }}>
          {BODY_VIEW_ORDER.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setTemplate(v)}
              style={btnStyle(doc.template_id === v)}
            >
              {BODY_TEMPLATES[v].label}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
          <button type="button" onClick={() => void handleSave()} disabled={busy} style={btnStyle()}>
            <Save size={14} /> Salvar
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={busy}
            style={btnStyle(false, "#2563eb")}
          >
            <ImageDown size={14} /> Exportar PNG
          </button>
        </div>
      </div>

      {/* Ferramentas de lesão */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "6px 12px",
          borderBottom: "1px solid #e2e8f0",
          background: "#f8fafc",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => setTool("select")}
          title="Selecionar / mover"
          style={toolStyle(tool === "select")}
        >
          <MousePointer2 size={14} /> Selecionar
        </button>
        <span style={{ width: 1, height: 22, background: "#cbd5e1", margin: "0 4px" }} />
        {LESAO_TIPOS.map((t) => (
          <button
            key={t.tipo}
            type="button"
            onClick={() => setTool(t.tipo)}
            title={t.label}
            style={toolStyle(tool === t.tipo)}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: t.color,
                border: "1.5px solid #fff",
                boxShadow: "0 0 0 1px #94a3b8",
                display: "inline-block",
              }}
            />
            {t.short}
          </button>
        ))}
      </div>

      {/* Corpo: canvas + painel direito */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div ref={wrapRef} style={{ flex: 1, minWidth: 0, background: "#fff" }}>
          <CorpoCanvas
            ref={canvasRef}
            doc={doc}
            tool={tool}
            selectedId={selectedId}
            containerWidth={size.w}
            containerHeight={size.h}
            onPlace={handlePlace}
            onSelect={setSelectedId}
            onMove={handleMove}
          />
        </div>

        <aside
          style={{
            width: 320,
            borderLeft: "1px solid #e2e8f0",
            background: "#fff",
            overflowY: "auto",
            padding: 12,
            fontSize: 13,
          }}
        >
          {selected ? (
            <MarkerInspector
              marker={selected}
              onPatch={(p) => patchMarker(selected.id, p)}
              onDelete={() => deleteMarker(selected.id)}
            />
          ) : (
            <p style={{ color: "#64748b" }}>
              Selecione uma ferramenta de lesão e clique no corpo para marcar.
              Clique num marcador (modo Selecionar) para editar tipo, região,
              instrumento e dimensões.
            </p>
          )}

          <hr style={{ margin: "14px 0", border: 0, borderTop: "1px solid #e2e8f0" }} />

          <div style={{ fontWeight: 600, marginBottom: 6, color: "#0f172a" }}>
            Legenda ({legend.length})
          </div>
          {legend.length === 0 ? (
            <p style={{ color: "#94a3b8" }}>Nenhuma lesão marcada.</p>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
              {legend.map((r) => (
                <li
                  key={r.number}
                  style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 6 }}
                >
                  <span
                    style={{
                      flex: "0 0 auto",
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: r.color,
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {r.number}
                  </span>
                  <span style={{ color: "#334155" }}>
                    {r.tipo}
                    {r.regiao ? ` — ${r.regiao}` : ""}
                    {r.dimensoes ? ` · ${r.dimensoes}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p style={{ color: "#94a3b8", fontSize: 11, marginTop: 10 }}>
            {summarizeLesoes(doc)}
          </p>
        </aside>
      </div>

      {feedback && (
        <div
          style={{
            padding: "6px 12px",
            background: "#0f172a",
            color: "#e2e8f0",
            fontSize: 12,
          }}
          onAnimationEnd={() => setFeedback(null)}
        >
          {feedback}
        </div>
      )}
    </div>
  );
}

function MarkerInspector({
  marker,
  onPatch,
  onDelete,
}: {
  marker: SicroLesaoMarker;
  onPatch: (p: Partial<SicroLesaoMarker>) => void;
  onDelete: () => void;
}) {
  const meta = lesaoMeta(marker.tipo);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: marker.color || meta.color,
            color: "#fff",
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
          }}
        >
          {marker.number}
        </span>
        <strong style={{ color: "#0f172a" }}>Lesão nº {marker.number}</strong>
        <button
          type="button"
          onClick={onDelete}
          title="Excluir marcador"
          style={{ marginLeft: "auto", ...btnStyle(false, "#dc2626") }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <label style={lblStyle()}>
        Tipo
        <select
          value={marker.tipo}
          onChange={(e) => onPatch({ tipo: e.target.value as LesaoTipo })}
          style={inputStyle()}
        >
          {LESAO_TIPOS.map((t) => (
            <option key={t.tipo} value={t.tipo}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label style={lblStyle()}>
        Região anatômica
        <select
          value={marker.regiao ?? ""}
          onChange={(e) => onPatch({ regiao: e.target.value || null })}
          style={inputStyle()}
        >
          <option value="">— não informada —</option>
          {REGIOES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.grupo}: {r.label}
            </option>
          ))}
        </select>
      </label>

      <label style={lblStyle()}>
        Lateralidade
        <select
          value={marker.lateralidade ?? ""}
          onChange={(e) =>
            onPatch({ lateralidade: (e.target.value || null) as Lateralidade | null })
          }
          style={inputStyle()}
        >
          <option value="">—</option>
          {(["D", "E", "central"] as Lateralidade[]).map((l) => (
            <option key={l} value={l}>
              {LATERALIDADE_LABEL[l]}
            </option>
          ))}
        </select>
      </label>

      <label style={lblStyle()}>
        Meio / instrumento
        <input
          value={marker.instrumento ?? ""}
          onChange={(e) => onPatch({ instrumento: e.target.value || null })}
          placeholder="ex.: PAF, faca, contundente"
          style={inputStyle()}
        />
      </label>

      <label style={lblStyle()}>
        Dimensões
        <input
          value={marker.dimensoes_cm ?? ""}
          onChange={(e) => onPatch({ dimensoes_cm: e.target.value || null })}
          placeholder='ex.: 2,0 x 0,8 cm'
          style={inputStyle()}
        />
      </label>

      <label style={lblStyle()}>
        Observação
        <textarea
          value={marker.observacao ?? ""}
          onChange={(e) => onPatch({ observacao: e.target.value || null })}
          rows={2}
          style={{ ...inputStyle(), resize: "vertical" }}
        />
      </label>
    </div>
  );
}

// --- estilos inline (primeira versão; refinar com feedback visual) ---
function btnStyle(active = false, accent?: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 10px",
    fontSize: 12,
    border: "1px solid #334155",
    borderRadius: 7,
    background: accent ?? (active ? "#2563eb" : "#1e293b"),
    color: "#f8fafc",
    cursor: "pointer",
  };
}
function toolStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 9px",
    fontSize: 12,
    border: active ? "1.5px solid #2563eb" : "1px solid #cbd5e1",
    borderRadius: 7,
    background: active ? "#dbeafe" : "#fff",
    color: "#0f172a",
    cursor: "pointer",
  };
}
function lblStyle(): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    fontSize: 12,
    color: "#475569",
    fontWeight: 500,
  };
}
function inputStyle(): React.CSSProperties {
  return {
    padding: "5px 8px",
    fontSize: 13,
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    color: "#0f172a",
    background: "#fff",
  };
}
