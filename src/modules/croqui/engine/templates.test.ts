/**
 * Unit tests for road templates — MVP 6.
 */

import { describe, expect, it } from "vitest";
import { findTemplate, TEMPLATES, type TemplateId } from "./templates";

describe("TEMPLATES registry", () => {
  it("exposes the seven canonical templates", () => {
    const ids = Object.keys(TEMPLATES).sort();
    expect(ids).toEqual(
      [
        "cruzamento_t",
        "cruzamento_x",
        "curva_simples",
        "mao_dupla",
        "mao_unica",
        "rotatoria_simples",
        "via_reta",
      ].sort(),
    );
  });

  it.each(Object.keys(TEMPLATES) as TemplateId[])(
    "%s — produces editable line objects, none at id-collision",
    (id) => {
      const tpl = findTemplate(id)!;
      const objs = tpl.build({ x: 200, y: 200 });
      expect(objs.length).toBeGreaterThan(0);
      const ids = new Set(objs.map((o) => o.id));
      expect(ids.size).toBe(objs.length);
      for (const o of objs) {
        expect(o.kind).toBe("line");
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
