/**
 * ProcessingStackPanel — pipeline de filtros forenses não-destrutivo.
 *
 * G12.11 — Lista vertical de operações empilhadas. Cada operação tem:
 *   - Toggle on/off (não remove, só desabilita).
 *   - Botões mover para cima/baixo (reordenar).
 *   - Botão remover.
 *   - Editor de parâmetros específico do kind.
 *
 * Embaixo, um botão "+ Adicionar filtro" abre menu suspenso com lista
 * categorizada de filtros (Bordas, Suavização, Realce, Morfologia,
 * Geométrico, Misc).
 *
 * O `onApply` é chamado quando a stack muda — o pai dispara
 * `apply_operation_stack` no backend e atualiza o preview.
 */

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react";
import type {
  ProcessingOp,
  ProcessingOpKind,
} from "../engine/schema";
import styles from "./ProcessingStackPanel.module.css";

interface Props {
  stack: ProcessingOp[];
  onChange: (stack: ProcessingOp[]) => void;
}

interface FilterDef {
  kind: ProcessingOpKind;
  label: string;
  defaults: Record<string, unknown>;
  controls: Array<{
    key: string;
    label: string;
    type: "number" | "range";
    min?: number;
    max?: number;
    step?: number;
  }>;
}

const FILTER_CATALOG: Record<string, FilterDef[]> = {
  Bordas: [
    {
      kind: "edge_sobel",
      label: "Sobel",
      defaults: { strength: 1.0 },
      controls: [
        { key: "strength", label: "Intensidade", type: "range", min: 0, max: 4, step: 0.1 },
      ],
    },
    {
      kind: "edge_laplacian",
      label: "Laplaciano",
      defaults: { strength: 1.0 },
      controls: [
        { key: "strength", label: "Intensidade", type: "range", min: 0, max: 4, step: 0.1 },
      ],
    },
    {
      kind: "edge_canny",
      label: "Canny",
      defaults: { low_threshold: 50, high_threshold: 150 },
      controls: [
        { key: "low_threshold", label: "Limiar inferior", type: "range", min: 0, max: 254, step: 1 },
        { key: "high_threshold", label: "Limiar superior", type: "range", min: 1, max: 255, step: 1 },
      ],
    },
  ],
  Suavização: [
    {
      kind: "blur_gaussian",
      label: "Gaussian",
      defaults: { sigma: 1.5 },
      controls: [{ key: "sigma", label: "Sigma", type: "range", min: 0.1, max: 8, step: 0.1 }],
    },
    {
      kind: "blur_median",
      label: "Median",
      defaults: { radius: 1 },
      controls: [{ key: "radius", label: "Raio", type: "range", min: 1, max: 5, step: 1 }],
    },
    {
      kind: "blur_bilateral",
      label: "Bilateral",
      defaults: { sigma_space: 2.0, sigma_color: 25.0 },
      controls: [
        { key: "sigma_space", label: "σ espacial", type: "range", min: 0.5, max: 6, step: 0.1 },
        { key: "sigma_color", label: "σ cor", type: "range", min: 5, max: 80, step: 1 },
      ],
    },
    {
      kind: "unsharp_mask",
      label: "Unsharp mask",
      defaults: { sigma: 1.5, amount: 1.0 },
      controls: [
        { key: "sigma", label: "Sigma", type: "range", min: 0.5, max: 5, step: 0.1 },
        { key: "amount", label: "Quantidade", type: "range", min: 0, max: 4, step: 0.1 },
      ],
    },
  ],
  Realce: [
    {
      kind: "clahe",
      label: "CLAHE",
      defaults: { tile_size: 8, clip_limit: 2.0 },
      controls: [
        { key: "tile_size", label: "Tile", type: "range", min: 4, max: 64, step: 4 },
        { key: "clip_limit", label: "Clip limit", type: "range", min: 1.0, max: 8.0, step: 0.1 },
      ],
    },
    {
      kind: "histogram_equalize",
      label: "Equalização global",
      defaults: {},
      controls: [],
    },
    {
      kind: "auto_levels",
      label: "Auto-levels",
      defaults: { percentile_low: 1, percentile_high: 99 },
      controls: [
        { key: "percentile_low", label: "Percentil baixo", type: "range", min: 0, max: 49, step: 0.5 },
        { key: "percentile_high", label: "Percentil alto", type: "range", min: 51, max: 100, step: 0.5 },
      ],
    },
    {
      kind: "white_balance_gray_world",
      label: "White balance (gray-world)",
      defaults: {},
      controls: [],
    },
    {
      kind: "threshold",
      label: "Threshold",
      defaults: { value: 128 },
      controls: [{ key: "value", label: "Limiar", type: "range", min: 0, max: 255, step: 1 }],
    },
  ],
  Morfologia: [
    {
      kind: "dilate",
      label: "Dilatar",
      defaults: { radius: 1 },
      controls: [{ key: "radius", label: "Raio", type: "range", min: 1, max: 5, step: 1 }],
    },
    {
      kind: "erode",
      label: "Erodir",
      defaults: { radius: 1 },
      controls: [{ key: "radius", label: "Raio", type: "range", min: 1, max: 5, step: 1 }],
    },
    {
      kind: "open",
      label: "Abertura",
      defaults: { radius: 1 },
      controls: [{ key: "radius", label: "Raio", type: "range", min: 1, max: 5, step: 1 }],
    },
    {
      kind: "close",
      label: "Fechamento",
      defaults: { radius: 1 },
      controls: [{ key: "radius", label: "Raio", type: "range", min: 1, max: 5, step: 1 }],
    },
  ],
  Geometria: [
    {
      kind: "rotate_90_cw",
      label: "Girar 90° horário",
      defaults: {},
      controls: [],
    },
    {
      kind: "rotate_90_ccw",
      label: "Girar 90° anti-horário",
      defaults: {},
      controls: [],
    },
    {
      kind: "rotate_180",
      label: "Girar 180°",
      defaults: {},
      controls: [],
    },
    {
      kind: "flip_horizontal",
      label: "Espelhar horizontal",
      defaults: {},
      controls: [],
    },
    {
      kind: "flip_vertical",
      label: "Espelhar vertical",
      defaults: {},
      controls: [],
    },
  ],
};

