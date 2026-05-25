/**
 * Inspector — right-side panel for the laudo editor.
 *
 * Spike B exposes three tabs:
 *   1. Estrutura — outline of headings.
 *   2. Validações — DocumentWarning list from the validator.
 *   3. Dados — metadata of the SicroDoc envelope (id, template, timestamps).
 */

import { useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { AlertTriangle, Info, ListTree, Sparkles } from "lucide-react";
import {
  validateSicroDoc,
  type DocumentWarning,
  type SicroDoc,
} from "../document-engine";
import { formatDateTime } from "@core/formatters";
import styles from "./Inspector.module.css";

interface InspectorProps {
  doc: SicroDoc | null;
}

type Tab = "outline" | "validation" | "meta";

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
