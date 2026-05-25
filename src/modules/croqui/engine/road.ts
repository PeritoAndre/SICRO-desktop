/**
 * Road Engine helpers — geometry utilities for MVP 9 Road Engine Pro.
 *
 * Two categories of helpers:
 *   - Spline sampling (used by intersection detection and by exporters
 *     that need the actual rasterised polyline; Konva.Line uses its own
 *     `tension` algorithm for the on-screen render).
 *   - Segment-segment intersection + polyline bookkeeping.
 *
 * All helpers operate on the flat-array `points: number[]` convention
 * shared by `SicroLineObject` and `SicroRoadObject` —
 * `[x1, y1, x2, y2, ...]`.
 *
 * Pure functions only — no Konva imports, no React. The renderer
 * (CanvasStage) consumes these results; the tools (Toolbar / engine)
 * can call them too without coupling to the UI.
 */

import type { SicroPoint } from "./schema";

/** Convert flat `[x1,y1,...]` into typed pairs. */
export function pairsOf(points: number[]): SicroPoint[] {
  const out: SicroPoint[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i] as number;
    const y = points[i + 1] as number;
    out.push({ x, y });
  }
  return out;
}

/** Convert pairs back into the flat-array convention. */
export function flattenPairs(pairs: SicroPoint[]): number[] {
  const out: number[] = [];
  for (const p of pairs) out.push(p.x, p.y);
  return out;
}

/**
 * 2D segment-segment intersection — returns the crossing point or null.
 * Uses the standard parametric form `a1 + t·(a2-a1) = b1 + u·(b2-b1)`.
 */
export function segmentIntersect(
  a1: SicroPoint,
  a2: SicroPoint,
  b1: SicroPoint,
  b2: SicroPoint,
): SicroPoint | null {
  const rx = a2.x - a1.x;
  const ry = a2.y - a1.y;
  const sx = b2.x - b1.x;
  const sy = b2.y - b1.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null; // parallel / collinear
  const qpx = b1.x - a1.x;
  const qpy = b1.y - a1.y;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: a1.x + t * rx, y: a1.y + t * ry };
  }
  return null;
}

/** Find all intersections between two polylines (flat-array form). */
export function polylineIntersections(
  a: number[],
  b: number[],
): SicroPoint[] {
  const out: SicroPoint[] = [];
  const ap = pairsOf(a);
  const bp = pairsOf(b);
  for (let i = 0; i + 1 < ap.length; i++) {
    const a1 = ap[i] as SicroPoint;
    const a2 = ap[i + 1] as SicroPoint;
    for (let j = 0; j + 1 < bp.length; j++) {
      const b1 = bp[j] as SicroPoint;
      const b2 = bp[j + 1] as SicroPoint;
      const p = segmentIntersect(a1, a2, b1, b2);
      if (p) out.push(p);
    }
  }
  return out;
}

/**
 * Detailed polyline-polyline intersection — same as
 * `polylineIntersections` but additionally returns the two segment
 * indices the crossing was found on. The Road Engine needs those to
 * compute the local tangents at the junction, which in turn shapes
 * the junction polygon.
 */
export interface PolylineIntersectionHit {
  point: SicroPoint;
  /** Index of the segment in `a` (0-based, segment goes a[i]→a[i+1]). */
  iSegment: number;
  /** Index of the segment in `b`. */
  jSegment: number;
}

export function polylineIntersectionsDetailed(
  a: number[],
  b: number[],
): PolylineIntersectionHit[] {
  const out: PolylineIntersectionHit[] = [];
  const ap = pairsOf(a);
  const bp = pairsOf(b);
  for (let i = 0; i + 1 < ap.length; i++) {
    const a1 = ap[i] as SicroPoint;
    const a2 = ap[i + 1] as SicroPoint;
    for (let j = 0; j + 1 < bp.length; j++) {
      const b1 = bp[j] as SicroPoint;
      const b2 = bp[j + 1] as SicroPoint;
      const p = segmentIntersect(a1, a2, b1, b2);
      if (p) out.push({ point: p, iSegment: i, jSegment: j });
    }
  }
  return out;
}

