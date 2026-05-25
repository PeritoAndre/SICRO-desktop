/**
 * InspectorPanel — right column with **Camadas** (grouped by category)
 * and **Propriedades** of the selected object. MVP 6.
 *
 * Layer panel features (MVP 6):
 *   - group objects by `category` (vias / veículos / vestígios / medidas /
 *     anotações / referenciais);
 *   - per-object: visibility toggle, lock toggle, click-to-select,
 *     rename inline, delete, move forward / backward;
 *   - global layer visibility from the existing `SicroCroquiLayer` rows.
 *
 * Properties panel features (MVP 6):
 *   - common: label, x/y, rotation (when applicable), width/height,
 *     color, notes, locked, visible;
 *   - vehicle: body_type select;
 *   - marker: subtype select;
 *   - measurement: pixel distance + real distance (from current scale);
 *   - line: subtype select + stroke width + dashed.
 */

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Lock,
  Pencil,
  Trash2,
  Unlock,
} from "lucide-react";
import {
  distancePx,
  formatMeasurement,
  inferCategory,
  type ObjectCategory,
  type SicroCroquiLayer,
  type SicroCroquiScale,
  type SicroLineObject,
  type SicroMarkerObject,
  type SicroMeasurementObject,
  type SicroObject,
  type SicroTextObject,
  type SicroVehicleObject,
  type VehicleBodyType,
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
  onDeleteObject: (id: string) => void;
  onMoveObject: (id: string, direction: "up" | "down") => void;
}

const CATEGORY_ORDER: ObjectCategory[] = [
  "vias",
  "veiculos",
  "referenciais",
  "vestigios",
  "mobiliario_urbano",
  "medidas",
  "anotacoes",
  "outros",
];

const CATEGORY_LABEL: Record<ObjectCategory, string> = {
  vias: "Vias",
  veiculos: "Veículos",
  referenciais: "Referenciais (R1/R2)",
  vestigios: "Vestígios e pessoas",
  mobiliario_urbano: "Mobiliário urbano",
  medidas: "Medidas",
  anotacoes: "Anotações",
  outros: "Outros",
};

export function InspectorPanel({
  layers,
  objects,
  selectedId,
  scale,
  onSelectObject,
  onToggleLayerVisibility,
  onUpdateObject,
  onDeleteObject,
  onMoveObject,
}: Props) {
  const selected = selectedId
    ? objects.find((o) => o.id === selectedId) ?? null
    : null;

  const grouped = useMemo(() => {
    const map = new Map<ObjectCategory, SicroObject[]>();
    for (const o of objects) {
      const cat = o.category ?? inferCategory(o);
      const list = map.get(cat) ?? [];
      list.push(o);
      map.set(cat, list);
    }
    return CATEGORY_ORDER.filter((c) => (map.get(c) ?? []).length > 0).map(
      (c) => ({ category: c, items: map.get(c) ?? [] }),
    );
  }, [objects]);

  return (
    <aside className={styles.panel} aria-label="Painel de camadas e propriedades">
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Camadas globais</h3>
        <ul className={styles.layerList}>
          {layers.map((l) => (
            <li key={l.id} className={styles.layer}>
              <button
                type="button"
                className={styles.layerToggleBtn}
                onClick={() => onToggleLayerVisibility(l.id)}
                title={l.visible ? "Esconder camada" : "Mostrar camada"}
              >
                {l.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
              <span className={styles.layerName}>{l.name}</span>
              <span className={styles.layerKind}>{l.kind}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Objetos</h3>
        {grouped.length === 0 && (
          <p className={styles.empty}>
            O canvas está vazio. Use a barra à esquerda para inserir um
            objeto.
          </p>
        )}
        {grouped.map(({ category, items }) => (
          <CategoryBlock
            key={category}
            category={category}
            items={items}
            selectedId={selectedId}
            onSelectObject={onSelectObject}
            onUpdateObject={onUpdateObject}
            onDeleteObject={onDeleteObject}
            onMoveObject={onMoveObject}
          />
        ))}
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
                <dt>Calibração</dt>
                <dd className={styles.mono}>
                  {scale.definition.real_distance_m.toFixed(2)} m
                </dd>
              </>
            )}
          </dl>
        ) : (
          <p className={styles.empty}>
            Use a ferramenta <strong>Definir escala</strong> e clique em
            dois pontos para calibrar. Sem escala, as medidas aparecem
            em pixels.
          </p>
        )}
      </section>
    </aside>
  );
}