function findDef(kind: ProcessingOpKind): FilterDef | null {
  for (const group of Object.values(FILTER_CATALOG)) {
    const found = group.find((d) => d.kind === kind);
    if (found) return found;
  }
  return null;
}

function labelFor(kind: ProcessingOpKind): string {
  const def = findDef(kind);
  if (def) return def.label;
  return kind;
}

export function ProcessingStackPanel({ stack, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const updateOp = (id: string, patch: Partial<ProcessingOp>) => {
    onChange(stack.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };
  const updateParam = (id: string, key: string, value: unknown) => {
    onChange(
      stack.map((o) =>
        o.id === id
          ? { ...o, params: { ...o.params, [key]: value } }
          : o,
      ),
    );
  };
  const removeOp = (id: string) => {
    onChange(stack.filter((o) => o.id !== id));
  };
  const move = (id: string, delta: number) => {
    const i = stack.findIndex((o) => o.id === id);
    if (i < 0) return;
    const j = i + delta;
    if (j < 0 || j >= stack.length) return;
    const next = [...stack];
    const a = next[i];
    const b = next[j];
    if (!a || !b) return;
    next[i] = b;
    next[j] = a;
    onChange(next);
  };
  const addOp = (kind: ProcessingOpKind) => {
    const def = findDef(kind);
    const newOp: ProcessingOp = {
      id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind,
      enabled: true,
      params: def ? { ...def.defaults } : {},
      created_at: new Date().toISOString(),
    };
    onChange([...stack, newOp]);
    setPickerOpen(false);
  };

  return (
    <div className={styles.panel}>
      <header className={styles.head}>
        <strong>Pipeline ({stack.length})</strong>
        <span className={styles.hint}>arraste topo→base = ordem de aplicação</span>
      </header>

      {stack.length === 0 && (
        <p className={styles.empty}>
          Nenhum filtro aplicado. Clique em <strong>+ Adicionar filtro</strong> abaixo
          para começar.
        </p>
      )}

      <ul className={styles.list}>
        {stack.map((op, i) => {
          const def = findDef(op.kind);
          return (
            <li
              key={op.id}
              className={`${styles.item} ${op.enabled ? "" : styles.disabled}`}
            >
              <header className={styles.itemHead}>
                <span className={styles.itemIndex}>#{i + 1}</span>
                <span className={styles.itemLabel}>{labelFor(op.kind)}</span>
                <div className={styles.itemActions}>
                  <button
                    type="button"
                    title="Mover para cima"
                    onClick={() => move(op.id, -1)}
                    disabled={i === 0}
                  >
                    <ArrowUp size={11} />
                  </button>
                  <button
                    type="button"
                    title="Mover para baixo"
                    onClick={() => move(op.id, 1)}
                    disabled={i === stack.length - 1}
                  >
                    <ArrowDown size={11} />
                  </button>
                  <button
                    type="button"
                    title={op.enabled ? "Desativar" : "Ativar"}
                    onClick={() => updateOp(op.id, { enabled: !op.enabled })}
                  >
                    {op.enabled ? <Eye size={11} /> : <EyeOff size={11} />}
                  </button>
                  <button
                    type="button"
                    title="Remover"
                    onClick={() => removeOp(op.id)}
                    className={styles.itemDanger}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </header>
              {def && def.controls.length > 0 && (
                <div className={styles.controls}>
                  {def.controls.map((ctrl) => {
                    const val =
                      (op.params[ctrl.key] as number | undefined) ??
                      (def.defaults[ctrl.key] as number | undefined) ??
                      0;
                    return (
                      <label key={ctrl.key} className={styles.control}>
                        <span>{ctrl.label}</span>
                        <input
                          type={ctrl.type}
                          min={ctrl.min}
                          max={ctrl.max}
                          step={ctrl.step ?? 1}
                          value={val}
                          onChange={(e) =>
                            updateParam(
                              op.id,
                              ctrl.key,
                              parseFloat(e.target.value),
                            )
                          }
                        />
                        <output>{Number(val).toFixed(2)}</output>
                      </label>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className={styles.adder}>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setPickerOpen((v) => !v)}
        >
          <Plus size={12} /> Adicionar filtro <ChevronDown size={10} />
        </button>
        {pickerOpen && (
          <div className={styles.picker} role="menu">
            {Object.entries(FILTER_CATALOG).map(([group, items]) => (
              <div key={group} className={styles.pickerGroup}>
                <h4>{group}</h4>
                <ul>
                  {items.map((d) => (
                    <li key={d.kind}>
                      <button
                        type="button"
                        onClick={() => addOp(d.kind)}
                      >
                        {d.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Helper para converter um `ProcessingOp` em `BackendOperation` (formato
 * aceito pelo Tauri command). Usado pelo editor ao chamar
 * `apply_operation_stack`.
 */
export function processingOpToBackendOperation(
  op: ProcessingOp,
): Record<string, unknown> {
  return { kind: op.kind, ...op.params };
}