/**
 * Compute the unit-tangent of a single segment of a polyline. Falls
 * back to +x when the segment is degenerate (zero length).
 */
function segmentUnitVector(
  points: number[],
  segIndex: number,
): SicroPoint {
  const i = segIndex * 2;
  const x1 = points[i] ?? 0;
  const y1 = points[i + 1] ?? 0;
  const x2 = points[i + 2] ?? x1;
  const y2 = points[i + 3] ?? y1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

/**
 * Junction polygon — the parallelogram-shaped overlap of two crossing
 * road "tubes". Given:
 *
 *   - the crossing point (in canvas pixels),
 *   - the unit-tangent of road A at that crossing,
 *   - half the paved width of road A,
 *   - the unit-tangent of road B and half its paved width,
 *
 * returns the four corners of the parallelogram (counter-clockwise),
 * which exactly cover the area where both road bodies overlap.
 *
 * Falls back to a small square when the two tangents are near-parallel
 * (`|sinθ| < ~0.15`) so a glancing crossing doesn't produce a
 * disproportionately large patch.
 *
 * Returning a polygon (not a circle) is the key to making the
 * intersection look like a real road junction instead of a remend:
 *
 *   - it perfectly tracks the asphalt of *both* roads;
 *   - it doesn't protrude past either road's edge;
 *   - it covers the conflicting markings inside the junction;
 *   - the unmodified asphalt body of each road extends right up to it,
 *     so the centre / edge lines stop at the junction boundary.
 */
export function junctionPolygon(
  crossing: SicroPoint,
  tangentA: SicroPoint,
  halfWidthA: number,
  tangentB: SicroPoint,
  halfWidthB: number,
): SicroPoint[] {
  // Normals perpendicular to each tangent — these define the strip
  // inequalities `|p · normal_x| <= halfWidth_x` that bound the road
  // bodies near the crossing.
  const nA = { x: -tangentA.y, y: tangentA.x };
  const nB = { x: -tangentB.y, y: tangentB.x };
  const det = nA.x * nB.y - nA.y * nB.x; // |det| = |sin(θ)|
  if (Math.abs(det) < 0.15) {
    // Near-parallel — the analytic polygon would extend far along the
    // shared direction. Fall back to a small square anchored at the
    // crossing so the visual remains plausible.
    const sz = Math.min(halfWidthA, halfWidthB);
    return [
      { x: crossing.x - sz, y: crossing.y - sz },
      { x: crossing.x + sz, y: crossing.y - sz },
      { x: crossing.x + sz, y: crossing.y + sz },
      { x: crossing.x - sz, y: crossing.y + sz },
    ];
  }
  const signs: Array<[number, number]> = [
    [+1, +1],
    [-1, +1],
    [-1, -1],
    [+1, -1],
  ];
  return signs.map(([sa, sb]) => {
    const rhs1 = sa * halfWidthA;
    const rhs2 = sb * halfWidthB;
    const px = (rhs1 * nB.y - rhs2 * nA.y) / det;
    const py = (rhs2 * nA.x - rhs1 * nB.x) / det;
    return { x: crossing.x + px, y: crossing.y + py };
  });
}

/**
 * Convenience helper used by the renderer: returns the junction polygon
 * computed from raw point arrays + segment indices (as produced by
 * `polylineIntersectionsDetailed`).
 */
export function junctionPolygonFromSegments(
  pointsA: number[],
  segA: number,
  halfWidthA: number,
  pointsB: number[],
  segB: number,
  halfWidthB: number,
  crossing: SicroPoint,
): SicroPoint[] {
  const tanA = segmentUnitVector(pointsA, segA);
  const tanB = segmentUnitVector(pointsB, segB);
  return junctionPolygon(crossing, tanA, halfWidthA, tanB, halfWidthB);
}

/**
 * Clip a polyline against a list of "exclusion circles" — returns the
 * sub-polylines that lie OUTSIDE every circle.
 *
 * Used by the Road Engine renderer to make markings (edge lines,
 * center lines, lane dividers) physically disappear inside road
 * junctions instead of just being covered by a patch. The result is a
 * truly seamless intersection: there's no line under the patch that
 * could "leak" if the patch alpha or fill differed.
 *
 * Each output entry is a flat `[x1,y1,x2,y2,...]` polyline ready to
 * feed back into Konva.Line. Empty list means the original polyline
 * was entirely inside the exclusion circles.
 */
export interface ClipCircle {
  x: number;
  y: number;
  r: number;
}

export function clipPolylineAgainstCircles(
  points: number[],
  circles: ReadonlyArray<ClipCircle>,
): number[][] {
  if (circles.length === 0) {
    return points.length >= 4 ? [[...points]] : [];
  }
  const out: number[][] = [];
  const pairs = pairsOf(points);
  for (let i = 0; i + 1 < pairs.length; i++) {
    const a = pairs[i] as SicroPoint;
    const b = pairs[i + 1] as SicroPoint;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // For each segment, build the list of OUTSIDE intervals in [0, 1].
    // Start with the full segment; subtract each circle's inside range.
    let intervals: Array<[number, number]> = [[0, 1]];
    for (const c of circles) {
      if (intervals.length === 0) break;
      const fx = a.x - c.x;
      const fy = a.y - c.y;
      const A = dx * dx + dy * dy;
      const B = 2 * (fx * dx + fy * dy);
      const C = fx * fx + fy * fy - c.r * c.r;
      if (A < 1e-12) continue;
      const disc = B * B - 4 * A * C;
      if (disc < 0) continue; // segment line doesn't intersect circle
      const sq = Math.sqrt(disc);
      let t1 = (-B - sq) / (2 * A);
      let t2 = (-B + sq) / (2 * A);
      if (t1 > t2) [t1, t2] = [t2, t1];
      const inStart = Math.max(t1, 0);
      const inEnd = Math.min(t2, 1);
      if (inEnd <= inStart) continue; // intersection outside [0,1]
      // Subtract [inStart, inEnd] from each existing OUTSIDE interval.
      const next: Array<[number, number]> = [];
      for (const [s, e] of intervals) {
        if (inEnd <= s || inStart >= e) {
          next.push([s, e]);
          continue;
        }
        if (inStart > s) next.push([s, inStart]);
        if (inEnd < e) next.push([inEnd, e]);
      }
      intervals = next;
    }
    for (const [s, e] of intervals) {
      if (e - s < 1e-6) continue;
      out.push([
        a.x + s * dx,
        a.y + s * dy,
        a.x + e * dx,
        a.y + e * dy,
      ]);
    }
  }
  return out;
}

/**
 * Catmull-Rom open-spline sampler.
 *
 * Produces a denser flat-array polyline that approximates a smooth
 * curve through every input point. `tension` follows the same
 * convention as Konva.Line — 0 ≈ straight chord, 0.5 = smooth, 1 ≈
 * exaggerated curvature.
 *
 * Used by intersection detection (when we need to test the *visible*
 * curve, not the raw control polyline) and by exporters. Konva.Line
 * renders the on-screen curve via its built-in `tension` prop, so the
 * renderer does **not** call this — they're decoupled.
 */
export function sampleCatmullRom(
  points: number[],
  samplesPerSegment = 12,
  tension = 0.5,
): number[] {
  const pairs = pairsOf(points);
  if (pairs.length < 2) return [...points];
  const samples = samplesPerSegment < 1 ? 1 : samplesPerSegment;

  // Open spline: duplicate the endpoints so the curve passes through them.
  const first = pairs[0] as SicroPoint;
  const last = pairs[pairs.length - 1] as SicroPoint;
  const ext: SicroPoint[] = [first, ...pairs, last];
  const out: number[] = [];
  const ten = 1 - tension;

  for (let i = 0; i + 3 < ext.length; i++) {
    const p0 = ext[i] as SicroPoint;
    const p1 = ext[i + 1] as SicroPoint;
    const p2 = ext[i + 2] as SicroPoint;
    const p3 = ext[i + 3] as SicroPoint;
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      // Catmull-Rom basis scaled by tension.
      const c0 = -ten * t + 2 * ten * t2 - ten * t3;
      const c1 = 1 + (ten - 3) * t2 + (2 - ten) * t3;
      const c2 = ten * t + (3 - 2 * ten) * t2 + (ten - 2) * t3;
      const c3 = -ten * t2 + ten * t3;
      const x = c0 * p0.x + c1 * p1.x + c2 * p2.x + c3 * p3.x;
      const y = c0 * p0.y + c1 * p1.y + c2 * p2.y + c3 * p3.y;
      out.push(x, y);
    }
  }
  // Always include the very last point.
  out.push(last.x, last.y);
  return out;
}