function CategoryBlock({
  category,
  items,
  selectedId,
  onSelectObject,
  onUpdateObject,
  onDeleteObject,
  onMoveObject,
}: {
  category: ObjectCategory;
  items: SicroObject[];
  selectedId: string | null;
  onSelectObject: (id: string | null) => void;
  onUpdateObject: (id: string, patch: Partial<SicroObject>) => void;
  onDeleteObject: (id: string) => void;
  onMoveObject: (id: string, direction: "up" | "down") => void;
}) {
  return (
    <div className={styles.category}>
      <div className={styles.categoryTitle}>
        {CATEGORY_LABEL[category]} <span className={styles.dim}>({items.length})</span>
      </div>
      <ul className={styles.objectList}>
        {items.map((o) => (
          <ObjectRow
            key={o.id}
            obj={o}
            selected={selectedId === o.id}
            onSelect={() => onSelectObject(o.id)}
            onUpdate={(patch) => onUpdateObject(o.id, patch)}
            onDelete={() => onDeleteObject(o.id)}
            onMove={(dir) => onMoveObject(o.id, dir)}
          />
        ))}
      </ul>
    </div>
  );
}

function ObjectRow({
  obj,
  selected,
  onSelect,
  onUpdate,
  onDelete,
  onMove,
}: {
  obj: SicroObject;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<SicroObject>) => void;
  onDelete: () => void;
  onMove: (dir: "up" | "down") => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(obj.label ?? "");

  const visible = obj.visible !== false;
  const locked = obj.locked === true;

  const commitRename = () => {
    setRenaming(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== (obj.label ?? "")) {
      onUpdate({ label: trimmed } as Partial<SicroObject>);
    }
  };

  return (
    <li
      className={`${styles.objectItem} ${
        selected ? styles.objectItemActive : ""
      }`}
    >
      <button
        type="button"
        className={styles.objectVisBtn}
        title={visible ? "Esconder" : "Mostrar"}
        onClick={(e) => {
          e.stopPropagation();
          onUpdate({ visible: !visible } as Partial<SicroObject>);
        }}
      >
        {visible ? <Eye size={11} /> : <EyeOff size={11} />}
      </button>
      <button
        type="button"
        className={styles.objectVisBtn}
        title={locked ? "Destravar" : "Travar"}
        onClick={(e) => {
          e.stopPropagation();
          onUpdate({ locked: !locked } as Partial<SicroObject>);
        }}
      >
        {locked ? <Lock size={11} /> : <Unlock size={11} />}
      </button>
      {renaming ? (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          autoFocus
          className={styles.renameInput}
        />
      ) : (
        <button
          type="button"
          className={styles.objectLabelBtn}
          onClick={onSelect}
          title={summariseObject(obj)}
        >
          <span className={styles.objectKindBadge}>{shortKind(obj)}</span>
          <span className={styles.objectLabel}>{summariseObject(obj)}</span>
        </button>
      )}
      <button
        type="button"
        className={styles.objectAction}
        title="Renomear"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(obj.label ?? "");
          setRenaming(true);
        }}
      >
        <Pencil size={10} />
      </button>
      <button
        type="button"
        className={styles.objectAction}
        title="Para frente"
        onClick={(e) => {
          e.stopPropagation();
          onMove("up");
        }}
      >
        <ArrowUp size={10} />
      </button>
      <button
        type="button"
        className={styles.objectAction}
        title="Para trás"
        onClick={(e) => {
          e.stopPropagation();
          onMove("down");
        }}
      >
        <ArrowDown size={10} />
      </button>
      <button
        type="button"
        className={styles.objectAction}
        title="Excluir"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 size={10} />
      </button>
    </li>
  );
}

