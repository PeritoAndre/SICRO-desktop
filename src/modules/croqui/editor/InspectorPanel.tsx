/**
 * InspectorPanel — right column with layers + selected-object properties.
 * No editing of layer geometry here; that's the canvas' job. This panel
 * lets the user toggle layer visibility, rename labels, change colors,
 * tweak rotation, etc.
 */

import { Eye, EyeOff, Lock, Unlock } from "lucide-react";
import type {
  SicroCroquiLayer,
  SicroObject,
  SicroCroquiScale,
} from "../engine";
import styles from "./InspectorPanel.module.css";

interface Props {
  layers: SicroCroquiLayer[];
  objects: SicroObject[];
  selectedId: string | null;
  scale: SicroCroquiScale | null;
  onSelectObject: (id: string | null) => void;
  onToggleLayerVisibility: (layerId: string) => void;
  onUpdateObject: (id: string, patch: Partial<SicroObject>) => void;
}

export function InspectorPanel({
  layers,
  objects,
  selectedId,
  scale,
  onSelectObject,
  onToggleLayerVisibility,
  onUpdateObject,
}: Props) {
  const selected = selectedId
    ? objects.find((o) => o.id === selectedId) ?? null
    : null;

  return (
    <aside className={styles.panel}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Camadas</h3>
        <ul className={styles.layerList}>
          {layers.map((l) => {
            const objectsHere = objects.filter((o) => o.layer_id === l.id);
            return (
              <li key={l.id} className={styles.layer}>
                <div className={styles.layerHeader}>
                  <button
                    type="button"
                    className={styles.layerToggleBtn}
                    onClick={() => onToggleLayerVisibility(l.id)}
                    title={l.visible ? "Esconder camada" : "Mostrar camada"}
                  >
                    {l.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  <span className={styles.layerName}>{l.name}</span>
                  <span className={styles.layerLock} title={l.locked ? "Trancada" : "Desbloqueada"}>
                    {l.locked ? <Lock size={11} /> : <Unlock size={11} />}
                  </span>
                  <span className={styles.layerCount}>{objectsHere.length}</span>
                </div>
                {objectsHere.length > 0 && (
                  <ul className={styles.objectList}>
                    {objectsHere.map((o) => (
                      <li
                        key={o.id}
                        className={`${styles.objectItem} ${
                          selectedId === o.id ? styles.objectItemActive : ""
                        }`}
                        onClick={() => onSelectObject(o.id)}
                      >
                        <span className={styles.objectKind}>{shortKind(o)}</span>
                        <span className={styles.objectLabel}>
                          {summariseObject(o)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Propriedades</h3>
        {!selected ? (
          <p className={styles.empty}>Selecione um objeto no canvas.</p>
        ) : (
          <ObjectProperties
            object={selected}
            scale={scale}
            onChange={(patch) => onUpdateObject(selected.id, patch)}
          />
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Escala</h3>
        {scale ? (
          <dl className={styles.metaGrid}>
            <dt>px / m</dt>
            <dd className={styles.mono}>{scale.px_per_m.toFixed(2)}</dd>
            {scale.definition && (
              <>
                <dt>Calibrado</dt>
                <dd className={styles.mono}>
                  {scale.definition.real_distance_m.toFixed(2)} m
                </dd>
              </>
            )}
          </dl>
        ) : (
          <p className={styles.empty}>
            Use a ferramenta <strong>Definir escala</strong> e clique em dois
            pontos para calibrar.
          </p>
        )}
      </section>
    </aside>
  );
}

function shortKind(o: SicroObject): string {
  switch (o.kind) {
    case "vehicle":
      return "🚗";
    case "line":
      return o.subtype === "r1" ? "R1" : o.subtype === "r2" ? "R2" : "—";
    case "marker":
      return o.subtype === "collision_x" ? "X" : "·";
    case "text":
      return "T";
    case "measurement":
      return "↔";
  }
}

function summariseObject(o: SicroObject): string {
  if (o.label) return o.label;
  switch (o.kind) {
    case "vehicle":
      return "Veículo";
    case "line":
      return `Linha ${o.subtype}`;
    case "marker":
      return o.subtype;
    case "text":
      return o.text.slice(0, 32);
    case "measurement":
      return "Medição";
  }
}

function ObjectProperties({
  object,
  onChange,
}: {
  object: SicroObject;
  scale: SicroCroquiScale | null;
  onChange: (patch: Partial<SicroObject>) => void;
}) {
  return (
    <div className={styles.props}>
      <Field label="ID" value={object.id} mono readOnly />
      <Field label="Tipo" value={object.kind} mono readOnly />
      <Field
        label="Rótulo"
        value={object.label ?? ""}
        onChange={(v) => onChange({ label: v } as Partial<SicroObject>)}
      />
      {(object.kind === "vehicle" ||
        object.kind === "marker" ||
        object.kind === "text") && (
        <>
          <Field
            label="X"
            value={String(object.x)}
            onChange={(v) =>
              onChange({ x: numberOr(v, object.x) } as Partial<SicroObject>)
            }
          />
          <Field
            label="Y"
            value={String(object.y)}
            onChange={(v) =>
              onChange({ y: numberOr(v, object.y) } as Partial<SicroObject>)
            }
          />
        </>
      )}
      {object.kind === "vehicle" && (
        <>
          <Field
            label="Largura"
            value={String(object.width)}
            onChange={(v) =>
              onChange({ width: numberOr(v, object.width) } as Partial<SicroObject>)
            }
          />
          <Field
            label="Altura"
            value={String(object.height)}
            onChange={(v) =>
              onChange({ height: numberOr(v, object.height) } as Partial<SicroObject>)
            }
          />
          <Field
            label="Rotação (°)"
            value={String(object.rotation)}
            onChange={(v) =>
              onChange({ rotation: numberOr(v, object.rotation) } as Partial<SicroObject>)
            }
          />
        </>
      )}
      {object.kind === "text" && (
        <Field
          label="Texto"
          value={object.text}
          onChange={(v) => onChange({ text: v } as Partial<SicroObject>)}
        />
      )}
      {(object.color != null || object.kind === "vehicle" || object.kind === "line" || object.kind === "marker" || object.kind === "text" || object.kind === "measurement") && (
        <Field
          label="Cor"
          value={object.color ?? "#000000"}
          type="color"
          onChange={(v) => onChange({ color: v } as Partial<SicroObject>)}
        />
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  readOnly,
  mono,
  type,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  mono?: boolean;
  type?: "text" | "color";
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        type={type ?? "text"}
        value={value}
        readOnly={readOnly || !onChange}
        onChange={(e) => onChange?.(e.target.value)}
        className={`${styles.fieldInput} ${mono ? styles.mono : ""}`}
      />
    </label>
  );
}

function numberOr(raw: string, fallback: number): number {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}
