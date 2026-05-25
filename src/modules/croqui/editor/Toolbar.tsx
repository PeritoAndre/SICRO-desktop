/**
 * Toolbar — left vertical strip with the available tools, grouped by
 * domain (Seleção / Referencial / Via / Veículos / Pessoas / Vestígios /
 * Anotação / Imagem / Export). MVP 6.
 *
 * Tools mutate `editor.tool`; actions trigger callbacks bubbled by the
 * editor. Templates are surfaced via the "Modelos de via" dropdown
 * (button next to the via group).
 */

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  Car,
  Crosshair,
  Droplet,
  FileImage,
  Footprints,
  Hand,
  Image as ImageIcon,
  Layers,
  MapPin,
  Minus,
  MoreHorizontal,
  MousePointer2,
  PersonStanding,
  Plus,
  Redo2,
  Route,
  Ruler,
  Save,
  Square,
  StretchHorizontal,
  Trash2,
  Truck,
  Type,
  Undo2,
  Workflow,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@components/Button/Button";
import type { Tool } from "./useEditorState";
import { TEMPLATES, type TemplateId } from "../engine";
import styles from "./Toolbar.module.css";

interface ToolDef {
  key: Tool;
  label: string;
  icon: LucideIcon;
  hint?: string;
}

interface ToolGroup {
  id: string;
  title: string;
  tools: ToolDef[];
}

/**
 * Groups laid out in the order the perito needs them. Names match the
 * MVP 6 briefing 1:1 so the report and the UI use the same vocabulary.
 */
const GROUPS: ToolGroup[] = [
  {
    id: "selecao",
    title: "Seleção",
    tools: [
      { key: "select", label: "Selecionar", icon: MousePointer2, hint: "V" },
      { key: "pan", label: "Pan", icon: Hand, hint: "H" },
    ],
  },
  {
    id: "referencial",
    title: "Referencial",
    tools: [
      { key: "line_r1", label: "R1", icon: Minus },
      { key: "line_r2", label: "R2", icon: Minus },
    ],
  },
  {
    id: "via",
    title: "Via",
    tools: [
      { key: "line_road", label: "Via", icon: Route },
      { key: "line_lane", label: "Faixa", icon: StretchHorizontal },
      { key: "line_lane_separator", label: "Divisão tracejada", icon: StretchHorizontal },
      { key: "line_sidewalk", label: "Calçada", icon: StretchHorizontal },
      { key: "line_arrow", label: "Seta direcional", icon: ArrowRight },
    ],
  },
  {
    id: "veiculos",
    title: "Veículos",
    tools: [
      { key: "vehicle_sedan", label: "Sedan", icon: Car },
      { key: "vehicle_suv", label: "SUV", icon: Car },
      { key: "vehicle_hatch", label: "Hatch", icon: Car },
      { key: "vehicle_truck", label: "Caminhão", icon: Truck },
      { key: "vehicle_moto", label: "Motocicleta", icon: Bike },
      { key: "vehicle_bike", label: "Bicicleta", icon: Bike },
    ],
  },
  {
    id: "pessoas",
    title: "Pessoas",
    tools: [
      { key: "marker_pedestrian", label: "Pedestre", icon: PersonStanding },
      { key: "marker_body", label: "Vítima / cadáver", icon: Footprints },
    ],
  },
  {
    id: "vestigios",
    title: "Vestígios",
    tools: [
      { key: "marker_x", label: "Ponto de colisão (X)", icon: X },
      { key: "marker_brake", label: "Marca de frenagem", icon: StretchHorizontal },
      { key: "marker_drag", label: "Marca de arrasto", icon: StretchHorizontal },
      { key: "marker_fluid", label: "Mancha de fluido", icon: Droplet },
      { key: "marker_blood", label: "Mancha de sangue", icon: Droplet },
      { key: "marker_debris", label: "Destroços / fragmentos", icon: MoreHorizontal },
    ],
  },
  {
    id: "anotacao",
    title: "Anotação",
    tools: [
      { key: "text", label: "Texto / etiqueta", icon: Type },
      { key: "measurement", label: "Medida / cota", icon: Ruler },
      { key: "set_scale", label: "Definir escala", icon: Crosshair },
    ],
  },
];

interface Props {
  activeTool: Tool;
  onSelectTool: (t: Tool) => void;
  canDelete: boolean;
  onDelete: () => void;
  canUndo: boolean;
  onUndo: () => void;
  canRedo: boolean;
  onRedo: () => void;
  canDuplicate: boolean;
  onDuplicate: () => void;
  onImportBackground: () => void;
  onPickFromDossie: () => void;
  hasBackground: boolean;
  bgLocked: boolean;
  onToggleBackgroundLock: () => void;
  bgOpacity: number;
  onChangeBackgroundOpacity: (v: number) => void;
  onInsertTemplate: (id: TemplateId) => void;
  onInsertInLaudo?: () => void;
  onSave: () => void;
  onExportPng: () => void;
  onBackToList: () => void;
  saving: boolean;
  exporting: boolean;
}