function shortKind(o: SicroObject): string {
  switch (o.kind) {
    case "vehicle":
      return "V";
    case "line":
      if (o.subtype === "r1") return "R1";
      if (o.subtype === "r2") return "R2";
      if (o.subtype === "arrow") return "→";
      return "L";
    case "marker":
      if (o.subtype === "collision_x") return "X";
      if (o.subtype === "brake_mark") return "B";
      if (o.subtype === "drag_mark") return "A";
      if (o.subtype === "fluid") return "F";
      if (o.subtype === "blood") return "S";
      if (o.subtype === "debris") return "D";
      if (o.subtype === "pedestrian") return "P";
      if (o.subtype === "body") return "C";
      return "·";
    case "text":
      return "T";
    case "measurement":
      return "↔";
    case "road":
      return "R";
  }
}

function summariseObject(o: SicroObject): string {
  if (o.label) return o.label;
  switch (o.kind) {
    case "vehicle":
      return `Veículo (${o.body_type ?? "car"})`;
    case "line":
      return `Linha ${o.subtype}`;
    case "marker":
      return o.subtype;
    case "text":
      return o.text.slice(0, 32);
    case "measurement":
      return "Medição";
    case "road":
      return `Via ${o.subtype} (${o.lane_count} faixa(s))`;
  }
}

function ObjectProperties({
  object,
  scale,
  onChange,
}: {
  object: SicroObject;
  scale: SicroCroquiScale | null;
  onChange: (patch: Partial<SicroObject>) => void;
}) {
  return (
    <div className={styles.props}>
      <Field label="ID" value={object.id} mono readOnly />
      <Field
        label="Rótulo"
        value={object.label ?? ""}
        onChange={(v) => onChange({ label: v } as Partial<SicroObject>)}
      />
      <Field
        label="Categoria"
        value={object.category ?? inferCategory(object)}
        readOnly
      />

      {object.kind === "vehicle" && (
        <VehicleProps object={object} onChange={onChange} />
      )}
      {object.kind === "marker" && (
        <MarkerProps object={object} onChange={onChange} />
      )}
      {object.kind === "text" && (
        <TextProps object={object} onChange={onChange} />
      )}
      {object.kind === "line" && (
        <LineProps object={object} onChange={onChange} />
      )}
      {object.kind === "measurement" && (
        <MeasurementProps object={object} scale={scale} onChange={onChange} />
      )}

      <Field
        label="Cor"
        type="color"
        value={object.color ?? "#000000"}
        onChange={(v) => onChange({ color: v } as Partial<SicroObject>)}
      />
      <Field
        label="Observação"
        value={object.notes ?? ""}
        onChange={(v) => onChange({ notes: v } as Partial<SicroObject>)}
      />
      <CheckboxRow
        label="Visível"
        checked={object.visible !== false}
        onChange={(v) => onChange({ visible: v } as Partial<SicroObject>)}
      />
      <CheckboxRow
        label="Bloqueado"
        checked={object.locked === true}
        onChange={(v) => onChange({ locked: v } as Partial<SicroObject>)}
      />
    </div>
  );
}

function VehicleProps({
  object,
  onChange,
}: {
  object: SicroVehicleObject;
  onChange: (patch: Partial<SicroObject>) => void;
}) {
  return (
    <>
      <SelectField
        label="Tipo"
        value={object.body_type ?? "car"}
        options={[
          { v: "sedan", l: "Sedan" },
          { v: "suv", l: "SUV" },
          { v: "hatch", l: "Hatch" },
          { v: "car", l: "Carro (genérico)" },
          { v: "moto", l: "Motocicleta" },
          { v: "bike", l: "Bicicleta" },
          { v: "truck", l: "Caminhão" },
          { v: "caminhao", l: "Caminhão (BR)" },
          { v: "other", l: "Outro" },
        ]}
        onChange={(v) =>
          onChange({ body_type: v as VehicleBodyType } as Partial<SicroObject>)
        }
      />
      <NumberField label="X" value={object.x} onChange={(n) => onChange({ x: n } as Partial<SicroObject>)} />
      <NumberField label="Y" value={object.y} onChange={(n) => onChange({ y: n } as Partial<SicroObject>)} />
      <NumberField label="Largura" value={object.width} onChange={(n) => onChange({ width: Math.max(4, n) } as Partial<SicroObject>)} />
      <NumberField label="Altura" value={object.height} onChange={(n) => onChange({ height: Math.max(4, n) } as Partial<SicroObject>)} />
      <NumberField label="Rotação (°)" value={object.rotation} onChange={(n) => onChange({ rotation: n } as Partial<SicroObject>)} />
    </>
  );
}

