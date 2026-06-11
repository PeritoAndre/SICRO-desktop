/**
 * TablePropertiesDialog — propriedades da tabela inspirado no Word.
 *
 * F7.1 — 4 abas:
 *   - Tabela:  largura preferencial + alinhamento + borda
 *   - Linha:   altura preferencial
 *   - Coluna:  largura preferencial
 *   - Célula:  alinhamento vertical do conteúdo, padding
 *
 * Implementação simplificada — atualiza atributos `style` na tabela
 * via comandos `updateAttributes`. Não temos suporte completo ao
 * modelo "Borders & Shading" do Word; oferecemos os controles mais
 * usados (largura, alinhamento da tabela, cor de borda, alinhamento
 * vertical de célula).
 */

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  X,
  Table as TableIcon,
} from "lucide-react";
import styles from "./TablePropertiesDialog.module.css";

type Tab = "tabela" | "linha" | "coluna" | "celula";

interface TablePropertiesDialogProps {
  open: boolean;
  editor: Editor | null;
  onClose: () => void;
}

export function TablePropertiesDialog({
  open,
  editor,
  onClose,
}: TablePropertiesDialogProps) {
  const [tab, setTab] = useState<Tab>("tabela");

  // Estado: lemos atributos atuais da tabela quando o dialog abre.
  const [tableWidthCm, setTableWidthCm] = useState<string>("");
  const [tableAlign, setTableAlign] = useState<"left" | "center" | "right">(
    "left",
  );
  const [borderColor, setBorderColor] = useState<string>("#1a1a1a");
  const [borderWidthPx, setBorderWidthPx] = useState<string>("1");

  const [rowHeightCm, setRowHeightCm] = useState<string>("");
  const [colWidthCm, setColWidthCm] = useState<string>("");
  const [cellVAlign, setCellVAlign] = useState<"top" | "middle" | "bottom">(
    "top",
  );

  useEffect(() => {
    if (!open || !editor) return;
    // Lê atributos atuais — best-effort.
    const tableAttrs = editor.getAttributes("table") as Record<string, unknown>;
    setTableWidthCm(
      typeof tableAttrs["data-width-cm"] === "string"
        ? (tableAttrs["data-width-cm"] as string)
        : "",
    );
    setTableAlign(
      (tableAttrs["data-align"] as "left" | "center" | "right") ?? "left",
    );
    setBorderColor(
      (tableAttrs["data-border-color"] as string) ?? "#1a1a1a",
    );
    setBorderWidthPx(
      (tableAttrs["data-border-width"] as string) ?? "1",
    );
    setTab("tabela");
  }, [open, editor]);

  // Esc fecha.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleApply = () => {
    if (!editor) {
      onClose();
      return;
    }
    // Persistimos via `data-*` no nó table. O renderer (CSS + walker)
    // lê esses atributos para aplicar a formatação.
    const tableAttrs: Record<string, unknown> = {
      "data-width-cm": tableWidthCm || null,
      "data-align": tableAlign,
      "data-border-color": borderColor,
      "data-border-width": borderWidthPx,
    };
    editor.chain().focus().updateAttributes("table", tableAttrs).run();

    if (rowHeightCm) {
      editor
        .chain()
        .focus()
        .updateAttributes("tableRow", { "data-height-cm": rowHeightCm })
        .run();
    }
    if (colWidthCm) {
      editor
        .chain()
        .focus()
        .updateAttributes("tableCell", { "data-width-cm": colWidthCm })
        .run();
      editor
        .chain()
        .focus()
        .updateAttributes("tableHeader", { "data-width-cm": colWidthCm })
        .run();
    }
    // Cell vertical align: aplicamos a célula corrente.
    editor
      .chain()
      .focus()
      .updateAttributes("tableCell", { "data-valign": cellVAlign })
      .run();
    editor
      .chain()
      .focus()
      .updateAttributes("tableHeader", { "data-valign": cellVAlign })
      .run();

    onClose();
  };

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tableprops-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.dialog}>
        <header className={styles.header}>
          <strong id="tableprops-title">
            <TableIcon size={16} /> Propriedades da tabela
          </strong>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </header>

        <div className={styles.tabs} role="tablist">
          <TabButton active={tab === "tabela"} onClick={() => setTab("tabela")}>
            Tabela
          </TabButton>
          <TabButton active={tab === "linha"} onClick={() => setTab("linha")}>
            Linha
          </TabButton>
          <TabButton active={tab === "coluna"} onClick={() => setTab("coluna")}>
            Coluna
          </TabButton>
          <TabButton active={tab === "celula"} onClick={() => setTab("celula")}>
            Célula
          </TabButton>
        </div>

        <div className={styles.body}>
          {tab === "tabela" && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Tamanho</div>
              <label className={styles.field}>
                <span>Largura preferencial</span>
                <div className={styles.inputUnit}>
                  <input
                    type="text"
                    value={tableWidthCm}
                    onChange={(e) => setTableWidthCm(e.target.value)}
                    placeholder="auto"
                  />
                  <span>cm</span>
                </div>
              </label>

              <div className={styles.sectionTitle}>Alinhamento</div>
              <div className={styles.alignGroup}>
                <AlignBtn
                  active={tableAlign === "left"}
                  onClick={() => setTableAlign("left")}
                  icon={<AlignLeft size={16} />}
                  label="À esquerda"
                />
                <AlignBtn
                  active={tableAlign === "center"}
                  onClick={() => setTableAlign("center")}
                  icon={<AlignCenter size={16} />}
                  label="Centralizada"
                />
                <AlignBtn
                  active={tableAlign === "right"}
                  onClick={() => setTableAlign("right")}
                  icon={<AlignRight size={16} />}
                  label="À direita"
                />
              </div>

              <div className={styles.sectionTitle}>Bordas</div>
              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span>Cor da borda</span>
                  <input
                    type="color"
                    value={borderColor}
                    onChange={(e) => setBorderColor(e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span>Espessura</span>
                  <div className={styles.inputUnit}>
                    <input
                      type="number"
                      min={0}
                      max={4}
                      step={0.5}
                      value={borderWidthPx}
                      onChange={(e) => setBorderWidthPx(e.target.value)}
                    />
                    <span>px</span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {tab === "linha" && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Tamanho da linha</div>
              <label className={styles.field}>
                <span>Altura preferencial</span>
                <div className={styles.inputUnit}>
                  <input
                    type="text"
                    value={rowHeightCm}
                    onChange={(e) => setRowHeightCm(e.target.value)}
                    placeholder="auto"
                  />
                  <span>cm</span>
                </div>
              </label>
              <p className={styles.hint}>
                Aplica à linha onde está o cursor. Deixe em branco para
                permitir que o conteúdo defina a altura.
              </p>
            </div>
          )}

          {tab === "coluna" && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Tamanho da coluna</div>
              <label className={styles.field}>
                <span>Largura preferencial</span>
                <div className={styles.inputUnit}>
                  <input
                    type="text"
                    value={colWidthCm}
                    onChange={(e) => setColWidthCm(e.target.value)}
                    placeholder="auto"
                  />
                  <span>cm</span>
                </div>
              </label>
              <p className={styles.hint}>
                Aplica à coluna onde está o cursor.
              </p>
            </div>
          )}

          {tab === "celula" && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                Alinhamento vertical do conteúdo
              </div>
              <div className={styles.alignGroup}>
                <AlignBtn
                  active={cellVAlign === "top"}
                  onClick={() => setCellVAlign("top")}
                  icon={<span style={{ fontSize: 14 }}>⬆</span>}
                  label="Topo"
                />
                <AlignBtn
                  active={cellVAlign === "middle"}
                  onClick={() => setCellVAlign("middle")}
                  icon={<span style={{ fontSize: 14 }}>↕</span>}
                  label="Centro"
                />
                <AlignBtn
                  active={cellVAlign === "bottom"}
                  onClick={() => setCellVAlign("bottom")}
                  icon={<span style={{ fontSize: 14 }}>⬇</span>}
                  label="Base"
                />
              </div>
              <p className={styles.hint}>
                Aplica à célula onde está o cursor.
              </p>
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleApply}
          >
            OK
          </button>
        </footer>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`${styles.tab} ${active ? styles.tabActive : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function AlignBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`${styles.alignBtn} ${active ? styles.alignBtnActive : ""}`}
      onClick={onClick}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
