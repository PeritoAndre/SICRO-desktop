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
  ArrowRight,
  Bold,
  Circle,
  Code,
  Eraser,
  Eye,
  Highlighter,
  Italic,
  KeyRound,
  Landmark,
  List,
  ListOrdered,
  Minus,
  Palette,
  Save,
  Search,
  Shapes,
  Square,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Underline as UnderlineIcon,
} from "lucide-react";
// (useState já é importado mais abaixo no arquivo via o sub-componente
//  ColorPickerBtn; reaproveitamos aqui também.)
import { commands } from "@core/commands";
import { useSigdocsStore } from "@stores/sigdocsStore";
import { SigdocsCredentialsDialog } from "./SigdocsCredentialsDialog";
import { exportLaudo } from "../services/laudoExport";
import { ExportMenu } from "./ExportMenu";
import type { SicroDoc } from "../document-engine";
import styles from "./EditorToolbar.module.css";

// F2 — Edição rica.
//
// Catálogos de fontes e tamanhos exibidos nos dropdowns. Lista deliberadamente
// curta para evitar paralisia de escolha — peritos usam tipicamente 3-4 fontes
// padrão e tamanhos institucionais. Caller pode usar `setFontFamily(family)`
// com qualquer string CSS válida se precisar de algo fora desta lista.
const FONT_FAMILIES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Fonte padrão" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Times New Roman, serif", label: "Times New Roman" },
  { value: "Calibri, sans-serif", label: "Calibri" },
  { value: "Cambria, serif", label: "Cambria" },
  { value: "Verdana, sans-serif", label: "Verdana" },
  { value: "Courier New, monospace", label: "Courier New" },
];

const FONT_SIZES: ReadonlyArray<string> = [
  "8pt",
  "9pt",
  "10pt",
  "11pt",
  "12pt",
  "13pt",
  "14pt",
  "16pt",
  "18pt",
  "20pt",
  "24pt",
];

// Paleta de cores enxuta para texto + realce. Cobre as cores periciais
// comuns: preto/cinza, vermelho (atenção), azul (referência), verde (ok),
// amarelo (marca-texto padrão).
const FONT_COLORS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "#0f172a", label: "Preto" },
  { value: "#475569", label: "Cinza" },
  { value: "#dc2626", label: "Vermelho" },
  { value: "#2563eb", label: "Azul" },
  { value: "#16a34a", label: "Verde" },
  { value: "#ca8a04", label: "Ocre" },
];

const HIGHLIGHT_COLORS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "#fde68a", label: "Amarelo" },
  { value: "#bbf7d0", label: "Verde" },
  { value: "#bfdbfe", label: "Azul" },
  { value: "#fecaca", label: "Rosa" },
  { value: "#e9d5ff", label: "Lilás" },
];

