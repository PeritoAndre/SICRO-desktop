/**
 * Unit tests for road templates — MVP 6.
 */

import { describe, expect, it } from "vitest";
import {
  findTemplate,
  TEMPLATES,
  TOOLBAR_TEMPLATES,
  type TemplateId,
} from "./templates";

describe("TEMPLATES registry", () => {
  it("exposes the canonical MVP 6 templates + MVP 9 extensions", () => {
    const ids = Object.keys(TEMPLATES).sort();
    // MVP 6 baseline — devem continuar existindo.
    const mvp6 = [
      "cruzamento_t",
      "cruzamento_x",
      "curva_simples",
      "mao_dupla",
      "mao_unica",
      "rotatoria_simples",
      "via_reta",
    ];
    for (const id of mvp6) {
      expect(ids).toContain(id);
    }
    // Sanity: MVP 9 introduziu pelo menos um template novo.
    expect(ids.length).toBeGreaterThan(mvp6.length);
  });

  it.each(Object.keys(TEMPLATES) as TemplateId[])(
    "%s — produces editable objects (line or road), none at id-collision",
    (id) => {
      const tpl = findTemplate(id)!;
      const objs = tpl.build({ x: 200, y: 200 });
      expect(objs.length).toBeGreaterThan(0);
      const ids = new Set(objs.map((o) => o.id));
      expect(ids.size).toBe(objs.length);
      for (const o of objs) {
        // MVP 9 Road Engine Pro: templates can emit either `line`
        // (legacy line-based templates) or `road` (new RoadObject-based
        // templates). Both are valid; everything else is a bug.
        expect(["line", "road"]).toContain(o.kind);
        expect(o.category).toBeDefined();
      }
    },
  );

  it("via_reta yields exactly three lines (two edges + separator)", () => {
    const objs = findTemplate("via_reta")!.build({ x: 100, y: 100 });
    expect(objs.length).toBe(3);
  });

  it("cruzamento_x yields six lines (two roads × 3 lines)", () => {
    const objs = findTemplate("cruzamento_x")!.build({ x: 0, y: 0 });
    expect(objs.length).toBe(6);
  });

  it("mao_unica includes an arrow line", () => {
    const objs = findTemplate("mao_unica")!.build({ x: 0, y: 0 });
    const hasArrow = objs.some(
      (o) => o.kind === "line" && o.subtype === "arrow",
    );
    expect(hasArrow).toBe(true);
  });

  it("rotatoria_simples produces 8 segments", () => {
    const objs = findTemplate("rotatoria_simples")!.build({ x: 0, y: 0 });
    expect(objs.length).toBe(8);
  });

  it("curva_simples produces 16 segments (8 outer + 8 inner)", () => {
    const objs = findTemplate("curva_simples")!.build({ x: 0, y: 0 });
    expect(objs.length).toBe(16);
  });
});

describe("findTemplate", () => {
  it("returns undefined for unknown ids", () => {
    expect(findTemplate("nope" as TemplateId)).toBeUndefined();
  });
});

describe("TOOLBAR_TEMPLATES (Round 3 — Road Engine only)", () => {
  it("contains only via_pro_* ids", () => {
    for (const id of TOOLBAR_TEMPLATES) {
      expect(id.startsWith("via_pro_")).toBe(true);
    }
  });

  it("every entry resolves through findTemplate", () => {
    for (const id of TOOLBAR_TEMPLATES) {
      expect(findTemplate(id)).toBeDefined();
    }
  });

  it("every TOOLBAR_TEMPLATES entry emits only RoadObject(s)", () => {
    for (const id of TOOLBAR_TEMPLATES) {
      const tpl = findTemplate(id);
      expect(tpl).toBeDefined();
      const objs = tpl!.build({ x: 100, y: 100 });
      expect(objs.length).toBeGreaterThan(0);
      for (const o of objs) {
        expect(o.kind).toBe("road");
      }
    }
  });

  it("legacy line-based templates remain available via findTemplate for compat", () => {
    // The old templates aren't surfaced by the toolbar (TOOLBAR_TEMPLATES
    // doesn't list them), but they MUST stay resolvable so any code path
    // that still references them (e.g. older keyboard shortcuts, deep
    // links) keeps working.
    for (const id of ["via_reta", "cruzamento_x", "mao_dupla", "mao_unica"]) {
      expect(findTemplate(id as TemplateId)).toBeDefined();
    }
  });

  it("the line-based templates are hidden from the toolbar list", () => {
    expect(TOOLBAR_TEMPLATES).not.toContain("via_reta");
    expect(TOOLBAR_TEMPLATES).not.toContain("cruzamento_x");
    expect(TOOLBAR_TEMPLATES).not.toContain("mao_dupla");
    expect(TOOLBAR_TEMPLATES).not.toContain("avenida_canteiro");
  });
});
