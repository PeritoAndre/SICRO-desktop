/**
 * Pure geometry helpers — Spike E.
 *
 * No React, no Konva. Just numbers in / numbers out. Easy to unit-test.
 * If the math is wrong here, every measurement on the canvas is wrong.
 */

import type { SicroPoint } from "./schema";

export function distancePx(a: SicroPoint, b: SicroPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calibrate a scale from two clicked points + the real-world distance the
 * user declares. Returns `pxPerMeter`. Throws when the points coincide.
 */
export function computePxPerMeter(
  p1: SicroPoint,
  p2: SicroPoint,
  realDistanceM: number,
): number {
  if (realDistanceM <= 0 || !Number.isFinite(realDistanceM)) {
    throw new Error("real distance must be a positive finite number");
  }
  const px = distancePx(p1, p2);
  if (px <= 0) {
    throw new Error("scale calibration requires two distinct points");
  }
  return px / realDistanceM;
}

/**
 * Convert a pixel distance to meters using the active scale.
 * Returns null when the scale isn't defined yet — callers decide whether
 * to render "px N" or "—".
 */
export function pxToMeters(
  pxDistance: number,
  pxPerMeter: number | null | undefined,
): number | null {
  if (!pxPerMeter || pxPerMeter <= 0) return null;
  return pxDistance / pxPerMeter;
}

/** Human-friendly label for a measurement. Uses meters when scale exists. */
export function formatMeasurement(
  pxDistance: number,
  pxPerMeter: number | null | undefined,
): string {
  const meters = pxToMeters(pxDistance, pxPerMeter);
  if (meters == null) {
    return `${pxDistance.toFixed(0)} px`;
  }
  if (meters < 1) {
    return `${(meters * 100).toFixed(0)} cm`;
  }
  if (meters < 10) {
    return `${meters.toFixed(2)} m`;
  }
  return `${meters.toFixed(1)} m`;
}

/**
 * Midpoint — used to position the measurement label between the two anchors.
 */
export function midpoint(a: SicroPoint, b: SicroPoint): SicroPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Angle (in degrees) of the segment a → b relative to the +x axis.
 * Used to rotate the measurement label so it lays along the segment.
 */
export function angleDeg(a: SicroPoint, b: SicroPoint): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}
