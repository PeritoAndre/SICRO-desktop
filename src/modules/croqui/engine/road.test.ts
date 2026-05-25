/**
 * Road Engine helpers — unit tests (MVP 9 Road Engine Pro).
 *
 * These are pure-function tests on the geometry utilities and the
 * factory/style presets. The Konva renderer is intentionally out of
 * scope — visual validation lives in the manual QA loop the user
 * runs at the end of each round.
 */

import { describe, expect, it } from "vitest";
import { ROAD_STYLES, makeRoad } from "./factories";
import {
  clipPolylineAgainstCircles,
  distSq,
  endcapBasis,
  flattenPairs,
  junctionPolygon,
  junctionPolygonFromSegments,
  normalOf,
  offsetPolyline,
  pairsOf,
  polylineBBox,
  polylineIntersections,
  polylineIntersectionsDetailed,
  polylineLength,
  sampleCatmullRom,
  segmentIntersect,
  tangentAt,
} from "./road";

describe("pairsOf / flattenPairs", () => {
  it("round-trips a flat array", () => {
    const flat = [1, 2, 3, 4, 5, 6];
    expect(flattenPairs(pairsOf(flat))).toEqual(flat);
  });
  it("ignores a trailing unpaired x", () => {
    expect(pairsOf([1, 2, 3])).toEqual([{ x: 1, y: 2 }]);
  });
  it("returns an empty list for fewer than two values", () => {
    expect(pairsOf([])).toEqual([]);
    expect(pairsOf([5])).toEqual([]);
  });
});

describe("segmentIntersect", () => {
  it("detects a clean crossing at the origin", () => {
    const p = segmentIntersect(
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
    );
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(0);
    expect(p!.y).toBeCloseTo(0);
  });

  it("returns null for non-overlapping parallel segments", () => {
    const p = segmentIntersect(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    );
    expect(p).toBeNull();
  });

  it("returns null for collinear segments (treated as no crossing)", () => {
    const p = segmentIntersect(
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 0 },
      { x: 3, y: 0 },
    );
    expect(p).toBeNull();
  });

  it("returns null when segments would meet on extended lines but not within segment bounds", () => {
    const p = segmentIntersect(
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
      { x: 3, y: 1 },
    );
    expect(p).toBeNull();
  });
});

describe("polylineIntersections", () => {
  it("finds the single intersection between two perpendicular polylines", () => {
    const a = [-10, 0, 10, 0];
    const b = [0, -10, 0, 10];
    const xs = polylineIntersections(a, b);
    expect(xs).toHaveLength(1);
    expect(xs[0]!.x).toBeCloseTo(0);
    expect(xs[0]!.y).toBeCloseTo(0);
  });

  it("returns an empty list for disjoint polylines", () => {
    expect(polylineIntersections([0, 0, 10, 0], [0, 20, 10, 20])).toEqual([]);
  });

  it("detects multiple intersections between zigzag polylines", () => {
    const a = [0, 0, 10, 0, 20, 0]; // horizontal
    const b = [3, -5, 3, 5, 7, 5, 7, -5]; // two vertical crossings
    const xs = polylineIntersections(a, b);
    expect(xs.length).toBeGreaterThanOrEqual(2);
  });
});

describe("sampleCatmullRom", () => {
  it("returns the input untouched when fewer than two points", () => {
    expect(sampleCatmullRom([0, 0])).toEqual([0, 0]);
  });

  it("includes endpoints exactly (open spline boundary condition)", () => {
    const pts = [0, 0, 10, 0, 20, 0];
    const sampled = sampleCatmullRom(pts, 8, 0.5);
    expect(sampled[0]).toBeCloseTo(0);
    expect(sampled[1]).toBeCloseTo(0);
    expect(sampled[sampled.length - 2]).toBeCloseTo(20);
    expect(sampled[sampled.length - 1]).toBeCloseTo(0);
  });

  it("produces a strictly denser polyline than the input", () => {
    const pts = [0, 0, 10, 10, 20, 0];
    const sampled = sampleCatmullRom(pts, 6, 0.5);
    expect(sampled.length).toBeGreaterThan(pts.length);
  });

  it("clamps samples-per-segment to >= 1", () => {
    const pts = [0, 0, 10, 0];
    expect(() => sampleCatmullRom(pts, 0, 0.5)).not.toThrow();
  });
});

describe("polylineBBox / polylineLength", () => {
  it("computes a tight bounding box", () => {
    const bbox = polylineBBox([0, 0, 10, 5, -3, 8]);
    expect(bbox).toEqual({ x: -3, y: 0, w: 13, h: 8 });
  });
  it("returns null for empty/insufficient input", () => {
    expect(polylineBBox([])).toBeNull();
    expect(polylineBBox([1])).toBeNull();
  });

  it("computes the length of a straight 3-4-5 polyline", () => {
    expect(polylineLength([0, 0, 3, 4])).toBeCloseTo(5);
  });

  it("sums multiple segments", () => {
    expect(polylineLength([0, 0, 3, 0, 3, 4])).toBeCloseTo(7);
  });
});