/** Axis-aligned bounding box of a polyline. Returns null when empty. */
export function polylineBBox(
  points: number[],
): { x: number; y: number; w: number; h: number } | null {
  if (points.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i] as number;
    const y = points[i + 1] as number;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Approximate polyline length in pixels (sum of euclidean segments). */
export function polylineLength(points: number[]): number {
  let total = 0;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const x1 = points[i] as number;
    const y1 = points[i + 1] as number;
    const x2 = points[i + 2] as number;
    const y2 = points[i + 3] as number;
    total += Math.hypot(x2 - x1, y2 - y1);
  }
  return total;
}

/**
 * Tangent (unit vector) at a given index in a polyline. Falls back to
 * the previous or next segment when at a boundary.
 */
export function tangentAt(points: number[], index: number): SicroPoint {
  const pairs = pairsOf(points);
  if (pairs.length < 2) return { x: 1, y: 0 };
  const i = Math.max(0, Math.min(pairs.length - 1, index));
  const a = pairs[Math.max(0, i - 1)] as SicroPoint;
  const b = pairs[Math.min(pairs.length - 1, i + 1)] as SicroPoint;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

/** Perpendicular (right-hand normal) of a unit tangent. */
export function normalOf(tangent: SicroPoint): SicroPoint {
  return { x: -tangent.y, y: tangent.x };
}

/** Squared euclidean distance — cheap predicate for "is point near?". */
export function distSq(a: SicroPoint, b: SicroPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Offset a polyline perpendicular to its tangent at every control point.
 * Positive `distance` offsets to the right of travel direction (the
 * standard "right-hand normal"). Used to render road edge lines.
 *
 * This is a *cheap* offset — it does not handle self-intersection of the
 * offset path, sharp inside corners, or variable-width offsets. Good
 * enough for road edges where the spline is smooth and the offset is
 * small relative to the polyline length.
 */
export function offsetPolyline(
  points: number[],
  distance: number,
): number[] {
  const pairs = pairsOf(points);
  if (pairs.length < 2) return [];
  const out: number[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const tan = tangentAt(points, i);
    const norm = normalOf(tan);
    const p = pairs[i] as SicroPoint;
    out.push(p.x + norm.x * distance, p.y + norm.y * distance);
  }
  return out;
}

/**
 * Geometry of a crosswalk patch at one end of a road. Returns the
 * centerline midpoint, the perpendicular axis (unit vector) and the
 * along-road axis. Renderer uses these to lay zebra stripes.
 */
export function endcapBasis(
  points: number[],
  end: "start" | "end",
): { center: SicroPoint; along: SicroPoint; across: SicroPoint } | null {
  const pairs = pairsOf(points);
  if (pairs.length < 2) return null;
  const center =
    end === "start" ? (pairs[0] as SicroPoint) : (pairs[pairs.length - 1] as SicroPoint);
  const idx = end === "start" ? 0 : pairs.length - 1;
  const along = tangentAt(points, idx);
  const across = normalOf(along);
  return { center, along, across };
}
