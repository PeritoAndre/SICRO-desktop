/**
 * EditorToolbar — formatting controls + insert actions for the laudo editor.
 *
 * Spike B exposes the minimal set: heading levels, inline marks, lists,
 * alignment, and four insert actions (figure, table, storyboard, system data).
 * Save and HTML preview live here too because users expect them near the toolbar.
 */

import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Eye,
  FileSignature,
  Film,
  HelpCircle,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Save,
  Table as TableIcon,
  Tag,
  Underline as UnderlineIcon,
} from "lucide-react";
import { ExportMenu } from "./ExportMenu";
import type { SicroDoc } from "../document-engine";
import styles from "./EditorToolbar.module.css";

interface EditorToolbarProps {
  editor: Editor | null;
  isSaving: boolean;
  isPreviewOpen: boolean;
  onSave: () => void;
  onTogglePreview: () => void;
  /** Workspace + laudo id + current doc; required only by the export menu.
   *  When `laudoId`/`workspacePath` are missing the export menu is hidden.
   *  `laudoTitle` surfaces which laudo will be exported, so the user can't
   *  accidentally export the wrong one. */
  workspacePath?: string;
  laudoId?: string;
  laudoTitle?: string;
  doc?: SicroDoc | null;
  occurrence?: Record<string, unknown> | null;
}

export function EditorToolbar({
  editor,
  isSaving,
  isPreviewOpen,
  onSave,
  onTogglePreview,
  workspacePath,
  laudoId,
  laudoTitle,
  doc,
  occurrence,
}: EditorToolbarProps) {
  if (!editor) {
    return <div className={styles.toolbar} aria-hidden />;
  }

  const currentHeading: string = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
      ? "h2"
      : editor.isActive("heading", { level: 3 })
        ? "h3"
        : "p";

  const setStructure = (value: string) => {
    if (value === "p") {
      editor.chain().focus().setParagraph().run();
    } else {
      const level = Number(value.slice(1)) as 1 | 2 | 3;
      editor.chain().focus().toggleHeading({ level }).run();
    }
  };

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Barra de ferramentas do laudo">
      <div className={styles.group}>
        <select
          className={styles.select}
          value={currentHeading}
          onChange={(e) => setStructure(e.target.value)}
          aria-label="Estilo do bloco"
        >
          <option value="p">Texto</option>
          <option value="h1">Título</option>
          <option value="h2">Seção</option>
          <option value="h3">Subseção</option>
        </select>
      </div>

      <div className={styles.group}>
        <ToolBtn
          editor={editor}
          isActive={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          label="Negrito (Ctrl+B)"
        >
          <Bold size={14} />
        </ToolBtn>
        <ToolBtn
          editor={editor}
          isActive={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          label="Itálico (Ctrl+I)"
        >
          <Italic size={14} />
        </ToolBtn>
        <ToolBtn
          editor={editor}
          isActive={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          label="Sublinhado (Ctrl+U)"
        >
          <UnderlineIcon size={14} />
        </ToolBtn>
        <ToolBtn
          editor={editor}
          isActive={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
          label="Código inline"
        >
          <Code size={14} />
        </ToolBtn>
      </div>

      <div className={styles.group}>
        <ToolBtn
          editor={editor}
          isActive={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          label="Lista com marcadores"
        >
          <List size={14} />
        </ToolBtn>
        <ToolBtn
          editor={editor}
          isActive={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          label="Lista numerada"
        >
          <ListOrdered size={14} />
        </ToolBtn>
      </div>

      <div className={styles.group}>
        <ToolBtn
          editor={editor}
          isActive={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          label="Alinhar à esquerda"
        >
          <AlignLeft size={14} />
        </ToolBtn>
        <ToolBtn
          editor={editor}
          isActive={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          label="Centralizar"
        >
          <AlignCenter size={14} />
        </ToolBtn>
        <ToolBtn
          editor={editor}
          isActive={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          label="Alinhar à direita"
        >
          <AlignRight size={14} />
        </ToolBtn>
        <ToolBtn
          editor={editor}
          isActive={editor.isActive({ textAlign: "justify" })}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          label="Justificar"
        >
          <AlignJustify size={14} />
        </ToolBtn>
      </div>

      <div className={styles.group}>
        <button
          type="button"
          className={styles.btnLabel}
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertFigure({ kind: "image", caption: "Descrição da figura." })
              .run()
          }
        >
          <ImageIcon size={14} /> Figura
        </button>
        <button
          type="button"
          className={styles.btnLabel}
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          <TableIcon size={14} /> Tabela
        </button>
        <button
          type="button"
          className={styles.btnLabel}
          onClick={() => editor.chain().focus().insertStoryboard(2).run()}
        >
          <Film size={14} /> Storyboard
        </button>
        <button
          type="button"
          className={styles.btnLabel}
          onClick={() => editor.chain().focus().insertQuesitoList(1).run()}
          title="Inserir bloco de quesitos"
        >
          <HelpCircle size={14} /> Quesito
        </button>
        <button
          type="button"
          className={styles.btnLabel}
          onClick={() => editor.chain().focus().insertSignature().run()}
          title="Inserir bloco de assinatura"
        >
          <FileSignature size={14} /> Assinatura
        </button>
        <button
          type="button"
          className={styles.btnLabel}
          onClick={() =>
            editor.chain().focus().insertSystemData({
              source: "occurrence",
              field: "municipio",
              value: "Município: Macapá",
            }).run()
          }
        >
          <Tag size={14} /> Dado do sistema
        </button>
      </div>

      <div className={styles.spacer} />

      <button
        type="button"
        className={`${styles.btnLabel} ${isPreviewOpen ? styles.active : ""}`}
        onClick={onTogglePreview}
        aria-pressed={isPreviewOpen}
      >
        <Eye size={14} /> Prévia HTML
      </button>

      {workspacePath && laudoId && (
        <ExportMenu
          workspacePath={workspacePath}
          laudoId={laudoId}
          laudoTitle={laudoTitle}
          doc={doc ?? null}
          occurrence={occurrence ?? null}
        />
      )}

      <button
        type="button"
        className={styles.primary}
        onClick={onSave}
        disabled={isSaving}
      >
        <Save size={14} /> {isSaving ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}

interface ToolBtnProps {
  editor: Editor;
  isActive: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}

function ToolBtn({ isActive, onClick, label, children }: ToolBtnProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`${styles.btn} ${isActive ? styles.active : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
