import { describe, it, expect } from "vitest";
import {
  BODY_TEMPLATES,
  BODY_VIEW_ORDER,
  bodyTemplateDataUri,
  LESAO_TIPOS,
  lesaoMeta,
  isLesaoTipo,
  REGIOES,
  regiaoComLado,
  coerceCorpoDoc,
  nextMarkerNumber,
  makeCorpoDoc,
  makeLesao,
  buildLegend,
  summarizeLesoes,
  type SicroCorpoDoc,
} from "../index";

describe("corpo — templates", () => {
  it("tem as 3 pranchas do MVP com SVG não vazio", () => {
    expect(BODY_VIEW_ORDER).toEqual([
      "corpo_completo",
      "anterior",
      "posterior",
      "cabeca_frontal",
    ]);
    for (const v of BODY_VIEW_ORDER) {
      const t = BODY_TEMPLATES[v];
      expect(t.svg).toContain("<svg");
      expect(t.width).toBeGreaterThan(0);
      expect(t.height).toBeGreaterThan(0);
    }
  });

  it("data URI é svg+xml", () => {
    expect(bodyTemplateDataUri("anterior")).toMatch(/^data:image\/svg\+xml/);
  });
});

describe("corpo — taxonomia e regiões", () => {
  it("todo tipo tem cor, rótulo e abreviatura; índice consistente", () => {
    for (const m of LESAO_TIPOS) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.short.length).toBeGreaterThan(0);
      expect(m.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(lesaoMeta(m.tipo)).toBe(m);
    }
  });

  it("isLesaoTipo valida", () => {
    expect(isLesaoTipo("faf_entrada")).toBe(true);
    expect(isLesaoTipo("xpto")).toBe(false);
    expect(isLesaoTipo(42)).toBe(false);
  });

  it("regiaoComLado combina região + lateralidade", () => {
    expect(regiaoComLado("antebraco_ant", "D")).toBe("Antebraço (D)");
    expect(regiaoComLado("toracica_ant", "central")).toBe("Torácica (mamária)");
    expect(regiaoComLado(null, "D")).toBe("");
    expect(REGIOES.length).toBeGreaterThan(10);
  });
});

describe("corpo — factories", () => {
  it("makeCorpoDoc usa template e timestamp injetado", () => {
    const doc = makeCorpoDoc("c1", "occ1", {
      template_id: "posterior",
      title: "Vítima 1",
      now: "2026-06-06T00:00:00Z",
    });
    expect(doc.template_id).toBe("posterior");
    expect(doc.title).toBe("Vítima 1");
    expect(doc.created_at).toBe("2026-06-06T00:00:00Z");
    expect(doc.canvas).toEqual({
      width_px: BODY_TEMPLATES.posterior.width,
      height_px: BODY_TEMPLATES.posterior.height,
    });
    expect(doc.markers).toEqual([]);
  });

  it("makeLesao cria marcador com defaults nulos", () => {
    const m = makeLesao(10, 20, "faf_entrada", 1);
    expect(m).toMatchObject({
      number: 1,
      x: 10,
      y: 20,
      tipo: "faf_entrada",
      regiao: null,
      size: 12,
    });
    expect(m.id).toMatch(/^lesao_/);
  });

  it("nextMarkerNumber = maior + 1 (determinístico, robusto a gaps)", () => {
    const doc = makeCorpoDoc("c1", "occ1", { now: "x" });
    expect(nextMarkerNumber(doc)).toBe(1);
    doc.markers.push(makeLesao(0, 0, "outro", 1));
    doc.markers.push(makeLesao(0, 0, "outro", 5)); // gap proposital
    expect(nextMarkerNumber(doc)).toBe(6);
  });
});

describe("corpo — coerceCorpoDoc", () => {
  it("lança sem corpo_id/occurrence_id", () => {
    expect(() => coerceCorpoDoc({})).toThrow();
    expect(() => coerceCorpoDoc(null)).toThrow();
  });

  it("preenche defaults e normaliza template inválido", () => {
    const doc = coerceCorpoDoc({
      corpo_id: "c1",
      occurrence_id: "occ1",
      template_id: "lado_esquerdo_inexistente",
    });
    expect(doc.template_id).toBe("corpo_completo");
    expect(doc.title).toBe("Croqui corporal");
    expect(doc.canvas.width_px).toBe(1040);
    expect(doc.markers).toEqual([]);
  });

  it("coage marcadores: tipo inválido vira 'outro', lateralidade inválida vira null, não-objetos somem", () => {
    const doc = coerceCorpoDoc({
      corpo_id: "c1",
      occurrence_id: "occ1",
      markers: [
        { id: "a", number: 1, x: 5, y: 6, tipo: "faf_saida", lateralidade: "D" },
        { id: "b", number: 2, x: 1, y: 1, tipo: "inexistente", lateralidade: "X" },
        "lixo",
        null,
      ],
    });
    expect(doc.markers).toHaveLength(2);
    expect(doc.markers[0]).toMatchObject({ tipo: "faf_saida", lateralidade: "D" });
    expect(doc.markers[1]).toMatchObject({ tipo: "outro", lateralidade: null });
  });

  it("é idempotente (coerce(coerce(x)) === coerce(x))", () => {
    const once = coerceCorpoDoc({
      corpo_id: "c1",
      occurrence_id: "occ1",
      template_id: "cabeca_frontal",
      markers: [{ id: "a", number: 1, x: 5, y: 6, tipo: "mordida" }],
    });
    const twice = coerceCorpoDoc(once);
    expect(twice).toEqual(once);
  });
});

describe("corpo — legenda", () => {
  function docComLesoes(): SicroCorpoDoc {
    const doc = makeCorpoDoc("c1", "occ1", { now: "x" });
    doc.markers = [
      {
        ...makeLesao(10, 10, "faf_entrada", 2),
        regiao: "toracica_ant",
        lateralidade: "E",
        instrumento: "PAF",
        dimensoes_cm: "0,9 cm",
      },
      {
        ...makeLesao(20, 20, "arma_branca", 1),
        regiao: "mesogastrica",
        observacao: "borda regular",
      },
    ];
    return doc;
  }

  it("buildLegend ordena por número e formata região+lado", () => {
    const rows = buildLegend(docComLesoes());
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.number)).toEqual([1, 2]);
    expect(rows[1]).toMatchObject({
      number: 2,
      tipo: "FAF — orifício de entrada",
      regiao: "Torácica (mamária) (E)",
      instrumento: "PAF",
      dimensoes: "0,9 cm",
    });
    expect(rows[0]!.regiao).toBe("Mesogástrica (umbilical)");
    expect(rows[0]!.color).toMatch(/^#/);
  });

  it("summarizeLesoes conta por tipo", () => {
    const doc = makeCorpoDoc("c1", "occ1", { now: "x" });
    expect(summarizeLesoes(doc)).toMatch(/nenhuma/i);
    doc.markers = [
      makeLesao(0, 0, "faf_entrada", 1),
      makeLesao(0, 0, "faf_entrada", 2),
      makeLesao(0, 0, "arma_branca", 3),
    ];
    const s = summarizeLesoes(doc);
    expect(s).toContain("2×");
    expect(s).toContain("FAF — orifício de entrada");
  });
});
