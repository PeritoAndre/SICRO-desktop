/**
 * Central list of TipTap extensions used by the SICRO laudo editor.
 *
 * Two callers must use the same list:
 *   1. The interactive editor (`useEditor({ extensions: laudoExtensions() })`);
 *   2. The HTML renderer (`generateHTML(doc, laudoExtensions())`).
 *
 * Keep this list canonical — diverging the two sides causes silent rendering
 * mismatches that are painful to debug.
 */

import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import Placeholder from "@tiptap/extension-placeholder";
import { FigCaption, Figure, Storyboard, StoryboardItem, SystemData } from "./nodes";

export function laudoExtensions(opts?: { placeholder?: string }): Extensions {
  return [
    // StarterKit ships paragraph, heading, bold, italic, strike, lists, blockquote,
    // code, codeBlock, hardBreak, history, dropcursor, gapcursor, horizontalRule.
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Underline,
    TextAlign.configure({
      types: ["heading", "paragraph"],
      alignments: ["left", "center", "right", "justify"],
      defaultAlignment: "left",
    }),
    Image.configure({
      // We DON'T use the plain image node directly — figures should go through
      // the Figure custom node so they get captions and numbering. But the
      // image extension still has to be registered for legacy/raw pastes.
      inline: false,
      allowBase64: true,
    }),
    Table.configure({
      resizable: false,
      HTMLAttributes: { "data-sicro-table": "true" },
    }),
    TableRow,
    TableHeader,
    TableCell,
    Figure,
    FigCaption,
    Storyboard,
    StoryboardItem,
    SystemData,
    Placeholder.configure({
      placeholder:
        opts?.placeholder ?? "Comece a escrever o laudo ou insira uma seção…",
      includeChildren: false,
    }),
  ];
}
