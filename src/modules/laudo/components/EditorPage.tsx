import { EditorContent, type Editor } from "@tiptap/react";
import styles from "./EditorPage.module.css";

interface EditorPageProps {
  editor: Editor | null;
}

export function EditorPage({ editor }: EditorPageProps) {
  return (
    <div className={styles.scroll}>
      <div className={styles.page}>
        <div className={styles.editor}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
