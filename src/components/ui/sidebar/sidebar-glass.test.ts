import { describe, expect, it } from "vitest";
import { shapePath } from "./sidebar-glass";

const cmds = (d: string) => d.replace(/[^A-Za-z]/g, "");
const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe("shapePath", () => {
  const rail = shapePath({ w: 76, h: 800, r: 26, bow: 6.6 });
  const open = shapePath({ w: 288, h: 800, r: 26, bow: 12 });

  it("keeps the same commands at every width, so the clip-path can interpolate", () => {
    expect(cmds(rail)).toBe(cmds(open));
    expect(nums(rail)).toHaveLength(nums(open).length);
  });

  it("stays inside its box", () => {
    const n = nums(open);
    const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(288);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(800);
  });

  it("bows the right edge in by `bow` at the waist and the left by a third", () => {
    expect(open).toContain("276 400"); // 288 - 12 at h/2
    expect(open).toContain("4.2 400"); // 12 * 0.35
  });

  it("control points never cross the waist (no loops on short panels)", () => {
    for (const h of [120, 300, 900]) {
      const n = nums(shapePath({ w: 200, h, r: 26, bow: 12 }));
      // first right-edge cubic: x1 y1 x2 y2 x y follow the first Q (M 2 + L 2 + Q 4 numbers)
      const [, y1, , y2, , y] = n.slice(8, 14);
      expect(y1).toBeLessThanOrEqual(y2);
      expect(y2).toBeLessThanOrEqual(y);
    }
  });

  it("clamps the radius on tiny boxes", () => {
    expect(() => shapePath({ w: 20, h: 20, r: 99, bow: 0 })).not.toThrow();
    expect(nums(shapePath({ w: 20, h: 20, r: 99, bow: 0 })).every(Number.isFinite)).toBe(true);
  });
});
