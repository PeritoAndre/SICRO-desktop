/**
 * G12 — Testes para os novos factories e cálculos geométricos.
 */

import { describe, expect, it } from "vitest";
import {
  angleDegrees,
  distance,
  makeAngle,
  makeFreehand,
  makePolygon,
  polygonArea,
  polygonPerimeter,
} from "./factories";

describe("G12 — geometry helpers", () => {
  it("distance returns euclidean", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("polygonArea computes square correctly", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(polygonArea(square)).toBe(100);
  });

  it("polygonPerimeter computes square correctly", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(polygonPerimeter(square)).toBe(40);
  });

  it("polygonArea returns 0 for fewer than 3 points", () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });

  it("angleDegrees computes right angle", () => {
    const a = angleDegrees(
      { x: 1, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    );
    expect(a).toBeCloseTo(90, 3);
  });

  it("angleDegrees of straight line is 180", () => {
    const a = angleDegrees(
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    );
    expect(a).toBeCloseTo(180, 3);
  });

  it("angleDegrees with zero-length vector returns 0", () => {
    const a = angleDegrees(
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    );
    expect(a).toBe(0);
  });
});

describe("G12 — new annotation factories", () => {
  it("makePolygon stores points and uses first as anchor", () => {
    const pts = [
      { x: 5, y: 10 },
      { x: 20, y: 10 },
      { x: 15, y: 25 },
    ];
    const ann = makePolygon(pts);
    expect(ann.kind).toBe("polygon");
    expect(ann.x).toBe(5);
    expect(ann.y).toBe(10);
    expect(ann.points).toEqual(pts);
  });

  it("makeAngle stores 3 points with vertex in middle", () => {
    const ann = makeAngle(
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    );
    expect(ann.kind).toBe("angle");
    expect(ann.points).toHaveLength(3);
    expect(ann.x).toBe(10);
    expect(ann.y).toBe(10);
  });

  it("makeFreehand keeps the captured points sequence", () => {
    const pts = Array.from({ length: 5 }, (_, i) => ({
      x: i * 2,
      y: i * 3,
    }));
    const ann = makeFreehand(pts);
    expect(ann.kind).toBe("freehand");
    expect(ann.points).toHaveLength(5);
  });

  it("polygon factory tolerates empty array (degenerate)", () => {
    const ann = makePolygon([]);
    expect(ann.x).toBe(0);
    expect(ann.y).toBe(0);
    expect(ann.points).toEqual([]);
  });
});
