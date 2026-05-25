/**
 * Tests for the `.sicroimage` serializer (MVP 7).
 */

import { describe, expect, it } from "vitest";
import { coerceSicroImage, serializeSicroImage, CURRENT_SCHEMA_VERSION } from "./index";

const VALID_MIN = {
  schema_version: "0.1",
  image_analysis_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  occurrence_id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
  title: "Análise de teste",
};

describe("coerceSicroImage", () => {
  it("fills source/canvas/adjustments/layers with defaults", () => {
    const d = coerceSicroImage(VALID_MIN);
    expect(d.canvas.zoom).toBe(1);
    expect(d.view_adjustments.gamma).toBe(1);
    expect(d.layers.length).toBeGreaterThanOrEqual(2);
    expect(d.annotations).toEqual([]);
    expect(d.scale).toBeNull();
  });

  it("preserves a populated envelope through serialize → coerce round-trip", () => {
    const d = coerceSicroImage({
      ...VALID_MIN,
      annotations: [
        {
          id: "x1",
          layer_id: "layer_annotations",
          kind: "arrow",
          x: 10,
          y: 10,
          x2: 100,
          y2: 100,
          created_at: "2026-05-25T13:00:00Z",
        },
      ],
      view_adjustments: {
        brightness: 12,
        contrast: -8,
        gamma: 1.1,
        saturation: 5,
        grayscale: true,
        invert: false,
      },
      scale: {
        px_per_unit: 47.5,
        unit: "m",
        calibrated_by: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        calibration_real_distance: 2.1,
        created_at: "2026-05-25T13:00:00Z",
      },
    });
    const stamped = serializeSicroImage(d);
    expect(stamped.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    const reparsed = coerceSicroImage(JSON.parse(JSON.stringify(stamped)));
    expect(reparsed.annotations[0]?.kind).toBe("arrow");
    expect(reparsed.view_adjustments.grayscale).toBe(true);
    expect(reparsed.scale?.px_per_unit).toBe(47.5);
  });

  it("throws on missing image_analysis_id", () => {
    expect(() => coerceSicroImage({ ...VALID_MIN, image_analysis_id: "" })).toThrow();
  });

  it("rejects non-object input", () => {
    expect(() => coerceSicroImage(null)).toThrow();
    expect(() => coerceSicroImage(42)).toThrow();
  });

  it("normalises unknown unit to 'm' in scale", () => {
    const d = coerceSicroImage({
      ...VALID_MIN,
      scale: {
        px_per_unit: 10,
        unit: "leagues",
        calibrated_by: [],
        calibration_real_distance: 1,
        created_at: "x",
      },
    });
    expect(d.scale?.unit).toBe("m");
  });

  it("drops invalid scale silently", () => {
    const d = coerceSicroImage({
      ...VALID_MIN,
      scale: { px_per_unit: 0 },
    });
    expect(d.scale).toBeNull();
  });
});
