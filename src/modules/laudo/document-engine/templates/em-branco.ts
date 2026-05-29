/**
 * Template "Em Branco" — só o título.
 *
 * Para quando o perito quer total liberdade ou vai colar conteúdo
 * de fora.
 */

import type { LaudoTemplate } from "./types";
import { heading, paragraph } from "./helpers";

export const emBranco: LaudoTemplate = {
  id: "em_branco",
  name: "Em branco",
  description: "Documento totalmente vazio — só o cabeçalho do laudo.",
  category: "Genérico",
  build: (title) => ({
    type: "doc",
    content: [
      heading(1, title || "Laudo Pericial"),
      paragraph(""),
    ],
  }),
};