describe("tangentAt / normalOf", () => {
  it("returns the +x unit vector for a horizontal polyline", () => {
    const t = tangentAt([0, 0, 10, 0], 0);
    expect(t.x).toBeCloseTo(1);
    expect(t.y).toBeCloseTo(0);
  });

  it("flips a tangent to its right-hand normal", () => {
    const n = normalOf({ x: 1, y: 0 });
    expect(n.x).toBeCloseTo(0);
    expect(n.y).toBeCloseTo(1);
  });

  it("falls back to +x for a degenerate polyline", () => {
    const t = tangentAt([], 0);
    expect(t).toEqual({ x: 1, y: 0 });
  });
});

describe("offsetPolyline", () => {
  it("offsets a horizontal polyline downward by the given distance", () => {
    const out = offsetPolyline([0, 0, 10, 0], 5);
    expect(out[1]).toBeCloseTo(5);
    expect(out[3]).toBeCloseTo(5);
  });

  it("returns an empty list for fewer than two control points", () => {
    expect(offsetPolyline([], 5)).toEqual([]);
    expect(offsetPolyline([0, 0], 5)).toEqual([]);
  });
});

describe("endcapBasis", () => {
  it("returns a sensible basis at the start of a horizontal road", () => {
    const basis = endcapBasis([0, 0, 10, 0], "start");
    expect(basis).not.toBeNull();
    expect(basis!.center).toEqual({ x: 0, y: 0 });
    expect(basis!.along.x).toBeCloseTo(1);
    expect(basis!.along.y).toBeCloseTo(0);
  });

  it("returns null for an empty polyline", () => {
    expect(endcapBasis([], "start")).toBeNull();
  });
});

