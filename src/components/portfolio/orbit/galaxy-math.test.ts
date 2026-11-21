import { describe, expect, it } from "vitest";
import { ageOf, dateRange, dust, multiply, orbitView, perspective, pick, radiusAt, starPositions, toScreen, yearRings } from "./galaxy-math";

const P = [
  { created: "2022-01-01T00:00:00Z", seed: 0.1 },
  { created: "2023-06-01T00:00:00Z", seed: 0.5 },
  { created: "2024-06-01T00:00:00Z", seed: 0.7 },
  { created: "2026-01-01T00:00:00Z", seed: 0.9 },
];

describe("galaxy layout", () => {
  it("maps age to radius: newest at the core, oldest at the rim", () => {
    const range = dateRange(P);
    expect(ageOf(P[3].created, range)).toBe(0);
    expect(ageOf(P[0].created, range)).toBe(1);
    expect(radiusAt(0)).toBeLessThan(radiusAt(0.5));
    expect(radiusAt(1)).toBeCloseTo(1);
    const r = starPositions(P).map(([x, , z]) => Math.hypot(x, z));
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeLessThan(r[i - 1]);
  });

  it("is deterministic", () => {
    expect(starPositions(P)).toEqual(starPositions(P));
    expect(dust(500, 3).pos).toEqual(dust(500, 3).pos);
    expect(dust(500, 3).pos).not.toEqual(dust(500, 4).pos);
  });

  it("puts a ring at each new year, shrinking toward the present", () => {
    const rings = yearRings(P);
    expect(rings.map((r) => r.year)).toEqual([2023, 2024, 2025, 2026]);
    for (let i = 1; i < rings.length; i++) expect(rings[i].r).toBeLessThan(rings[i - 1].r);
  });

  it("keeps dust inside a disc", () => {
    const d = dust(2000, 1);
    expect(d.pos).toHaveLength(6000);
    for (let i = 0; i < 2000; i++) {
      expect(Math.hypot(d.pos[i * 3], d.pos[i * 3 + 2])).toBeLessThan(1.6);
      expect(Math.abs(d.pos[i * 3 + 1])).toBeLessThan(0.2);
    }
  });
});

describe("camera and picking", () => {
  const mvp = multiply(perspective(0.8, 16 / 9, 0.1, 20), orbitView(0.3, 1, 2.5));

  it("projects the centre of the galaxy to the centre of the screen", () => {
    const s = toScreen(mvp, [0, 0, 0], 1600, 900)!;
    expect(s.x).toBeCloseTo(800, 3);
    expect(s.y).toBeCloseTo(450, 3);
    expect(s.w).toBeCloseTo(2.5, 3);
  });

  it("multiplies by the identity without change", () => {
    const id = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(Array.from(multiply(id, mvp))).toEqual(Array.from(mvp));
  });

  it("returns null behind the camera", () => {
    expect(toScreen(multiply(perspective(0.8, 1, 0.1, 20), orbitView(0, 0, 2)), [0, 0, 5], 100, 100)).toBeNull();
  });

  it("picks the nearest star within the radius", () => {
    const screen = [{ x: 10, y: 10 }, null, { x: 40, y: 40 }, { x: 18, y: 10 }];
    expect(pick(screen, 16, 10, 20)).toBe(3);
    expect(pick(screen, 39, 41, 20)).toBe(2);
    expect(pick(screen, 200, 200, 20)).toBe(-1);
  });
});
