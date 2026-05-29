/**
 * Testes dos templates F5.
 *
 * Verifica:
 *   - Os 9 templates do registry (8 + alias) existem e têm shape válido.
 *   - `findTemplate` faz fallback para "documento_livre" em IDs inválidos.
 *   - O alias legado `sinistro_transito_simples` → `sinistro_transito`.
 *   - Todo `build(title)` retorna JSONContent com type="doc" e content.
 *   - Pelo menos um template usa `fieldPlaceholder` (a feature core do F5).
 */

import { describe, expect, it } from "vitest";
import {
  findTemplate,
  findTemplateWithLegacyAlias,
  TEMPLATES,
} from "../index";

describe("Registry de templates F5", () => {
  it("tem 9 templates publicados", () => {
    expect(TEMPLATES.length).toBe(9);
  });

  it("todos os IDs são únicos", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("inclui os 9 templates esperados", () => {
    const ids = new Set(TEMPLATES.map((t) => t.id));
    const expected = [
      "documento_livre",
      "em_branco",
      "generico",
      "sinistro_transito",
      "arrombamento",
      "local_crime",
      "avaliacao_merceologica",
      "constatacao",
      "exame_veicular",
    ];
    for (const id of expected) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("cada template tem name, description, category e build", () => {
    for (const t of TEMPLATES) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(typeof t.build).toBe("function");
    }
  });
});

describe("findTemplate / findTemplateWithLegacyAlias", () => {
  it("encontra template por ID", () => {
    expect(findTemplate("sinistro_transito").id).toBe("sinistro_transito");
    expect(findTemplate("arrombamento").id).toBe("arrombamento");
  });

  it("retorna 'documento_livre' como fallback em ID desconhecido", () => {
    expect(findTemplate("xpto_inexistente").id).toBe("documento_livre");
  });

  it("legacy alias sinistro_transito_simples → sinistro_transito", () => {
    expect(findTemplateWithLegacyAlias("sinistro_transito_simples").id).toBe(
      "sinistro_transito",
    );
  });

  it("legacy alias preserva IDs novos", () => {
    expect(findTemplateWithLegacyAlias("arrombamento").id).toBe("arrombamento");
  });
});

describe("Templates build() — shape", () => {
  for (const t of TEMPLATES) {
    it(`${t.id}: build("Teste") retorna doc válido`, () => {
      const json = t.build("Teste");
      expect(json.type).toBe("doc");
      expect(Array.isArray(json.content)).toBe(true);
      // Tem pelo menos um heading nível 1 com o título.
      const firstHeading = (json.content ?? []).find(
        (n: { type?: string }) => n.type === "heading",
      ) as { content?: { text?: string }[] } | undefined;
      expect(firstHeading).toBeDefined();
      expect(firstHeading?.content?.[0]?.text).toContain("Teste");
    });
  }
});

describe("Templates — uso de fieldPlaceholder (F5 feature)", () => {
  it("Sinistro de Trânsito usa placeholders", () => {
    const json = findTemplate("sinistro_transito").build("Laudo");
    const json_text = JSON.stringify(json);
    expect(json_text).toContain("fieldPlaceholder");
    expect(json_text).toContain("numero_bo");
  });

  it("Documento Livre usa pelo menos um placeholder", () => {
    const json = findTemplate("documento_livre").build("Teste");
    expect(JSON.stringify(json)).toContain("fieldPlaceholder");
  });

  it("Em Branco NÃO usa placeholders (é vazio por design)", () => {
    const json = findTemplate("em_branco").build("Teste");
    expect(JSON.stringify(json)).not.toContain("fieldPlaceholder");
  });
});

describe("Templates — uso de estilos documentais (F4 → F5)", () => {
  it("Sinistro de Trânsito carrega data-laudo-style nos headings", () => {
    const json = findTemplate("sinistro_transito").build("Laudo");
    const j = JSON.stringify(json);
    expect(j).toContain("titulo_1");
    expect(j).toContain("titulo_2");
  });

  it("Conclusão usa estilo conclusao", () => {
    const json = findTemplate("sinistro_transito").build("Laudo");
    expect(JSON.stringify(json)).toContain('"laudoStyle":"conclusao"');
  });
});
