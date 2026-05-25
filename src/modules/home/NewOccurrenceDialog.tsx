import { useState, type FormEvent } from "react";
import { open as openDirDialog } from "@tauri-apps/plugin-dialog";
import { Folder } from "lucide-react";
import { Dialog } from "@components/Dialog/Dialog";
import { Button } from "@components/Button/Button";
import { useWorkspaceStore } from "@stores/workspaceStore";
import { toSicroError } from "@core/errors";
import type { NewOccurrenceInput, LoadedOccurrence } from "@domain/occurrence";
import styles from "./NewOccurrenceDialog.module.css";

interface NewOccurrenceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (loaded: LoadedOccurrence) => void;
}

interface FormState {
  numero_bo: string;
  protocolo: string;
  tipo_pericia: string;
  municipio: string;
  peritos: string;
  parent_directory: string;
}

const empty: FormState = {
  numero_bo: "",
  protocolo: "",
  tipo_pericia: "",
  municipio: "",
  peritos: "",
  parent_directory: "",
};

export function NewOccurrenceDialog({
  open,
  onClose,
  onCreated,
}: NewOccurrenceDialogProps) {
  const create = useWorkspaceStore((s) => s.createOccurrence);
  const isMutating = useWorkspaceStore((s) => s.isMutating);
  const [form, setForm] = useState<FormState>(empty);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setForm(empty);
    setError(null);
    onClose();
  };

  const setField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const pickDirectory = async () => {
    try {
      const selected = await openDirDialog({
        directory: true,
        multiple: false,
        title: "Selecione a pasta onde o workspace .sicro será criado",
      });
      if (typeof selected === "string") {
        setField("parent_directory", selected);
      }
    } catch (err) {
      setError(toSicroError(err).message);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const peritos = form.peritos
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    const input: NewOccurrenceInput = {
      numero_bo: form.numero_bo.trim() || null,
      protocolo: form.protocolo.trim() || null,
      tipo_pericia: form.tipo_pericia.trim() || null,
      municipio: form.municipio.trim() || null,
      peritos,
      parent_directory: form.parent_directory.trim() || null,
    };

    try {
      const loaded = await create(input);
      onCreated(loaded);
      close();
    } catch (err) {
      setError(toSicroError(err).message);
    }
  };

  return (
    <Dialog
      open={open}
      title="Nova ocorrência"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={isMutating}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            form="new-occurrence-form"
            type="submit"
            disabled={isMutating}
          >
            {isMutating ? "Criando…" : "Criar ocorrência"}
          </Button>
        </>
      }
    >
      <form id="new-occurrence-form" className={styles.form} onSubmit={submit}>
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="numero_bo" className={styles.label}>
              Número do BO
            </label>
            <input
              id="numero_bo"
              type="text"
              className={styles.input}
              placeholder="12345/2026"
              value={form.numero_bo}
              onChange={(e) => setField("numero_bo", e.target.value)}
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="protocolo" className={styles.label}>
              Protocolo
            </label>
            <input
              id="protocolo"
              type="text"
              className={styles.input}
              placeholder="Opcional"
              value={form.protocolo}
              onChange={(e) => setField("protocolo", e.target.value)}
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="tipo_pericia" className={styles.label}>
              Tipo de perícia
            </label>
            <input
              id="tipo_pericia"
              type="text"
              className={styles.input}
              placeholder="Ex.: Sinistro de Trânsito"
              value={form.tipo_pericia}
              onChange={(e) => setField("tipo_pericia", e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="municipio" className={styles.label}>
              Município
            </label>
            <input
              id="municipio"
              type="text"
              className={styles.input}
              placeholder="Ex.: Macapá"
              value={form.municipio}
              onChange={(e) => setField("municipio", e.target.value)}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="peritos" className={styles.label}>
            Peritos (separados por vírgula)
          </label>
          <input
            id="peritos"
            type="text"
            className={styles.input}
            placeholder="Ex.: André Barroso, João Silva"
            value={form.peritos}
            onChange={(e) => setField("peritos", e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="parent_directory" className={styles.label}>
            Pasta onde o workspace será criado
          </label>
          <div className={styles.parentDirRow}>
            <input
              id="parent_directory"
              type="text"
              className={styles.input}
              placeholder="(opcional — padrão: Documentos)"
              value={form.parent_directory}
              onChange={(e) => setField("parent_directory", e.target.value)}
            />
            <Button
              variant="secondary"
              onClick={pickDirectory}
              leftIcon={<Folder size={14} />}
              type="button"
            >
              Escolher
            </Button>
          </div>
          <p className={styles.hint}>
            Será criada uma pasta com extensão <code>.sicro</code> dentro deste
            diretório, contendo <code>manifest.json</code>, banco{" "}
            <code>sicro.sqlite</code> e estrutura de assets.
          </p>
        </div>

        {error && <div className={styles.error}>{error}</div>}
      </form>
    </Dialog>
  );
}
