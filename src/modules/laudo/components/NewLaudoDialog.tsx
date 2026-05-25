/**
 * NewLaudoDialog — pede título + template ao criar um laudo novo.
 *
 * Substitui o atalho "createLaudo direto com documento_livre" que existia
 * antes do MVP 2. Ao confirmar, gera o conteúdo inicial via
 * `findTemplate(id).build(title, occurrence)` e passa ao store, que persiste
 * imediatamente.
 */

import { useState, type FormEvent } from "react";
import { Dialog } from "@components/Dialog/Dialog";
import { Button } from "@components/Button/Button";
import { useLaudoStore } from "../store/laudoStore";
import { TEMPLATES, findTemplate, type OccurrenceContext } from "../document-engine";
import { toSicroError } from "@core/errors";
import type { Laudo } from "@domain/laudo";
import styles from "./NewLaudoDialog.module.css";

interface NewLaudoDialogProps {
  open: boolean;
  workspacePath: string;
  suggestedTitle: string;
  occurrence: OccurrenceContext | null;
  onClose: () => void;
  onCreated: (laudo: Laudo) => void;
}

export function NewLaudoDialog({
  open,
  workspacePath,
  suggestedTitle,
  occurrence,
  onClose,
  onCreated,
}: NewLaudoDialogProps) {
  const createLaudo = useLaudoStore((s) => s.createLaudo);
  const isMutating = useLaudoStore((s) => s.isMutating);

  const [title, setTitle] = useState(suggestedTitle);
  const [templateId, setTemplateId] = useState<string>("documento_livre");
  const [numeroLaudo, setNumeroLaudo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setError(null);
    setTitle(suggestedTitle);
    setTemplateId("documento_livre");
    setNumeroLaudo("");
    onClose();
  };

  // Reset suggested title whenever the dialog reopens with a new suggestion.
  if (open && title === "" && suggestedTitle) {
    setTitle(suggestedTitle);
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = title.trim() || "Laudo sem título";
    const template = findTemplate(templateId);
    const initialContent = template.build(trimmed, occurrence);
    const trimmedNumero = numeroLaudo.trim();
    const initialMetadata = trimmedNumero
      ? { numero_laudo: trimmedNumero }
      : undefined;

    try {
      const laudo = await createLaudo(
        workspacePath,
        { title: trimmed, template_id: templateId },
        initialContent,
        initialMetadata,
      );
      onCreated(laudo);
      close();
    } catch (err) {
      setError(toSicroError(err).message);
    }
  };

  return (
    <Dialog
      open={open}
      title="Novo laudo"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={isMutating}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            form="new-laudo-form"
            type="submit"
            disabled={isMutating}
          >
            {isMutating ? "Criando…" : "Criar laudo"}
          </Button>
        </>
      }
    >
      <form id="new-laudo-form" className={styles.form} onSubmit={submit}>
        <div className={styles.field}>
          <label htmlFor="laudo-title" className={styles.label}>
            Título do laudo
          </label>
          <input
            id="laudo-title"
            type="text"
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="laudo-numero" className={styles.label}>
            Número do laudo (opcional)
          </label>
          <input
            id="laudo-numero"
            type="text"
            className={styles.input}
            value={numeroLaudo}
            onChange={(e) => setNumeroLaudo(e.target.value)}
            placeholder="Ex.: 12345/2026"
          />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Template</span>
          <div className={styles.templateList} role="radiogroup">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={templateId === t.id}
                className={`${styles.templateOption} ${
                  templateId === t.id ? styles.templateOptionActive : ""
                }`}
                onClick={() => setTemplateId(t.id)}
              >
                <span className={styles.templateName}>{t.name}</span>
                <span className={styles.templateDescription}>{t.description}</span>
                <span className={styles.templateCategory}>{t.category}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}
      </form>
    </Dialog>
  );
}
