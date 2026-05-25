/**
 * Unit tests for the `.sicrocroqui` serializer — Spike E.
 *
 * Confirms:
 *   - the coercer hardens missing/defaulted fields;
 *   - round-trip (coerce → JSON.stringify → JSON.parse → coerce) is stable;
 *   - shape that can't possibly be a croqui throws clearly.
 */

import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  coerceCroquiDoc,
  serializeCroquiDoc,
} from "./index";

const VALID_MINIMUM = {
  schema_version: "0.1",
  croqui_id: "11111111-1111-4111-8111-111111111111",
  occurrence_id: "22222222-2222-4222-8222-222222222222",
  title: "Croqui de teste",
  created_at: "2026-05-25T13:00:00.000Z",
  updated_at: "2026-05-25T13:00:00.000Z",
};

describe("coerceCroquiDoc", () => {
  it("fills canvas / layers / objects with defaults when missing", () => {
    const d = coerceCroquiDoc(VALID_MINIMUM);
    expect(d.canvas.width_px).toBe(1600);
    expect(d.canvas.height_px).toBe(1000);
    expect(d.canvas.grid?.enabled).toBe(true);
    expect(d.layers.length).toBe(2);
    expect(d.layers[0]?.kind).toBe("background");
    expect(d.layers[1]?.kind).toBe("objects");
    expect(d.objects).toEqual([]);
    expect(d.scale).toBeNull();
    expect(d.background_image).toBeNull();
  });

  it("preserves canvas customisation", () => {
    const d = coerceCroquiDoc({
      ...VALID_MINIMUM,
      canvas: { width_px: 2000, height_px: 1200, background_color: "#000" },
    });
    expect(d.canvas.width_px).toBe(2000);
    expect(d.canvas.background_color).toBe("#000");
  });

  it("keeps a valid scale", () => {
    const d = coerceCroquiDoc({
      ...VALID_MINIMUM,
      scale: {
        px_per_m: 47.5,
        definition: { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, real_distance_m: 2.1 },
      },
    });
    expect(d.scale?.px_per_m).toBe(47.5);
    expect(d.scale?.definition?.real_distance_m).toBe(2.1);
  });

  it("drops invalid scale silently (graceful)", () => {
    const d = coerceCroquiDoc({
      ...VALID_MINIMUM,
      scale: { px_per_m: 0 },
    });
    expect(d.scale).toBeNull();
  });

  it("throws when croqui_id is missing", () => {
    const broken = { ...VALID_MINIMUM, croqui_id: "" };
    expect(() => coerceCroquiDoc(broken)).toThrow();
  });

  it("throws when input is not an object", () => {
    expect(() => coerceCroquiDoc(null)).toThrow();
    expect(() => coerceCroquiDoc("not a croqui")).toThrow();
    expect(() => coerceCroquiDoc(42)).toThrow();
  });

  it("preserves objects array as-is", () => {
    const d = coerceCroquiDoc({
      ...VALID_MINIMUM,
      objects: [
        {
          id: "v1",
          layer_id: "layer_objects",
          kind: "vehicle",
          x: 10,
          y: 20,
          width: 80,
          height: 40,
          rotation: 0,
          label: "V1",
        },
      ],
    });
    expect(d.objects).toHaveLength(1);
    expect(d.objects[0]?.kind).toBe("vehicle");
  });
});

describe("serializeCroquiDoc", () => {
  it("stamps schema_version and updated_at", () => {
    const d = coerceCroquiDoc(VALID_MINIMUM);
    const before = d.updated_at;
    const after = serializeCroquiDoc(d);
    expect(after.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.updated_at).not.toBe(before);
  });

  it("round-trips through JSON without losing data", () => {
    const d = coerceCroquiDoc({
      ...VALID_MINIMUM,
      objects: [
        {
          id: "x1",
          layer_id: "layer_objects",
          kind: "marker",
          subtype: "collision_x",
          x: 100,
          y: 50,
          size: 24,
        },
      ],
      scale: { px_per_m: 30 },
    });
    const stamped = serializeCroquiDoc(d);
    const text = JSON.stringify(stamped);
    const reparsed = coerceCroquiDoc(JSON.parse(text));
    expect(reparsed.objects).toEqual(stamped.objects);
    expect(reparsed.scale?.px_per_m).toBe(30);
    expect(reparsed.croqui_id).toBe(VALID_MINIMUM.croqui_id);
  });
});
