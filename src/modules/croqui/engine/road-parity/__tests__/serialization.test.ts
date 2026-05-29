/**
 * Python Parity Engine — testes de serialização.
 *
 * Garantia: objetos parity sobrevivem round-trip
 * `JSON.stringify` → `JSON.parse` + `coerceCroquiDoc` sem perda.
 *
 * Foco: o coercer NÃO toca em `parity_objects` (porque elas vivem
 * em array separado). E `road_engine_version: "parity"` deve ser
 * preservado.
 */

import { describe, expect, it } from "vitest";
import { coerceCroquiDoc, serializeCroquiDoc } from "../../serializer";
import { makeParityRoad, makeParityRoundabout } from "../factories";
import type { SicroCroquiDoc } from "../../schema";
import type { SicroParityObject } from "../types";

function buildDocWithParity(parity: SicroParityObject[]): SicroCroquiDoc {
  return {
    schema_version: "0.4",
    croqui_id: "11111111-1111-4111-8111-111111111111",
    occurrence_id: "22222222-2222-4222-8222-222222222222",
    title: "Doc Parity",
    created_at: "2026-05-26T00:00:00.000Z",
    updated_at: "2026-05-26T00:00:00.000Z",
    canvas: {
      width_px: 1600,
      height_px: 1000,
      background_color: "#ffffff",
    },
    scale: null,
    background_image: null,
    layers: [
      {
        id: "layer_objects",
        name: "Objetos",
        visible: true,
        locked: false,
        kind: "objects",
      },
    ],
    objects: [],
    road_engine_version: "parity",
    parity_objects: parity,
  };
}

describe("road-parity / serializer round-trip", () => {
  it("via parity sobrevive serialize → parse + coerce", () => {
    const road = makeParityRoad(0, 0, 100, 50, {
      label: "BR-156",
      largura_m: 10.5,
      mao_dupla: false,
      marcacao: "branca",
      superficie: "asfalto",
    });
    const doc = buildDocWithParity([road]);
    const stamped = serializeCroquiDoc(doc);
    const reparsed = coerceCroquiDoc(JSON.parse(JSON.stringify(stamped)));

    expect(reparsed.road_engine_version).toBe("parity");
    // O coercer atual NÃO mexe em `parity_objects` — passa direto
    // através do spread. Verificamos isso explicitamente.
    expect(reparsed.parity_objects).toBeDefined();
    expect(reparsed.parity_objects).toHaveLength(1);
    const r = reparsed.parity_objects?.[0];
    expect(r).toBeDefined();
    expect(r?.kind).toBe("road_parity");
    if (r && r.kind === "road_parity") {
      expect(r.label).toBe("BR-156");
      expect(r.largura_m).toBe(10.5);
      expect(r.mao_dupla).toBe(false);
      expect(r.marcacao).toBe("branca");
      expect(r.ax).toBe(0);
      expect(r.bx).toBe(100);
      expect(r.by).toBe(50);
      expect(r.engine).toBe("parity");
    }
  });

  it("rotatória parity sobrevive round-trip + inner_color preservado", () => {
    const rb = makeParityRoundabout(50, 60, 14, {
      largura_m: 8,
      inner_color: "#abc123",
      label: "Rotatória Central",
    });
    const doc = buildDocWithParity([rb]);
    const stamped = serializeCroquiDoc(doc);
    const reparsed = coerceCroquiDoc(JSON.parse(JSON.stringify(stamped)));

    const r = reparsed.parity_objects?.[0];
    expect(r?.kind).toBe("roundabout_parity");
    if (r && r.kind === "roundabout_parity") {
      expect(r.cx).toBe(50);
      expect(r.cy).toBe(60);
      expect(r.r_m).toBe(14);
      expect(r.largura_m).toBe(8);
      expect(r.inner_color).toBe("#abc123");
      expect(r.label).toBe("Rotatória Central");
    }
  });

  it("rotatória sem inner_color volta sem inner_color (não vira string vazia)", () => {
    const rb = makeParityRoundabout(0, 0, 12);
    const doc = buildDocWithParity([rb]);
    const reparsed = coerceCroquiDoc(
      JSON.parse(JSON.stringify(serializeCroquiDoc(doc))),
    );
    const r = reparsed.parity_objects?.[0];
    if (r && r.kind === "roundabout_parity") {
      expect(r.inner_color).toBeUndefined();
    } else {
      throw new Error("Expected roundabout_parity");
    }
  });

  it("road_engine_version 'parity' aceito pelo coercer", () => {
    const doc = buildDocWithParity([]);
    const reparsed = coerceCroquiDoc(JSON.parse(JSON.stringify(doc)));
    expect(reparsed.road_engine_version).toBe("parity");
  });

  it("road_engine_version 'invalid' cai pra 'v1'", () => {
    const doc = {
      ...buildDocWithParity([]),
      road_engine_version: "invalid_xxx" as never,
    };
    const reparsed = coerceCroquiDoc(JSON.parse(JSON.stringify(doc)));
    expect(reparsed.road_engine_version).toBe("v1");
  });

  it("doc sem parity_objects mas com road_engine_version 'parity' não crasha", () => {
    const doc: SicroCroquiDoc = {
      ...buildDocWithParity([]),
    };
    delete doc.parity_objects;
    const reparsed = coerceCroquiDoc(JSON.parse(JSON.stringify(doc)));
    expect(reparsed.road_engine_version).toBe("parity");
    expect(reparsed.parity_objects).toBeUndefined();
  });
});
