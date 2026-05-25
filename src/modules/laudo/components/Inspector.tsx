/**
 * Inspector — right-side panel for the laudo editor.
 *
 * Tabs:
 *   1. Validações — DocumentWarning list from the validator.
 *   2. Estrutura — outline of headings.
 *   3. Cabeçalho — institutional header configuration.
 *   4. Página   — page margins (MVP 2 ajuste runtime 1.2).
 *   5. Dados    — metadata of the SicroDoc envelope (id, template, timestamps).
 */

import { useEffect, useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import {
  AlertTriangle,
  Info,
  LayoutTemplate,
  ListTree,
  ScrollText,
  Sparkles,
} from "lucide-react";
import {
  findInstitutionalTemplate,
  formatCm,
  marginsInCm,
  resolveEffectiveMargins,
  validateSicroDoc,
  type DocumentWarning,
  type SicroDoc,
} from "../document-engine";
import { useLaudoStore } from "../store/laudoStore";
import { useWorkspaceStore } from "@stores/workspaceStore";
import { formatDateTime } from "@core/formatters";
import { toSicroError } from "@core/errors";
import styles from "./Inspector.module.css";

interface InspectorProps {
  doc: SicroDoc | null;
}

type Tab = "outline" | "validation" | "header" | "page" | "meta";

export function Inspector({ doc }: InspectorProps) {
  const [tab, setTab] = useState<Tab>("validation");

  const warnings = useMemo<DocumentWarning[]>(
    () => (doc ? validateSicroDoc(doc) : []),
    [doc],
  );
  const outline = useMemo(() => (doc ? buildOutline(doc.content) : []), [doc]);

  return (
    <aside className={styles.inspector} aria-label="Inspetor do laudo">
      <div className={styles.tabs} role="tablist">
        <TabButton
          active={tab === "validation"}
          onClick={() => setTab("validation")}
          icon={<AlertTriangle size={14} />}
          label={`Validações (${warnings.length})`}
        />
        <TabButton
          active={tab === "outline"}
          onClick={() => setTab("outline")}
          icon={<ListTree size={14} />}
          label="Estrutura"
        />
        <TabButton
          active={tab === "header"}
          onClick={() => setTab("header")}
          icon={<ScrollText size={14} />}
          label="Cabeçalho"
        />
        <TabButton
          active={tab === "page"}
          onClick={() => setTab("page")}
          icon={<LayoutTemplate size={14} />}
          label="Página"
        />
        <TabButton
          active={tab === "meta"}
          onClick={() => setTab("meta")}
          icon={<Sparkles size={14} />}
          label="Dados"
        />
      </div>

      <div className={styles.body}>
        {tab === "validation" && (
          <ValidationPanel warnings={warnings} hasDoc={!!doc} />
        )}
        {tab === "outline" && <OutlinePanel items={outline} />}
        {tab === "header" && <HeaderPanel doc={doc} />}
        {tab === "page" && <PagePanel doc={doc} />}
        {tab === "meta" && <MetaPanel doc={doc} />}
      </div>
    </aside>
  );
}

function TabButton({
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
      role="tab"
      aria-selected={active}
      className={`${styles.tab} ${active ? styles.tabActive : ""}`}
      onClick={onClick}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {icon} {label}
      </span>
    </button>
  );
}

function ValidationPanel({
  warnings,
  hasDoc,
}: {
  warnings: DocumentWarning[];
  hasDoc: boolean;
}) {
  if (!hasDoc) {
    return <p className={styles.empty}>Abra um laudo para validar.</p>;
  }
  if (warnings.length === 0) {
    return (
      <>
        <h3 className={styles.sectionTitle}>Validações</h3>
        <p className={styles.empty}>Nenhum alerta. O laudo passa nas verificações do Spike B.</p>
      </>
    );
  }
  return (
    <>
      <h3 className={styles.sectionTitle}>Validações</h3>
      <ul className={styles.warningList}>
        {warnings.map((w) => (
          <li
            key={w.id}
            className={`${styles.warning} ${w.severity === "info" ? styles.info : ""}`}
          >
            <span
              className={styles.warningMessage}
              style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
            >
              {w.severity === "info" ? <Info size={12} /> : <AlertTriangle size={12} />}
              {w.message}
            </span>
            {w.hint && <span className={styles.warningHint}>{w.hint}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

interface OutlineItem {
  level: 1 | 2 | 3;
  text: string;
}

function OutlinePanel({ items }: { items: OutlineItem[] }) {
  if (items.length === 0) {
    return <p className={styles.empty}>Nenhuma seção declarada ainda.</p>;
  }
  return (
    <>
      <h3 className={styles.sectionTitle}>Estrutura</h3>
      <div className={styles.outlineList}>
        {items.map((item, idx) => (
          <div
            key={idx}
            className={`${styles.outlineItem} ${
              item.level === 1
                ? styles.outlineLevel1
                : item.level === 2
                  ? styles.outlineLevel2
                  : styles.outlineLevel3
            }`}
          >
            {item.text || "(sem título)"}
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Header configuration panel (MVP 2 ajuste runtime)

function HeaderPanel({ doc }: { doc: SicroDoc | null }) {
  const activeWorkspacePath = useWorkspaceStore((s) => s.activeWorkspacePath);
  const activeOccurrence = useWorkspaceStore((s) => s.activeOccurrence);
  const updateMetadata = useLaudoStore((s) => s.updateMetadata);

  // Local drafts for the editable metadata fields. Sync to `doc.metadata`
  // whenever the underlying laudo changes.
  const initialNumeroLaudo =
    (doc?.metadata?.numero_laudo as string | undefined) ?? "";
  const initialSetor = (doc?.metadata?.setor as string | undefined) ?? "";
  const [numeroLaudo, setNumeroLaudo] = useState(initialNumeroLaudo);
  const [setor, setSetor] = useState(initialSetor);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setNumeroLaudo(initialNumeroLaudo);
    setSetor(initialSetor);
  }, [initialNumeroLaudo, initialSetor]);

  if (!doc) {
    return (
      <p className={styles.empty}>
        Abra um laudo para configurar o cabeçalho institucional.
      </p>
    );
  }

  const commit = async (key: "numero_laudo" | "setor", value: string) => {
    if (!activeWorkspacePath) return;
    const current =
      key === "numero_laudo" ? initialNumeroLaudo : initialSetor;
    if (value.trim() === current.trim()) return;
    try {
      await updateMetadata(activeWorkspacePath, { [key]: value.trim() });
      setFeedback(`Campo "${labelOf(key)}" salvo.`);
      setTimeout(() => setFeedback(null), 2500);
    } catch (err) {
      setFeedback(`Falha: ${toSicroError(err).message}`);
    }
  };

  return (
    <>
      <h3 className={styles.sectionTitle}>Cabeçalho institucional</h3>
      <p
        style={{
          fontSize: "var(--text-xs)",
          color: "var(--sicro-fg-muted)",
          lineHeight: 1.5,
          marginTop: 0,
        }}
      >
        Configuração visual do laudo (template <strong>PCA Padrão v1</strong>).
        Estes campos não fazem parte do conteúdo editável — eles parametrizam
        o cabeçalho desenhado pelo SICRO.
      </p>

      <div className={styles.headerField}>
        <label htmlFor="hf-numero-laudo">Número do laudo</label>
        <input
          id="hf-numero-laudo"
          type="text"
          value={numeroLaudo}
          onChange={(e) => setNumeroLaudo(e.target.value)}
          onBlur={(e) => void commit("numero_laudo", e.target.value)}
          placeholder="Ex.: 12345/2026"
        />
      </div>

      <div className={styles.headerField}>
        <label htmlFor="hf-setor">Setor / departamento</label>
        <input
          id="hf-setor"
          type="text"
          value={setor}
          onChange={(e) => setSetor(e.target.value)}
          onBlur={(e) => void commit("setor", e.target.value)}
          placeholder="Ex.: DC/PCIAP"
        />
      </div>

      <div className={styles.headerReadOnly}>
        <h4 className={styles.subSectionTitle}>Do registro da ocorrência</h4>
        <p
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--sicro-fg-dim)",
            margin: "0 0 var(--space-2)",
          }}
        >
          Editar estes campos na Home, ao criar/editar a ocorrência.
        </p>
        <dl className={styles.metaList}>
          <dt>BO nº</dt>
          <dd>{activeOccurrence?.numero_bo ?? "—"}</dd>
          <dt>Tipo de perícia</dt>
          <dd>{activeOccurrence?.tipo_pericia ?? "—"}</dd>
          <dt>Município</dt>
          <dd>{activeOccurrence?.municipio ?? "—"}</dd>
        </dl>
      </div>

      {feedback && (
        <p
          style={{
            fontSize: "var(--text-xs)",
            color: feedback.startsWith("Falha")
              ? "var(--sicro-danger)"
              : "var(--sicro-success)",
            margin: 0,
          }}
        >
          {feedback}
        </p>
      )}
    </>
  );
}

function labelOf(key: "numero_laudo" | "setor"): string {
  return key === "numero_laudo" ? "Número do laudo" : "Setor / departamento";
}

// ---------------------------------------------------------------------------
// Page (margins) panel — MVP 2 ajuste runtime 1.2

function PagePanel({ doc }: { doc: SicroDoc | null }) {
  const activeWorkspacePath = useWorkspaceStore((s) => s.activeWorkspacePath);
  const updateLayout = useLaudoStore((s) => s.updateLayout);

  const template = doc
    ? findInstitutionalTemplate(doc.layout?.institutional_template)
    : null;
  const effective = doc
    ? marginsInCm(resolveEffectiveMargins(doc, template))
    : { top: 3, right: 2, bottom: 2.5, left: 3.5 };

  const [top, setTop] = useState(String(effective.top));
  const [right, setRight] = useState(String(effective.right));
  const [bottom, setBottom] = useState(String(effective.bottom));
  const [left, setLeft] = useState(String(effective.left));
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setTop(String(effective.top));
    setRight(String(effective.right));
    setBottom(String(effective.bottom));
    setLeft(String(effective.left));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.layout?.page?.margins, doc?.layout?.institutional_template]);

  if (!doc) {
    return (
      <p className={styles.empty}>Abra um laudo para configurar a página.</p>
    );
  }

  const commit = async (
    side: "top" | "right" | "bottom" | "left",
    raw: string,
  ) => {
    if (!activeWorkspacePath) return;
    const parsed = parseCmInput(raw);
    if (parsed == null) {
      setFeedback(`Valor inválido em "${labelOfSide(side)}". Use cm (ex.: 2.5).`);
      return;
    }
    if (parsed < 0 || parsed > 8) {
      setFeedback(
        `Margem ${labelOfSide(side)} fora do intervalo aceito (0–8 cm).`,
      );
      return;
    }
    const previous = effective[side];
    if (Math.abs(previous - parsed) < 0.001) return; // no-op
    try {
      await updateLayout(activeWorkspacePath, {
        page: {
          margins: {
            top: side === "top" ? formatCm(parsed) : formatCm(effective.top),
            right:
              side === "right" ? formatCm(parsed) : formatCm(effective.right),
            bottom:
              side === "bottom"
                ? formatCm(parsed)
                : formatCm(effective.bottom),
            left:
              side === "left" ? formatCm(parsed) : formatCm(effective.left),
          },
        },
      });
      setFeedback(`Margem ${labelOfSide(side)} = ${formatCm(parsed)} salva.`);
      setTimeout(() => setFeedback(null), 2500);
    } catch (err) {
      setFeedback(`Falha: ${toSicroError(err).message}`);
    }
  };

  const resetToTemplate = async () => {
    if (!activeWorkspacePath || !template) return;
    try {
      await updateLayout(activeWorkspacePath, {
        page: { margins: undefined },
      } as never);
      setFeedback("Margens restauradas para o template institucional.");
      setTimeout(() => setFeedback(null), 2500);
    } catch (err) {
      setFeedback(`Falha: ${toSicroError(err).message}`);
    }
  };

  const isOverride = !!doc.layout?.page?.margins;

  return (
    <>
      <h3 className={styles.sectionTitle}>Página (A4 retrato)</h3>
      <p
        style={{
          fontSize: "var(--text-xs)",
          color: "var(--sicro-fg-muted)",
          lineHeight: 1.5,
          marginTop: 0,
        }}
      >
        Margens em centímetros. A folha A4 no editor passa a respeitar estes
        valores imediatamente. PDF e DOCX (via `@page` e `PageMargin`) usam os
        mesmos valores ao exportar.
      </p>

      <div className={styles.marginGrid}>
        <MarginField
          label="Superior"
          value={top}
          onChange={setTop}
          onCommit={(v) => void commit("top", v)}
        />
        <MarginField
          label="Direita"
          value={right}
          onChange={setRight}
          onCommit={(v) => void commit("right", v)}
        />
        <MarginField
          label="Inferior"
          value={bottom}
          onChange={setBottom}
          onCommit={(v) => void commit("bottom", v)}
        />
        <MarginField
          label="Esquerda"
          value={left}
          onChange={setLeft}
          onCommit={(v) => void commit("left", v)}
        />
      </div>

      {isOverride && template && (
        <button
          type="button"
          className={styles.resetBtn}
          onClick={() => void resetToTemplate()}
        >
          Restaurar margens do template {template.name}
        </button>
      )}

      {feedback && (
        <p
          style={{
            fontSize: "var(--text-xs)",
            color: feedback.startsWith("Falha") || feedback.includes("inválido") || feedback.includes("fora")
              ? "var(--sicro-danger)"
              : "var(--sicro-success)",
            margin: 0,
          }}
        >
          {feedback}
        </p>
      )}

      <div className={styles.headerReadOnly}>
        <h4 className={styles.subSectionTitle}>Origem das margens</h4>
        <p
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--sicro-fg-dim)",
            margin: 0,
          }}
        >
          {isOverride
            ? "Os valores acima foram definidos para este laudo (override)."
            : `Os valores acima vêm do template institucional ${template?.name ?? "padrão"}.`}
        </p>
      </div>
    </>
  );
}

function MarginField({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
}) {
  return (
    <label className={styles.marginField}>
      <span>{label}</span>
      <div className={styles.marginInputWrap}>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onCommit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className={styles.marginUnit}>cm</span>
      </div>
    </label>
  );
}

function labelOfSide(side: "top" | "right" | "bottom" | "left"): string {
  switch (side) {
    case "top":
      return "Superior";
    case "right":
      return "Direita";
    case "bottom":
      return "Inferior";
    case "left":
      return "Esquerda";
  }
}

/** Accepts "2", "2.5", "2,5", "25mm", "2cm" etc. Returns cm or null. */
function parseCmInput(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const m = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(cm|mm)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (Number.isNaN(n)) return null;
  const unit = (m[2] ?? "cm").toLowerCase();
  return unit === "mm" ? n / 10 : n;
}

function MetaPanel({ doc }: { doc: SicroDoc | null }) {
  if (!doc) {
    return <p className={styles.empty}>Abra um laudo para ver os metadados.</p>;
  }
  return (
    <>
      <h3 className={styles.sectionTitle}>Metadados</h3>
      <dl className={styles.metaList}>
        <dt>document_id</dt>
        <dd>{doc.document_id}</dd>
        <dt>occurrence_id</dt>
        <dd>{doc.occurrence_id}</dd>
        <dt>template_id</dt>
        <dd>{doc.template_id}</dd>
        <dt>schema_version</dt>
        <dd>{doc.schema_version}</dd>
        <dt>criado em</dt>
        <dd>{formatDateTime(doc.created_at)}</dd>
        <dt>atualizado em</dt>
        <dd>{formatDateTime(doc.updated_at)}</dd>
      </dl>
    </>
  );
}

function buildOutline(content: JSONContent): OutlineItem[] {
  const items: OutlineItem[] = [];

  const walk = (node: JSONContent) => {
    if (node.type === "heading") {
      const level = Math.min(3, Math.max(1, (node.attrs?.level as number) ?? 1)) as
        | 1
        | 2
        | 3;
      let text = "";
      for (const c of node.content ?? []) {
        if (c.type === "text" && typeof c.text === "string") text += c.text;
      }
      items.push({ level, text: text.trim() });
    }
    for (const c of node.content ?? []) walk(c);
  };

  walk(content);
  return items;
}