interface EditorToolbarProps {
  editor: Editor | null;
  isSaving: boolean;
  isPreviewOpen: boolean;
  onSave: () => void;
  onTogglePreview: () => void;
  /**
   * F2 — abre a barra de localizar/substituir. Quando omitido, o botão
   * "Localizar" fica oculto.
   */
  onOpenFind?: () => void;
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
  onOpenFind,
  workspacePath,
  laudoId,
  laudoTitle,
  doc,
  occurrence,
}: EditorToolbarProps) {
  // J — Estado do cover do SIGDOC. Click no botão SIGDOCS abre o
  // portal cobrindo o editor. Fluxo completo:
  //   1. Pega URL do SIGDOC do manifest.
  //   2. Mede bounds do .body do editor (via querySelector — viável
  //      porque sabemos a estrutura do LaudoEditorView).
  //   3. Abre o webview cover. ResizeObserver no host mantém posição.
  // Se houver um laudo finalizado com PDF disponível, também exporta
  // o PDF e abre o Explorer (fluxo "assinar" comum). Senão, só abre.
  const sigdocsCoverOpen = useSigdocsStore((s) => s.coverOpen);
  const setSigdocsCoverOpen = useSigdocsStore((s) => s.setCoverOpen);
  // K — Modal de gerenciamento de credenciais SIGDOC.
  const [credentialsDialogOpen, setCredentialsDialogOpen] = useState(false);

  const handleToggleSigdocs = async () => {
    if (!workspacePath) return;
    if (sigdocsCoverOpen) {
      setSigdocsCoverOpen(false);
      await commands.closeSigdocsCover().catch(() => {
        /* silent */
      });
      return;
    }
    try {
      // K — Antes de abrir o SIGDOC, exporta o PDF do laudo atual e
      // abre o Explorer na pasta (revealAfter=true por padrão no
      // helper). Assim o perito já tem o arquivo pronto pra arrastar
      // pro portal (que bloqueia Ctrl+V).
      if (laudoId && doc) {
        try {
          const { pushToast, dismissToast } = await import(
            "@/components/toast/toastStore"
          );
          const toastId = pushToast("progress", "Gerando PDF do laudo…", {
            title: "Preparando para SIGDOC",
          });
          try {
            await exportLaudo(
              "pdf",
              workspacePath,
              laudoId,
              doc,
              (occurrence as Record<string, unknown> | null) ?? null,
            );
            dismissToast(toastId);
            pushToast(
              "success",
              "PDF pronto na pasta — arraste para o SIGDOC após o login.",
              { title: "PDF exportado", durationMs: 6000 },
            );
          } catch (err) {
            dismissToast(toastId);
            pushToast(
              "warn",
              `PDF não foi gerado (${(err as Error)?.message ?? "erro"}). Você ainda pode usar o SIGDOC normalmente.`,
            );
          }
        } catch {
          /* toast load failed — non-fatal */
        }
      }

      // Abre o cover SIGDOC.
      const cfg = await commands.getSigdocsUrl(workspacePath);
      const bodyEl = document.querySelector<HTMLElement>(
        '[data-sigdocs-cover-body="1"]',
      );
      const rect = bodyEl?.getBoundingClientRect();
      const headerH = 36; // mesmo do SigdocsCoverHost
      const initial = rect
        ? {
            x: rect.left,
            y: rect.top + headerH,
            width: rect.width,
            height: Math.max(50, rect.height - headerH),
          }
        : { x: 200, y: 120, width: 1000, height: 600 };
      await commands.openSigdocsCover(cfg.url, initial);
      setSigdocsCoverOpen(true);
    } catch (err) {
      console.warn("[SIGDOC] cover open failed", err);
    }
  };
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

  // F2 — Helpers para cor, realce, fonte, tamanho.
  // Atributos atuais lidos via `editor.getAttributes("textStyle")` para
  // pre-selecionar dropdowns/cores. Quando não há textStyle ativo, retorna
  // strings vazias (== "Fonte padrão" no select).
  const textStyleAttrs = editor.getAttributes("textStyle") as {
    color?: string;
    fontFamily?: string;
    fontSize?: string;
  };
  // Pós-laudo S — defaults Times New Roman 12pt. Quando o usuário ainda
  // não escolheu fonte/tamanho explicitamente, mostramos esses valores
  // no dropdown (em vez de "Fonte padrão" / "Tam.") pra fechar o gap
  // de feedback visual.
  const currentFontFamily =
    textStyleAttrs.fontFamily ?? "Times New Roman, serif";
  const currentFontSize = textStyleAttrs.fontSize ?? "12pt";
  const currentColor = textStyleAttrs.color ?? "";

  // Pós-laudo S — atributos de espaçamento do bloco ativo (parágrafo
  // ou heading mais próximo). Usados pelos controles de line-height +
  // space before/after da toolbar.
  const blockAttrs = (editor.getAttributes("paragraph") ?? {}) as {
    line_height?: number;
    space_before_pt?: number;
    space_after_pt?: number;
    first_line_indent_cm?: number;
  };
  const headingAttrs = (editor.getAttributes("heading") ?? {}) as {
    line_height?: number;
    space_before_pt?: number;
    space_after_pt?: number;
    first_line_indent_cm?: number;
  };
  const currentLineHeight =
    Number(blockAttrs.line_height) || Number(headingAttrs.line_height) || 0;
  const currentSpaceBefore =
    Number(blockAttrs.space_before_pt) ||
    Number(headingAttrs.space_before_pt) ||
    0;
  const currentSpaceAfter =
    Number(blockAttrs.space_after_pt) ||
    Number(headingAttrs.space_after_pt) ||
    0;

  const setLineHeight = (raw: string) => {
    const v = Number.parseFloat(raw);
    editor
      .chain()
      .focus()
      .setParagraphLineHeight(Number.isFinite(v) ? v : 0)
      .run();
  };
  const setSpaceBefore = (raw: string) => {
    const v = Number.parseFloat(raw);
    editor
      .chain()
      .focus()
      .setParagraphSpaceBefore(Number.isFinite(v) ? v : 0)
      .run();
  };
  const setSpaceAfter = (raw: string) => {
    const v = Number.parseFloat(raw);
    editor
      .chain()
      .focus()
      .setParagraphSpaceAfter(Number.isFinite(v) ? v : 0)
      .run();
  };

  const setFontFamily = (value: string) => {
    if (!value) {
      editor.chain().focus().unsetFontFamily().run();
    } else {
      editor.chain().focus().setFontFamily(value).run();
    }
  };
  const setFontSize = (value: string) => {
    if (!value) {
      editor.chain().focus().unsetFontSize().run();
    } else {
      editor.chain().focus().setFontSize(value).run();
    }
  };
  const setColor = (color: string) => {
    editor.chain().focus().setColor(color).run();
  };
  const unsetColor = () => {
    editor.chain().focus().unsetColor().run();
  };
  const setHighlight = (color: string) => {
    editor.chain().focus().toggleHighlight({ color }).run();
  };
  const unsetHighlight = () => {
    editor.chain().focus().unsetHighlight().run();
  };

  // Limpar formatação — remove todas as marcas e converte para parágrafo.
  const clearFormatting = () => {
    editor.chain().focus().unsetAllMarks().clearNodes().run();
  };

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Barra de ferramentas do laudo">
      <div className={styles.group}>
        <select
          className={styles.select}
          value={currentHeading}
          onChange={(e) => setStructure(e.target.value)}
          aria-label="Estilo do bloco"
          title="Estilo do bloco"
        >
          <option value="p">Texto</option>
          <option value="h1">Título</option>
          <option value="h2">Seção</option>
          <option value="h3">Subseção</option>
        </select>
        <select
          className={styles.select}
          value={currentFontFamily}
          onChange={(e) => setFontFamily(e.target.value)}
          aria-label="Fonte"
          title="Família da fonte"
          style={{ minWidth: 110 }}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          value={currentFontSize}
          onChange={(e) => setFontSize(e.target.value)}
          aria-label="Tamanho"
          title="Tamanho da fonte"
          style={{ minWidth: 64 }}
        >
          <option value="">Tam.</option>
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Pós-laudo S — Grupo de espaçamento (entrelinhas + antes/depois). */}
      <div className={styles.group} title="Espaçamento do parágrafo">
        <select
          className={styles.select}
          value={currentLineHeight || ""}
          onChange={(e) => setLineHeight(e.target.value)}
          aria-label="Entrelinhas"
          title="Espaçamento entre linhas"
          style={{ minWidth: 70 }}
        >
          <option value="">Linhas</option>
          <option value="1">1.0</option>
          <option value="1.15">1.15</option>
          <option value="1.5">1.5</option>
          <option value="2">2.0</option>
          <option value="2.5">2.5</option>
          <option value="3">3.0</option>
        </select>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: "var(--sicro-fg-dim)",
          }}
          title="Espaço antes do parágrafo (em pontos)"
        >
          ↑
          <input
            type="number"
            min={0}
            max={72}
            step={1}
            value={currentSpaceBefore || ""}
            placeholder="0"
            onChange={(e) => setSpaceBefore(e.target.value)}
            style={{
              width: 48,
              padding: "2px 4px",
              fontSize: 11,
              background: "#fff",
              color: "#1a2a4a",
              border: "1px solid var(--sicro-border)",
              borderRadius: 3,
            }}
            aria-label="Espaço antes (pt)"
          />
          pt
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: "var(--sicro-fg-dim)",
          }}
          title="Espaço depois do parágrafo (em pontos)"
        >
          ↓
          <input
            type="number"
            min={0}
            max={72}
            step={1}
            value={currentSpaceAfter || ""}
            placeholder="0"
            onChange={(e) => setSpaceAfter(e.target.value)}
            style={{
              width: 48,
              padding: "2px 4px",
              fontSize: 11,
              background: "#fff",
              color: "#1a2a4a",
              border: "1px solid var(--sicro-border)",
              borderRadius: 3,
            }}
            aria-label="Espaço depois (pt)"
          />
          pt
        </label>
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
          isActive={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          label="Tachado (Ctrl+Shift+X)"
        >
          <Strikethrough size={14} />
        </ToolBtn>
        <ToolBtn
          editor={editor}
          isActive={editor.isActive("subscript")}
          onClick={() => editor.chain().focus().toggleSubscript().run()}
          label="Subscrito"
        >
          <SubscriptIcon size={14} />
        </ToolBtn>
        <ToolBtn
          editor={editor}
          isActive={editor.isActive("superscript")}
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
          label="Sobrescrito"
        >
          <SuperscriptIcon size={14} />
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
        <ColorPickerBtn
          icon={<Palette size={14} />}
          label="Cor do texto"
          current={currentColor}
          palette={FONT_COLORS}
          onSelect={setColor}
          onClear={unsetColor}
        />
        <ColorPickerBtn
          icon={<Highlighter size={14} />}
          label="Marca-texto"
          current={editor.getAttributes("highlight")["color"] as string | undefined}
          palette={HIGHLIGHT_COLORS}
          onSelect={setHighlight}
          onClear={unsetHighlight}
        />
        <ToolBtn
          editor={editor}
          isActive={false}
          onClick={clearFormatting}
          label="Limpar formatação"
        >
          <Eraser size={14} />
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

      {/* F7 — Removida a antiga seção "Inserir" da toolbar (Figura,
           Tabela, Storyboard, Quesito, Assinatura, Dado do sistema).
           Cada item agora vem por outro canal:
             - Figura/Prancha → menu superior "Figuras" (F6)
             - Tabela         → menu superior "Tabela" (F7, contextual)
             - Storyboard     → Inspector aba "Evidências"
             - Quesito        → estilo `quesito` no menu "Estilos" (Ctrl+Alt+6)
             - Assinatura     → templates já trazem; estilo `assinatura`
             - Dado do sistema → menu superior "Campos" (F5) com `{{var}}`
           A toolbar fica focada em FORMATAÇÃO de texto. */}

      {/* Q — Botão Inserir Forma com dropdown */}
      <InsertShapeMenu editor={editor} />

      <div className={styles.spacer} />

      {onOpenFind && (
        <button
          type="button"
          className={styles.btnLabel}
          onClick={onOpenFind}
          title="Localizar (Ctrl+F)"
        >
          <Search size={14} /> Localizar
        </button>
      )}

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

      {/* J/K — Botão SIGDOC: exporta PDF + abre Explorer + cobre área
          do laudo com o portal. Credenciais salvas → autofill no login. */}
      {workspacePath && (
        <>
          <button
            type="button"
            className={`${styles.btnLabel} ${sigdocsCoverOpen ? styles.active : ""}`}
            onClick={() => void handleToggleSigdocs()}
            aria-pressed={sigdocsCoverOpen}
            title={
              sigdocsCoverOpen
                ? "Fechar painel SIGDOC"
                : "Exportar PDF + abrir SIGDOC para assinatura"
            }
          >
            <Landmark size={14} />{" "}
            {sigdocsCoverOpen ? "Fechar SIGDOC" : "SIGDOC"}
          </button>
          <button
            type="button"
            className={styles.btn}
            onClick={() => setCredentialsDialogOpen(true)}
            title="Gerenciar credenciais do SIGDOC (autofill)"
            aria-label="Gerenciar credenciais do SIGDOC"
          >
            <KeyRound size={13} />
          </button>
        </>
      )}

      <button
        type="button"
        className={styles.primary}
        onClick={onSave}
        disabled={isSaving}
        title="Salvar (Ctrl+S)"
      >
        <Save size={14} /> {isSaving ? "Salvando…" : "Salvar"}
      </button>

      {/* K — Modal de credenciais SIGDOC (autofill no cover). */}
      <SigdocsCredentialsDialog
        open={credentialsDialogOpen}
        onClose={() => setCredentialsDialogOpen(false)}
      />
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

// ===========================================================================
// ColorPickerBtn — botão único com popover de cores.
//
// Versão minimalista (sem dependência externa): clica para abrir/fechar uma
// grade de cores fixas. Pequeno + previsível, e fecha com click-outside.
// Para cores arbitrárias o caller pode adicionar um `<input type="color">`
// mais tarde; mantemos a paleta restrita por padrão pericial.

import { useEffect, useRef, useState } from "react";

interface ColorPickerBtnProps {
  icon: React.ReactNode;
  label: string;
  current?: string | null;
  palette: ReadonlyArray<{ value: string; label: string }>;
  onSelect: (color: string) => void;
  onClear: () => void;
}

function ColorPickerBtn({
  icon,
  label,
  current,
  palette,
  onSelect,
  onClear,
}: ColorPickerBtnProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className={styles.colorWrap} ref={wrapRef}>
      <button
        type="button"
        title={label}
        aria-label={label}
        className={styles.btn}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "relative",
          paddingBottom: 14,
        }}
      >
        {icon}
        <span
          className={styles.colorSwatch}
          style={{ background: current || "transparent" }}
          aria-hidden
        />
      </button>
      {open && (
        <div className={styles.colorMenu} role="menu">
          <div className={styles.colorGrid}>
            {palette.map((c) => (
              <button
                key={c.value}
                type="button"
                className={styles.colorChip}
                style={{ background: c.value }}
                title={c.label}
                aria-label={c.label}
                onClick={() => {
                  onSelect(c.value);
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <button
            type="button"
            className={styles.colorReset}
            onClick={() => {
              onClear();
              setOpen(false);
            }}
          >
            Remover
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Q — InsertShapeMenu: dropdown pra inserir formas (rect, ellipse, arrow, line)
// ============================================================================

function InsertShapeMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const insert = (kind: "rectangle" | "ellipse" | "arrow" | "line") => {
    // Centro aproximado da página de laudo (A4 com margens típicas).
    // Wrap_x/wrap_y são relativos ao .sicro-editor-content. Posiciona
    // um pouco offset pra não cair sempre no mesmo ponto se inserir várias.
    const jitter = Math.random() * 1.5;
    editor.commands.insertShape({
      kind,
      wrap_mode: "in_front",
      wrap_x_cm: 4 + jitter,
      wrap_y_cm: 4 + jitter,
    });
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        className={styles.btnLabel}
        onClick={() => setOpen((v) => !v)}
        title="Inserir forma"
      >
        <Shapes size={14} /> Forma
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            background: "#fff",
            border: "1px solid #c9d2e6",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            padding: 4,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 2,
            minWidth: 180,
            zIndex: 100,
          }}
        >
          <button
            type="button"
            onClick={() => insert("rectangle")}
            style={shapeMenuItemStyle}
            title="Retângulo"
          >
            <Square size={14} />
            <span>Retângulo</span>
          </button>
          <button
            type="button"
            onClick={() => insert("ellipse")}
            style={shapeMenuItemStyle}
            title="Elipse / Círculo"
          >
            <Circle size={14} />
            <span>Elipse</span>
          </button>
          <button
            type="button"
            onClick={() => insert("arrow")}
            style={shapeMenuItemStyle}
            title="Seta"
          >
            <ArrowRight size={14} />
            <span>Seta</span>
          </button>
          <button
            type="button"
            onClick={() => insert("line")}
            style={shapeMenuItemStyle}
            title="Linha"
          >
            <Minus size={14} />
            <span>Linha</span>
          </button>
        </div>
      )}
    </div>
  );
}

const shapeMenuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: 12,
  color: "#1a2a4a",
  borderRadius: 3,
  textAlign: "left",
};
