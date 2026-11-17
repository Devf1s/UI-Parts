import { describe, expect, it } from "vitest";
import { edge, outlineAt, type Geo } from "./venom-gl";

const pill: Geo = { cx: 100, cy: 50, hw: 90, hh: 30, r: 30, top: 14 };
const card: Geo = { cx: 0, cy: 0, hw: 80, hh: 30, r: 12, top: 14 };

describe("slab outline geometry", () => {
  it("matches the original pill formula when the radius is half the height", () => {
    // straight edge below the centre, and on the right cap
    expect(edge(100, 120, pill)).toMatchObject({ x: 100, y: 80, nx: 0, ny: 1 });
    expect(edge(100, 120, pill).d).toBeCloseTo(40);
    const e = edge(260, 50, pill);
    expect(e.x).toBeCloseTo(190);
    expect(e.nx).toBeCloseTo(1);
    expect(e.d).toBeCloseTo(70);
  });

  it("gives signed distance and a unit outward normal for a rounded rectangle", () => {
    for (const [x, y] of [[0, -50], [120, 0], [100, 40], [-95, -45], [10, 5], [-70, 2]]) {
      const e = edge(x, y, card);
      expect(Math.hypot(e.nx, e.ny)).toBeCloseTo(1);
      // the returned point lies on the outline: its own distance is zero
      expect(edge(e.x + e.nx * 1e-3, e.y + e.ny * 1e-3, card).d).toBeCloseTo(0, 2);
      // walking back along the normal by d lands on the outline
      expect(Math.hypot(x - e.nx * e.d - e.x, y - e.ny * e.d - e.y)).toBeLessThan(1e-6);
    }
    expect(edge(0, 0, card).d).toBeCloseTo(-30); // centre: nearest side is the long one
    expect(edge(100, 40, card).d).toBeGreaterThan(0); // past a rounded corner
  });

  it("insets anchor points into the body along the normal", () => {
    const e = edge(0, 80, card, 8);
    expect(e.y).toBeCloseTo(22);
  });

  it("walks the whole outline continuously, for pills and rounded rectangles", () => {
    for (const g of [pill, card]) {
      let prev = outlineAt(0, g);
      let length = 0;
      for (let i = 1; i <= 400; i++) {
        const p = outlineAt(i / 400, g);
        const step = Math.hypot(p.x - prev.x, p.y - prev.y);
        expect(step).toBeLessThan(5); // no jumps between segments
        expect(Math.abs(edge(p.x + p.nx * 1e-3, p.y + p.ny * 1e-3, g).d)).toBeLessThan(0.01);
        length += step;
        prev = p;
      }
      const perimeter = 4 * (g.hw - g.r) + 4 * (g.hh - g.r) + 2 * Math.PI * g.r;
      expect(length).toBeGreaterThan(perimeter * 0.97);
      expect(length).toBeLessThan(perimeter * 1.03);
    }
  });
});