describe("distSq", () => {
  it("squared distance matches the analytical value", () => {
    expect(distSq({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
  });
});

describe("makeRoad factory", () => {
  it("builds an urban road by default with the urban preset", () => {
    const road = makeRoad([0, 0, 100, 0]);
    expect(road.kind).toBe("road");
    expect(road.subtype).toBe("spline");
    expect(road.road_style).toBe("urban");
    expect(road.width).toBe(ROAD_STYLES.urban.width);
    expect(road.lane_count).toBe(ROAD_STYLES.urban.lane_count);
    expect(road.category).toBe("vias");
  });

  it("applies the chosen style preset", () => {
    const road = makeRoad([0, 0, 100, 0], "highway");
    expect(road.road_style).toBe("highway");
    expect(road.width).toBe(ROAD_STYLES.highway.width);
    expect(road.markings.center_line).toBe("solid");
    expect(road.curb.enabled).toBe(false);
  });

  it("respects per-call overrides", () => {
    const road = makeRoad([0, 0, 100, 0], "urban", {
      width: 200,
      lane_count: 6,
      label: "Av. Principal",
    });
    expect(road.width).toBe(200);
    expect(road.lane_count).toBe(6);
    expect(road.label).toBe("Av. Principal");
    // Default fields from the preset stay intact for anything not overridden.
    expect(road.markings.center_line).toBe(
      ROAD_STYLES.urban.markings.center_line,
    );
  });

  it("each invocation generates a fresh id", () => {
    const a = makeRoad([0, 0, 10, 0]);
    const b = makeRoad([0, 0, 10, 0]);
    expect(a.id).not.toBe(b.id);
  });
});

describe("ROAD_STYLES presets — shape sanity", () => {
  it.each(Object.keys(ROAD_STYLES))(
    "%s preset has a positive width and 1+ lanes",
    (key) => {
      const preset = ROAD_STYLES[key as keyof typeof ROAD_STYLES];
      expect(preset.width).toBeGreaterThan(0);
      expect(preset.lane_count).toBeGreaterThan(0);
    },
  );
});

describe("polylineIntersectionsDetailed", () => {
  it("returns segment indices alongside crossing points", () => {
    // a goes horizontal in two segments (vertex at x=5), b is vertical
    // at x=10. The crossing lives on a's *second* segment, b's only
    // segment. Avoid putting the crossing on a polyline vertex —
    // both adjacent segments would legitimately register a hit
    // there and the API leaves that disambiguation to the caller.
    const a = [-20, 0, 5, 0, 20, 0];
    const b = [10, -20, 10, 20];
    const hits = polylineIntersectionsDetailed(a, b);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.point.x).toBeCloseTo(10);
    expect(hits[0]!.point.y).toBeCloseTo(0);
    expect(hits[0]!.iSegment).toBe(1);
    expect(hits[0]!.jSegment).toBe(0);
  });

  it("returns an empty list when the polylines don't cross", () => {
    expect(polylineIntersectionsDetailed([0, 0, 10, 0], [0, 5, 10, 5])).toEqual(
      [],
    );
  });
});

describe("junctionPolygon", () => {
  it("perpendicular crossing produces an axis-aligned rectangle", () => {
    const poly = junctionPolygon(
      { x: 0, y: 0 },
      { x: 1, y: 0 }, // road A horizontal
      40, // halfA
      { x: 0, y: 1 }, // road B vertical
      30, // halfB
    );
    expect(poly).toHaveLength(4);
    // Symmetric — the bbox should be x∈[-30,30], y∈[-40,40]
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    expect(maxX - minX).toBeCloseTo(60); // 2 × halfB (sin θ = 1, so direct)
    expect(maxY - minY).toBeCloseTo(80); // 2 × halfA
  });

  it("oblique crossing widens the polygon along the shared direction", () => {
    const polyPerp = junctionPolygon(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      40,
      { x: 0, y: 1 },
      40,
    );
    const polyOblique = junctionPolygon(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      40,
      { x: Math.SQRT1_2, y: Math.SQRT1_2 }, // 45°
      40,
    );
    // For a glancing 45° crossing the polygon stretches — its bounding
    // box diameter is bigger than the perpendicular case.
    const diag = (poly: { x: number; y: number }[]) =>
      Math.max(...poly.map((p) => Math.hypot(p.x, p.y)));
    expect(diag(polyOblique)).toBeGreaterThan(diag(polyPerp));
  });

  it("near-parallel tangents fall back to a small square", () => {
    const poly = junctionPolygon(
      { x: 5, y: 5 },
      { x: 1, y: 0 },
      40,
      { x: 1, y: 0.05 }, // almost the same direction
      40,
    );
    // The four corners should describe a small axis-aligned square
    // around the crossing — the "near-parallel" fallback.
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(80);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(80);
  });
});

describe("clipPolylineAgainstCircles (seamless intersections)", () => {
  it("returns the input untouched when no circles are passed", () => {
    const poly = [0, 0, 10, 0, 20, 0];
    const out = clipPolylineAgainstCircles(poly, []);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(poly);
  });

  it("removes a segment entirely inside a circle", () => {
    // The single segment runs from (-5,0) to (5,0) — fully inside a
    // radius-10 circle centred at the origin.
    const out = clipPolylineAgainstCircles(
      [-5, 0, 5, 0],
      [{ x: 0, y: 0, r: 10 }],
    );
    expect(out).toEqual([]);
  });

  it("cuts a segment that enters and exits a circle", () => {
    // Segment runs from x=-20 to x=20 along y=0. The circle at origin
    // with r=5 carves out [-5, +5] from the middle.
    const out = clipPolylineAgainstCircles(
      [-20, 0, 20, 0],
      [{ x: 0, y: 0, r: 5 }],
    );
    expect(out).toHaveLength(2);
    // Left piece ends near x=-5
    expect(out[0]![0]).toBe(-20);
    expect(out[0]![2]).toBeCloseTo(-5);
    // Right piece starts near x=5
    expect(out[1]![0]).toBeCloseTo(5);
    expect(out[1]![2]).toBe(20);
  });

  it("clips against multiple circles simultaneously", () => {
    const out = clipPolylineAgainstCircles(
      [-50, 0, 50, 0],
      [
        { x: -20, y: 0, r: 5 },
        { x: 20, y: 0, r: 5 },
      ],
    );
    // Original segment is cut twice → 3 surviving pieces.
    expect(out).toHaveLength(3);
  });

  it("leaves a segment alone when the circle doesn't touch it", () => {
    const out = clipPolylineAgainstCircles(
      [0, 0, 10, 0],
      [{ x: 50, y: 50, r: 5 }],
    );
    expect(out).toEqual([[0, 0, 10, 0]]);
  });

  it("handles a multi-segment polyline where each segment is clipped", () => {
    // L-shape: horizontal then vertical. A circle at the corner clips
    // the tail of the first segment AND the head of the second.
    const out = clipPolylineAgainstCircles(
      [0, 0, 50, 0, 50, 50],
      [{ x: 50, y: 0, r: 10 }],
    );
    // Each surviving piece is a straight chord — at least two pieces:
    // - left half of the horizontal segment
    // - bottom half of the vertical segment
    expect(out.length).toBeGreaterThanOrEqual(2);
    // The first piece's first x stays at the origin
    expect(out[0]![0]).toBe(0);
  });
});

describe("junctionPolygonFromSegments", () => {
  it("agrees with `junctionPolygon` on a perpendicular polyline pair", () => {
    const a = [-50, 0, 50, 0];
    const b = [0, -50, 0, 50];
    const poly = junctionPolygonFromSegments(
      a,
      0,
      40,
      b,
      0,
      30,
      { x: 0, y: 0 },
    );
    const expected = junctionPolygon(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      40,
      { x: 0, y: 1 },
      30,
    );
    expect(poly).toHaveLength(4);
    expect(expected).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(poly[i]!.x).toBeCloseTo(expected[i]!.x);
      expect(poly[i]!.y).toBeCloseTo(expected[i]!.y);
    }
  });
});
