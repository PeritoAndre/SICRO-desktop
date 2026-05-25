/**
 * LaudoEditorView — orchestrates toolbar + editor + inspector + html preview.
 *
 * Owns the TipTap editor instance and keeps the laudoStore in sync.
 */

import { useEffect, useRef, useState } from "react";
import { useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { ArrowLeft } from "lucide-react";
import { EditorPage } from "../components/EditorPage";
import { EditorToolbar } from "../components/EditorToolbar";
import { Inspector } from "../components/Inspector";
import { HtmlPreview } from "../components/HtmlPreview";
import { useLaudoStore } from "../store/laudoStore";
import { useWorkspaceStore } from "@stores/workspaceStore";
import { laudoExtensions, type SicroDoc } from "../document-engine";
import { formatRelative } from "@core/formatters";
import { toSicroError } from "@core/errors";
import styles from "./LaudoEditorView.module.css";

interface LaudoEditorViewProps {
  workspacePath: string;
  onBack: () => void;
}

export function LaudoEditorView({ workspacePath, onBack }: LaudoEditorViewProps) {
  const currentLaudo = useLaudoStore((s) => s.currentLaudo);
  const currentDoc = useLaudoStore((s) => s.currentDoc);
  const isSaving = useLaudoStore((s) => s.isMutating);
  const saveCurrent = useLaudoStore((s) => s.saveCurrent);
  const lastError = useLaudoStore((s) => s.lastError);
  const activeOccurrence = useWorkspaceStore((s) => s.activeOccurrence);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [liveContent, setLiveContent] = useState<JSONContent | null>(null);
  const [titleDraft, setTitleDraft] = useState(currentLaudo?.title ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  // Keep titleDraft synced when the underlying laudo changes.
  useEffect(() => {
    setTitleDraft(currentLaudo?.title ?? "");
  }, [currentLaudo?.id, currentLaudo?.title]);

  const initialContent = currentDoc?.content ?? null;

  const editor = useEditor(
    {
      extensions: laudoExtensions({
        placeholder: "Comece a escrever o laudo ou insira uma seção…",
      }),
      content: initialContent,
      editorProps: {
        attributes: {
          class: "sicro-editor-content",
          spellcheck: "true",
        },
      },
      autofocus: "end",
      onUpdate({ editor }) {
        setLiveContent(editor.getJSON());
      },
    },
    // Recreate the editor when the loaded laudo changes; without this the
    // previous laudo's content sticks even after the store swaps `currentDoc`.
    [currentLaudo?.id],
  );

  // Initialize liveContent the first time the editor is ready.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (editor && !initializedRef.current && initialContent) {
      setLiveContent(editor.getJSON());
      initializedRef.current = true;
    }
  }, [editor, initialContent]);

  if (!currentLaudo || !currentDoc || !editor) {
    return (
      <div className={styles.root}>
        <div className={styles.headerRow}>
          <button type="button" className={styles.backBtn} onClick={onBack}>
            <ArrowLeft size={14} /> Voltar
          </button>
        </div>
        <div style={{ padding: "var(--space-8)" }}>
          <p style={{ color: "var(--sicro-fg-muted)" }}>Carregando laudo…</p>
        </div>
      </div>
    );
  }

  // Build the SicroDoc snapshot the inspector + preview will look at.
  const docForInspector: SicroDoc = liveContent
    ? { ...currentDoc, content: liveContent }
    : currentDoc;

  const handleSave = async () => {
    setLocalError(null);
    try {
      const content = editor.getJSON();
      await saveCurrent(workspacePath, content);
    } catch (err) {
      setLocalError(toSicroError(err).message);
    }
  };

  const handleTitleCommit = async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === currentLaudo.title) return;
    // Update the SicroDoc's title via save with the same content.
    try {
      const content = editor.getJSON();
      const nextDoc: SicroDoc = { ...currentDoc, title: trimmed, content };
      // saveCurrent writes envelope using currentDoc as previous; we patch it
      // first by stashing it back into the store, then saving.
      useLaudoStore.setState({ currentDoc: nextDoc });
      await saveCurrent(workspacePath, content);
    } catch (err) {
      setLocalError(toSicroError(err).message);
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.headerRow}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          <ArrowLeft size={14} /> Voltar
        </button>
        <input
          className={styles.titleInput}
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={handleTitleCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="Título do laudo"
          aria-label="Título do laudo"
        />
        <span className={styles.savedBadge}>
          atualizado {formatRelative(currentLaudo.updated_at)}
        </span>
      </div>

      <EditorToolbar
        editor={editor}
        isSaving={isSaving}
        isPreviewOpen={previewOpen}
        onSave={handleSave}
        onTogglePreview={() => setPreviewOpen((v) => !v)}
        workspacePath={workspacePath}
        laudoId={currentLaudo.id}
        laudoTitle={currentLaudo.title}
        doc={docForInspector}
        occurrence={
          activeOccurrence as unknown as Record<string, unknown> | null
        }
      />

      {(localError || lastError?.message) && (
        <div className={styles.errorBanner}>{localError ?? lastError?.message}</div>
      )}

      <div className={styles.body}>
        <div className={styles.editorRegion}>
          <EditorPage
            editor={editor}
            doc={docForInspector}
            occurrence={activeOccurrence}
          />
          {previewOpen && (
            <HtmlPreview
              doc={docForInspector}
              liveContent={liveContent}
              occurrence={activeOccurrence}
              workspacePath={workspacePath}
              onClose={() => setPreviewOpen(false)}
            />
          )}
        </div>
        <Inspector
          doc={docForInspector}
          editor={editor}
          workspacePath={workspacePath}
          laudoId={currentLaudo.id}
        />
      </div>
    </div>
  );
}
