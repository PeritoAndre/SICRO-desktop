/**
 * Toolbar — left vertical strip with the available tools, the file/scale
 * actions and the export buttons. Tools mutate `editor.tool`; actions
 * trigger callbacks bubbled by the editor.
 */

import {
  Image as ImageIcon,
  MousePointer2,
  Hand,
  Square,
  Minus,
  X,
  Type,
  Ruler,
  Compass,
  Save,
  FileImage,
  Undo2,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@components/Button/Button";
import type { Tool } from "./useEditorState";
import styles from "./Toolbar.module.css";

interface ToolDef {
  key: Tool;
  label: string;
  icon: LucideIcon;
  hint?: string;
}

const TOOLS: ToolDef[] = [
  { key: "select", label: "Selecionar", icon: MousePointer2, hint: "V" },
  { key: "pan", label: "Mover canvas", icon: Hand, hint: "H" },
  { key: "vehicle", label: "Veículo", icon: Square },
  { key: "line_road", label: "Via / Linha", icon: Minus },
  { key: "line_r1", label: "R1", icon: Minus },
  { key: "line_r2", label: "R2", icon: Minus },
  { key: "marker_x", label: "Ponto de colisão (X)", icon: X },
  { key: "text", label: "Texto", icon: Type },
  { key: "measurement", label: "Medida", icon: Ruler },
  { key: "set_scale", label: "Definir escala", icon: Compass },
];

interface Props {
  activeTool: Tool;
  onSelectTool: (t: Tool) => void;
  canDelete: boolean;
  onDelete: () => void;
  canUndo: boolean;
  onUndo: () => void;
  onImportBackground: () => void;
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
  onImportBackground,
  onSave,
  onExportPng,
  onBackToList,
  saving,
  exporting,
}: Props) {
  return (
    <aside className={styles.toolbar}>
      <button
        type="button"
        className={styles.backBtn}
        onClick={onBackToList}
        title="Voltar para a lista de croquis"
      >
        <ArrowLeft size={14} /> Voltar
      </button>

      <div className={styles.group}>
        {TOOLS.map((t) => (
          <ToolButton
            key={t.key}
            tool={t}
            active={activeTool === t.key}
            onSelect={onSelectTool}
          />
        ))}
      </div>

      <div className={styles.group}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={onUndo}
          disabled={!canUndo}
          title="Desfazer (Ctrl+Z)"
        >
          <Undo2 size={14} />
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={onDelete}
          disabled={!canDelete}
          title="Excluir objeto selecionado (Del)"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className={styles.spacer} />

      <button
        type="button"
        className={styles.actionBtn}
        onClick={onImportBackground}
        title="Importar imagem de fundo"
      >
        <ImageIcon size={14} />
        <span>Imagem</span>
      </button>

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
    </aside>
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
      <tool.icon size={14} aria-hidden />
      <span>{tool.label}</span>
    </button>
  );
}
