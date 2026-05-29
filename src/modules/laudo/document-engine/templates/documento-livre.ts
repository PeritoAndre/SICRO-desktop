/**
 * Template "Documento Livre" — modelo com cabeçalho institucional pronto
 * + linha de subtítulo + um parágrafo de orientação ao perito.
 *
 * F5 — Refactor do template original: agora usa `data-laudo-style` ao
 * invés de heading puro, e adiciona um exemplo de placeholder para
 * mostrar a feature de campos automáticos.
 */

import type { LaudoTemplate } from "./types";
import { heading, sentence, subtitulo } from "./helpers";

export const documentoLivre: LaudoTemplate = {
  id: "documento_livre",
  name: "Documento livre",
  description:
    "Modelo flexível: apenas título, subtítulo e um parágrafo inicial. " +
    "O perito decide o restante da estrutura.",
  category: "Genérico",
  build: (title) => ({
    type: "doc",
    content: [
      heading(1, title || "Laudo Pericial"),
      subtitulo("Documento Livre — Polícia Científica do Amapá"),
      {
        type: "paragraph",
        content: sentence([
          "Este é um modelo livre, sem estrutura pré-definida. Use a ",
          "barra de estilos ou Ctrl+Alt+0..7 para aplicar os blocos ",
          "periciais (quesito, conclusão, observação, advertência). ",
          "Insira campos automáticos como BO nº ",
          { field: "numero_bo" },
          " — eles se atualizam quando os dados do caso mudam.",
        ]),
      },
    ],
  }),
};