function MarkerProps({
  object,
  onChange,
}: {
  object: SicroMarkerObject;
  onChange: (patch: Partial<SicroObject>) => void;
}) {
  return (
    <>
      <Field label="Subtipo" value={object.subtype} readOnly />
      <NumberField label="X" value={object.x} onChange={(n) => onChange({ x: n } as Partial<SicroObject>)} />
      <NumberField label="Y" value={object.y} onChange={(n) => onChange({ y: n } as Partial<SicroObject>)} />
      <NumberField label="Tamanho" value={object.size} onChange={(n) => onChange({ size: Math.max(6, n) } as Partial<SicroObject>)} />
      <NumberField
        label="Rotação (°)"
        value={object.rotation ?? 0}
        onChange={(n) => onChange({ rotation: n } as Partial<SicroObject>)}
      />
    </>
  );
}

function TextProps({
  object,
  onChange,
}: {
  object: SicroTextObject;
  onChange: (patch: Partial<SicroObject>) => void;
}) {
  return (
    <>
      <Field
        label="Texto"
        value={object.text}
        onChange={(v) => onChange({ text: v } as Partial<SicroObject>)}
      />
      <NumberField label="X" value={object.x} onChange={(n) => onChange({ x: n } as Partial<SicroObject>)} />
      <NumberField label="Y" value={object.y} onChange={(n) => onChange({ y: n } as Partial<SicroObject>)} />
      <NumberField label="Tamanho da fonte" value={object.font_size} onChange={(n) => onChange({ font_size: Math.max(8, n) } as Partial<SicroObject>)} />
      <NumberField label="Rotação (°)" value={object.rotation ?? 0} onChange={(n) => onChange({ rotation: n } as Partial<SicroObject>)} />
    </>
  );
}

function LineProps({
  object,
  onChange,
}: {
  object: SicroLineObject;
  onChange: (patch: Partial<SicroObject>) => void;
}) {
  return (
    <>
      <Field label="Subtipo" value={object.subtype} readOnly />
      <NumberField
        label="Espessura"
        value={object.stroke_width}
        onChange={(n) =>
          onChange({ stroke_width: Math.max(1, n) } as Partial<SicroObject>)
        }
      />
      <CheckboxRow
        label="Tracejada"
        checked={!!object.dashed}
        onChange={(v) => onChange({ dashed: v } as Partial<SicroObject>)}
      />
    </>
  );
}

function MeasurementProps({
  object,
  scale,
  onChange,
}: {
  object: SicroMeasurementObject;
  scale: SicroCroquiScale | null;
  onChange: (patch: Partial<SicroObject>) => void;
}) {
  const px = distancePx(object.p1, object.p2);
  const label = formatMeasurement(px, scale?.px_per_m);
  return (
    <>
      <Field label="Distância (pixels)" value={px.toFixed(1)} readOnly mono />
      <Field label="Distância real" value={label} readOnly mono />
      <Field
        label="Rótulo (override)"
        value={object.label_override ?? ""}
        onChange={(v) =>
          onChange({
            label_override: v.trim() === "" ? null : v,
          } as Partial<SicroObject>)
        }
      />
    </>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={styles.checkboxRow}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { v: string; l: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <select
        className={styles.fieldInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </label>
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

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const n = Number(e.target.value.replace(",", "."));
          if (Number.isFinite(n)) onChange(n);
        }}
        className={`${styles.fieldInput} ${styles.mono}`}
      />
    </label>
  );
}
