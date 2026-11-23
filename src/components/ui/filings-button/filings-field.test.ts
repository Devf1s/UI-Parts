import { describe, expect, it } from "vitest";
import { align, fieldAt, needleDelta, scatter, type Pole } from "./filings-field";

const bar: Pole[] = [
  { x: 0, y: 0, q: -40 },
  { x: 100, y: 0, q: 40 },
];

describe("magnetic field", () => {
  it("points away from a north pole and into a south pole", () => {
    const [bx] = fieldAt(150, 0, bar);
    expect(bx).toBeGreaterThan(0);
    const [bxs] = fieldAt(-50, 0, bar);
    expect(bxs).toBeGreaterThan(0); // flows into S from the left
    const [, byMid] = fieldAt(50, 30, bar);
    expect(Math.abs(byMid)).toBeLessThan(1e-9); // symmetric: horizontal above the middle
  });

  it("gets weaker with distance", () => {
    const near = Math.hypot(...fieldAt(110, 0, bar));
    const far = Math.hypot(...fieldAt(300, 0, bar));
    expect(near).toBeGreaterThan(far * 10);
  });
});

describe("needles", () => {
  it("turn the short way, ignoring head and tail", () => {
    expect(needleDelta(0, Math.PI)).toBeCloseTo(0);
    expect(needleDelta(0.1, Math.PI - 0.1)).toBeCloseTo(-0.2);
    expect(needleDelta(0, Math.PI / 4)).toBeCloseTo(Math.PI / 4);
    expect(Math.abs(needleDelta(3, -2))).toBeLessThanOrEqual(Math.PI / 2);
  });

  it("settle along the field lines, then stop moving", () => {
    const f = scatter(100, 30, 10, 7);
    const poles: Pole[] = [
      { x: 10, y: 15, q: -40 },
      { x: 90, y: 15, q: 40 },
    ];
    let worst = Infinity;
    for (let i = 0; i < 240 && worst > 1e-3; i++) worst = align(f, poles, 1 / 60);
    expect(worst).toBeLessThan(1e-3);
    // a filing midway between the poles lies horizontal
    let best = Infinity, angle = 0;
    for (let k = 0; k < f.length; k += 4) {
      const d = Math.hypot(f[k] - 50, f[k + 1] - 15);
      if (d < best) [best, angle] = [d, f[k + 3]];
    }
    expect(Math.abs(Math.sin(angle))).toBeLessThan(0.35);
  });

  it("scatter is deterministic for a seed", () => {
    expect(scatter(50, 20, 10, 3)).toEqual(scatter(50, 20, 10, 3));
    expect(scatter(50, 20, 10, 3)).not.toEqual(scatter(50, 20, 10, 4));
  });
});
