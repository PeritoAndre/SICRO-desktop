/**
 * N — Extensões TipTap dedicadas ao cabeçalho (Word-style).
 *
 * Subset REDUZIDO das `laudoExtensions()`. Princípio: o header é uma
 * região pequena e visual; não faz sentido carregar paginação, comentários,
 * revisão, sistema de quesitos, blocos dinâmicos, etc.
 *
 * O que ESTÁ aqui:
 *   - StarterKit (paragraph, heading H1/H2, bold, italic, strike, listas,
 *     hardBreak, history, dropcursor, gapcursor — SEM blockquote/code).
 *   - Underline, TextAlign (left/center/right/justify).
 *   - TextStyle + Color + FontFamily + FontSize + Highlight (pra reproduzir
 *     o "look institucional" se desejado, ex: brasão + linhas em maiúsculas
 *     centralizadas).
 *   - Image (logos/brasões institucionais).
 *   - Table (simples) — útil quando o cabeçalho precisa de coluna com
 *     brasão à esquerda + texto à direita.
 *   - Placeholder pra ajudar quando vazio.
 *
 * O que FICOU DE FORA:
 *   - Pagination (header não pagina — é replicado em cada pg).
 *   - CommentMark, RevisionMark (header não tem fluxo de revisão).
 *   - Figure/Storyboard/EvidenceTable/PhotoPlate (peso desnecessário).
 *   - QuesitoList/Signature (são do corpo).
 *   - CrossReference + DynamicLists + AutoNumbering (numeração de body).
 *   - FieldPlaceholder (campos automáticos podem ser adicionados depois
 *     se a UX pedir).
 *   - LaudoStyleAttribute (sistema de estilos do body).
 *
 * Usado tanto pelo editor interativo do header (instância TipTap dedicada
 * em EditorPage) quanto pelo renderer HTML/DOCX que reusa `generateHTML`
 * com a mesma lista.
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
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Highlight } from "@tiptap/extension-highlight";
import { FontFamily } from "@tiptap/extension-font-family";
import { FontSize } from "./marks/FontSize";
// Pós-laudo S — Figure node + helpers de parágrafo (indent + spacing)
// agora também disponíveis no header, pra que fotos no cabeçalho
// recebam o mesmo tratamento (overlay, handles, wrap modes) que as
// fotos do corpo.
import { Figure, FigCaption } from "./nodes/Figure";
// U — TextBox: caixa de texto editável também disponível no cabeçalho.
import { TextBox } from "./nodes/TextBox";
import { ParagraphFirstLineIndent } from "./paragraph-indent";
import { ParagraphSpacing } from "./paragraph-spacing";

export interface HeaderExtensionsOptions {
  placeholder?: string;
}

export function headerExtensions(
  opts?: HeaderExtensionsOptions,
): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2] },
      blockquote: false,
      code: false,
      codeBlock: false,
      // History é necessária para o Ctrl+Z funcionar dentro do header.
    }),
    Underline,
    TextAlign.configure({
      types: ["heading", "paragraph"],
      alignments: ["left", "center", "right", "justify"],
      defaultAlignment: "center", // headers institucionais geralmente
                                   // centralizam o conteúdo.
    }),
    TextStyle,
    Color,
    Highlight.configure({
      multicolor: true,
      HTMLAttributes: { class: "sicro-highlight" },
    }),
    FontFamily.configure({ types: ["textStyle"] }),
    FontSize,
    Image.configure({
      inline: false,
      allowBase64: true,
      HTMLAttributes: { class: "sicro-header-image" },
    }),
    Table.configure({
      resizable: false,
      HTMLAttributes: { "data-sicro-header-table": "true" },
    }),
    TableRow,
    TableHeader,
    TableCell,
    // Pós-laudo S — Figure + FigCaption + paragraph helpers no header.
    Figure,
    FigCaption,
    // U — TextBox no header também (mesmo tratamento que no body).
    TextBox,
    ParagraphFirstLineIndent,
    ParagraphSpacing,
    Placeholder.configure({
      placeholder:
        opts?.placeholder ??
        "Cabeçalho do laudo — clique duplo para editar",
      includeChildren: false,
    }),
  ];
}
