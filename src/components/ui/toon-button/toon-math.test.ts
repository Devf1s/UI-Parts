import { describe, expect, it } from "vitest";
import { burst, clampToEllipse, focusLines, lookOffset, rng, springStep } from "./toon-math";

describe("lookOffset", () => {
  it("looks straight ahead when the pointer is on the eye", () => {
    expect(lookOffset(0, 0, 3, 3)).toEqual({ x: 0, y: 0 });
  });
  it("turns towards the pointer and never leaves the eye", () => {
    const near = lookOffset(20, 0, 3, 2.5);
    const far = lookOffset(2000, 0, 3, 2.5);
    expect(near.x).toBeGreaterThan(0);
    expect(far.x).toBeGreaterThan(near.x);
    expect(far.x).toBeLessThanOrEqual(3 + 1e-9);
    const up = lookOffset(-300, -300, 3, 2.5);
    expect(up.x).toBeLessThan(0);
    expect(up.y).toBeLessThan(0);
    expect((up.x / 3) ** 2 + (up.y / 2.5) ** 2).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("clampToEllipse", () => {
  it("keeps points inside and pulls outside points onto the rim", () => {
    expect(clampToEllipse(1, 1, 3, 3)).toEqual({ x: 1, y: 1 });
    const p = clampToEllipse(10, 0, 3, 2);
    expect(p.x).toBeCloseTo(3);
    expect(p.y).toBe(0);
  });
});

describe("springStep", () => {
  it("overshoots a little and settles on the target", () => {
    let s = { pos: 0, vel: 0 };
    let peak = 0;
    for (let i = 0; i < 240; i++) {
      s = springStep(s.pos, s.vel, 1, 1 / 60);
      peak = Math.max(peak, s.pos);
    }
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.4);
    expect(s.pos).toBeCloseTo(1, 3);
    expect(Math.abs(s.vel)).toBeLessThan(1e-3);
  });
  it("stays stable at a slow frame rate", () => {
    let s = { pos: 0, vel: 0 };
    for (let i = 0; i < 120; i++) s = springStep(s.pos, s.vel, 1, 1 / 20);
    expect(s.pos).toBeCloseTo(1, 2);
  });
});

describe("seeded shapes", () => {
  it("rng is deterministic and in [0, 1)", () => {
    const a = rng(3), b = rng(3);
    for (let i = 0; i < 50; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it("focus lines: one wedge per line, identical for a seed, centre left clear", () => {
    const d = focusLines(7, 40, 560, 170);
    expect(d).toBe(focusLines(7, 40, 560, 170));
    expect(d).not.toBe(focusLines(8, 40, 560, 170));
    expect(d.match(/M/g)).toHaveLength(40);
    // every inner tip stays out of the middle of the box
    const tips = [...d.matchAll(/L([\d.-]+) ([\d.-]+)L/g)].map((m) => [+m[1], +m[2]]);
    expect(tips).toHaveLength(40);
    for (const [x, y] of tips) expect(((x - 280) / 280) ** 2 + ((y - 85) / 85) ** 2).toBeGreaterThan(0.3);
  });
  it("burst: a closed star with 2n corners", () => {
    const d = burst(5, 12, 30, 50);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/[ML]/g)).toHaveLength(24);
  });
});