export function Toolbar({
  activeTool,
  onSelectTool,
  canDelete,
  onDelete,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  canDuplicate,
  onDuplicate,
  onImportBackground,
  onPickFromDossie,
  hasBackground,
  bgLocked,
  onToggleBackgroundLock,
  bgOpacity,
  onChangeBackgroundOpacity,
  onInsertTemplate,
  onInsertInLaudo,
  onSave,
  onExportPng,
  onBackToList,
  saving,
  exporting,
}: Props) {
  const [templatesOpen, setTemplatesOpen] = useState(false);

  return (
    <aside className={styles.toolbar} aria-label="Ferramentas do croqui">
      <button
        type="button"
        className={styles.backBtn}
        onClick={onBackToList}
        title="Voltar para a lista de croquis"
      >
        <ArrowLeft size={14} /> Voltar
      </button>

      {GROUPS.map((g) => (
        <ToolGroupView
          key={g.id}
          group={g}
          activeTool={activeTool}
          onSelectTool={onSelectTool}
          extra={
            g.id === "via" ? (
              <div className={styles.subAction}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => setTemplatesOpen((v) => !v)}
                  title="Inserir modelo de via pronto"
                >
                  <Workflow size={12} /> Modelos…
                </button>
                {templatesOpen && (
                  <div className={styles.dropdown}>
                    {Object.values(TEMPLATES).map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        className={styles.dropdownItem}
                        onClick={() => {
                          onInsertTemplate(t.id);
                          setTemplatesOpen(false);
                        }}
                        title={t.description}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null
          }
        />
      ))}

      {/* Imagem de fundo / Drone */}
      <div className={styles.group}>
        <div className={styles.groupTitle}>
          <ImageIcon size={11} /> Imagem
        </div>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={onImportBackground}
          title="Importar imagem do disco como fundo"
        >
          <ImageIcon size={12} /> Importar
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={onPickFromDossie}
          title="Usar uma foto do Dossiê como fundo"
        >
          <MapPin size={12} /> Do Dossiê
        </button>
        {hasBackground && (
          <>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={onToggleBackgroundLock}
              title={bgLocked ? "Desbloquear imagem de fundo" : "Bloquear imagem de fundo"}
            >
              <Layers size={12} />
              {bgLocked ? "Desbloquear fundo" : "Bloquear fundo"}
            </button>
            <label className={styles.slider}>
              <span>Opacidade</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={bgOpacity}
                onChange={(e) =>
                  onChangeBackgroundOpacity(Number(e.target.value))
                }
              />
              <span className={styles.sliderValue}>
                {Math.round(bgOpacity * 100)}%
              </span>
            </label>
          </>
        )}
      </div>

      {/* Edição básica (undo / redo / duplicate / delete) — fica perto do
          fundo da barra porque é ação contextual, não criação. */}
      <div className={styles.group}>
        <div className={styles.groupTitle}>Editar</div>
        <div className={styles.row}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onUndo}
            disabled={!canUndo}
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 size={12} />
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onRedo}
            disabled={!canRedo}
            title="Refazer (Ctrl+Y)"
          >
            <Redo2 size={12} />
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onDuplicate}
            disabled={!canDuplicate}
            title="Duplicar (Ctrl+D)"
          >
            <Plus size={12} />
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onDelete}
            disabled={!canDelete}
            title="Excluir (Del)"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      <div className={styles.spacer} />

      {/* Export. Save fica logo acima do Export para o fluxo "salvar → exportar" ser visual. */}
      <Button
        variant="secondary"
        leftIcon={<Save size={14} />}
        onClick={onSave}
        disabled={saving}
      >
        {saving ? "Salvando…" : "Salvar"}
      </Button>
      <Button
        variant="primary"
        leftIcon={<FileImage size={14} />}
        onClick={onExportPng}
        disabled={exporting}
      >
        {exporting ? "Exportando…" : "Exportar PNG"}
      </Button>
      {onInsertInLaudo && (
        <Button
          variant="secondary"
          leftIcon={<Square size={14} />}
          onClick={onInsertInLaudo}
        >
          Abrir Laudo
        </Button>
      )}
    </aside>
  );
}

function ToolGroupView({
  group,
  activeTool,
  onSelectTool,
  extra,
}: {
  group: ToolGroup;
  activeTool: Tool;
  onSelectTool: (t: Tool) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className={styles.group}>
      <div className={styles.groupTitle}>{group.title}</div>
      {group.tools.map((t) => (
        <ToolButton
          key={t.key}
          tool={t}
          active={activeTool === t.key}
          onSelect={onSelectTool}
        />
      ))}
      {extra}
    </div>
  );
}

function ToolButton({
  tool,
  active,
  onSelect,
}: {
  tool: ToolDef;
  active: boolean;
  onSelect: (t: Tool) => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.tool} ${active ? styles.toolActive : ""}`}
      onClick={() => onSelect(tool.key)}
      title={tool.hint ? `${tool.label} (${tool.hint})` : tool.label}
    >
      <tool.icon size={13} aria-hidden />
      <span>{tool.label}</span>
    </button>
  );
}
