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

  // MVP 6 — backward compatibility with v0.1 envelopes.
  it("loads a v0.1 envelope without crashing and assigns categories", () => {
    const d = coerceCroquiDoc({
      schema_version: "0.1",
      croqui_id: "11111111-1111-4111-8111-111111111111",
      occurrence_id: "22222222-2222-4222-8222-222222222222",
      title: "Croqui legado",
      created_at: "2026-05-25T13:00:00.000Z",
      updated_at: "2026-05-25T13:00:00.000Z",
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
        {
          id: "v1",
          layer_id: "layer_objects",
          kind: "vehicle",
          x: 200,
          y: 200,
          width: 80,
          height: 40,
          rotation: 0,
        },
        {
          id: "r1",
          layer_id: "layer_objects",
          kind: "line",
          subtype: "r1",
          points: [0, 0, 100, 0],
          stroke_width: 4,
        },
      ],
    });
    expect(d.objects).toHaveLength(3);
    // Aggregator/UI relies on `category` — v0.1 objects must surface a
    // defaulted value.
    const cats = d.objects.map((o) => o.category);
    expect(cats).toContain("vestigios");
    expect(cats).toContain("veiculos");
    expect(cats).toContain("referenciais");
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

  // MVP 9 Round 5 — additive background fields.
  it("defaults background.rotation to 0 when the field is missing (legacy doc)", () => {
    const d = coerceCroquiDoc({
      ...VALID_MINIMUM,
      background_image: {
        source_path: "croquis/backgrounds/foo.png",
        x: 10,
        y: 20,
        width: 800,
        height: 600,
        opacity: 0.6,
        locked: true,
      },
    });
    expect(d.background_image).not.toBeNull();
    expect(d.background_image!.rotation).toBe(0);
    expect(d.background_image!.x).toBe(10);
    expect(d.background_image!.opacity).toBe(0.6);
  });

  it("preserves rotation / sidecar_path / original_path round-trip", () => {
    const d = coerceCroquiDoc({
      ...VALID_MINIMUM,
      background_image: {
        source_path: "croquis/backgrounds/drone_corrigido_x.png",
        x: 100,
        y: 50,
        width: 1200,
        height: 800,
        opacity: 0.8,
        locked: false,
        rotation: 45,
        sidecar_path: "croquis/backgrounds/drone_corrigido_x.sidecar.json",
        original_path: "C:/Users/perit/drone_001.JPG",
      },
    });
    const text = JSON.stringify(serializeCroquiDoc(d));
    const reparsed = coerceCroquiDoc(JSON.parse(text));
    expect(reparsed.background_image?.rotation).toBe(45);
    expect(reparsed.background_image?.sidecar_path).toBe(
      "croquis/backgrounds/drone_corrigido_x.sidecar.json",
    );
    expect(reparsed.background_image?.original_path).toBe(
      "C:/Users/perit/drone_001.JPG",
    );
    expect(reparsed.background_image?.locked).toBe(false);
  });

  // MVP 10 Round 5 — closed_path + markings.color additive fields.
  it("legacy road object (no closed_path / markings.color) loads unchanged", () => {
    const d = coerceCroquiDoc({
      ...VALID_MINIMUM,
      objects: [
        {
          id: "r1",
          layer_id: "layer_objects",
          kind: "road",
          subtype: "spline",
          points: [0, 0, 100, 0],
          width: 80,
          lane_count: 2,
          direction: "two_way",
          road_style: "urban",
          markings: {
            center_line: "dashed",
            edge_line: true,
            lane_dividers: false,
          },
          curb: { enabled: true, width: 2, color: "#475569" },
          surface: { fill: "#3f3f46" },
          spline_tension: 0.5,
        },
      ],
    });
    const road = d.objects[0]!;
    if (road.kind !== "road") throw new Error("expected road");
    expect(road.closed_path).toBeUndefined();
    expect(road.markings.color).toBeUndefined();
  });

  it("preserves closed_path and markings.color through coerce + stringify + reparse", () => {
    const stamped = serializeCroquiDoc(
      coerceCroquiDoc({
        ...VALID_MINIMUM,
        objects: [
          {
            id: "r1",
            layer_id: "layer_objects",
            kind: "road",
            subtype: "osm_way",
            points: [0, 0, 50, 50, 0, 100, 0, 0],
            width: 180,
            lane_count: 4,
            direction: "unknown",
            road_style: "highway",
            markings: {
              center_line: "none",
              edge_line: true,
              lane_dividers: false,
              color: "yellow",
            },
            curb: { enabled: false, width: 0, color: "#475569" },
            surface: { fill: "#27272a" },
            spline_tension: 0.7,
            closed_path: true,
          },
        ],
      }),
    );
    const re = coerceCroquiDoc(JSON.parse(JSON.stringify(stamped)));
    const road = re.objects[0]!;
    if (road.kind !== "road") throw new Error("expected road");
    expect(road.closed_path).toBe(true);
    expect(road.markings.color).toBe("yellow");
  });

  it("drops invalid background_image (no source_path) without crashing", () => {
    const d = coerceCroquiDoc({
      ...VALID_MINIMUM,
      background_image: {
        // no source_path
        x: 10,
        y: 10,
        width: 100,
        height: 100,
        opacity: 1,
      },
    });
    expect(d.background_image).toBeNull();
  });
});
