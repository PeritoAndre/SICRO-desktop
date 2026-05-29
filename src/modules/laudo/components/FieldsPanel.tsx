/**
 * FieldsPanel — galeria de campos automáticos `{{var}}` exibidos no
 * popover "Campos" da barra superior.
 *
 * F5 — Funções:
 *
 *   1. Mostrar todos os campos do catálogo, agrupados por tipo.
 *   2. Para cada campo: chip com a key, valor resolvido (ou aviso de
 *      "não preenchido"), botão "Inserir" que dispara
 *      `editor.commands.insertFieldPlaceholder(key)` no cursor.
 *   3. Destacar campos OBRIGATÓRIOS ainda sem valor — base para o
 *      bloqueio de exportação que entra em F9.
 *
 * Reage ao `editor.on("update")` somente para re-render do destaque do
 * "campo onde está o cursor" (futuro F5.2). Por ora, é uma listagem
 * estável que se atualiza quando `doc.metadata` ou `occurrence` mudam.
 */

import type { Editor } from "@tiptap/react";
import { useMemo } from "react";
import { AlertCircle, CornerDownRight } from "lucide-react";
import {
  FIELD_GROUPS,
  fieldsByGroup,
  findMissingRequiredFields,
  groupLabel,
  LAUDO_FIELDS,
  resolveDefinition,
  type FieldResolveContext,
  type LaudoFieldDefinition,
  type SicroDoc,
} from "../document-engine";
import { useWorkspaceStore } from "@stores/workspaceStore";
import styles from "./FieldsPanel.module.css";

interface FieldsPanelProps {
  editor: Editor | null;
  doc: SicroDoc | null;
}

export function FieldsPanel({ editor, doc }: FieldsPanelProps) {
  const activeOccurrence = useWorkspaceStore((s) => s.activeOccurrence);

  const ctx = useMemo<FieldResolveContext>(
    () => ({
      metadata: doc?.metadata as Record<string, unknown> | undefined,
      occurrence: activeOccurrence as unknown as
        | Record<string, unknown>
        | undefined,
    }),
    [doc?.metadata, activeOccurrence],
  );

  // Lista de campos obrigatórios sem valor — exibida no topo como aviso.
  const missing = useMemo(
    () => findMissingRequiredFields(ctx, LAUDO_FIELDS),
    [ctx],
  );

  const insert = (def: LaudoFieldDefinition) => {
    if (!editor) return;
    editor.chain().focus().insertFieldPlaceholder(def.key).run();
  };

  if (!editor) {
    return (
      <p className={styles.empty}>
        Abra um laudo para inserir campos automáticos.
      </p>
    );
  }

  return (
    <>
      <h3 className={styles.sectionTitle}>Campos automáticos</h3>
      <p className={styles.intro}>
        Insere uma "pílula" reativa no cursor — ex: <code>{`{{numero_bo}}`}</code>.
        O valor é resolvido automaticamente a partir do caso/ocorrência.
        Quando os dados do caso mudam, TODOS os placeholders se atualizam.
      </p>

      {missing.length > 0 && (
        <div className={styles.warning}>
          <AlertCircle size={13} />
          <div>
            <strong>{missing.length}</strong> campo(s) obrigatório(s)
            ainda sem valor:&nbsp;
            {missing.map((f) => f.label).join(", ")}.
          </div>
        </div>
      )}

      {FIELD_GROUPS.map((group) => {
        const items = fieldsByGroup(group);
        if (items.length === 0) return null;
        return (
          <div key={group} className={styles.group}>
            <div className={styles.groupTitle}>{groupLabel(group)}</div>
            {items.map((def) => {
              const value = resolveDefinition(def, ctx).trim();
              const filled = value.length > 0;
              return (
                <button
                  key={def.key}
                  type="button"
                  className={`${styles.item} ${filled ? styles.itemFilled : styles.itemEmpty} ${def.required && !filled ? styles.itemMissing : ""}`}
                  onClick={() => insert(def)}
                  title={
                    def.description
                      ? `${def.description} — clique para inserir.`
                      : "Clique para inserir no cursor."
                  }
                >
                  <div className={styles.itemHeader}>
                    <span className={styles.itemLabel}>
                      {def.label}
                      {def.required && (
                        <span
                          className={styles.itemRequiredDot}
                          title="Obrigatório"
                          aria-label="Obrigatório"
                        />
                      )}
                    </span>
                    <code className={styles.itemKey}>{`{{${def.key}}}`}</code>
                  </div>
                  <div className={styles.itemValue}>
                    <CornerDownRight
                      size={11}
                      className={styles.itemValueIcon}
                    />
                    {filled ? (
                      <span className={styles.itemValueFilled}>{value}</span>
                    ) : (
                      <span className={styles.itemValueDash}>
                        (sem valor)
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
