import { describe, expect, it } from "vitest";
import { celsius, createHeatField, ironbow, splat, stepHeat, totalHeat } from "./heat-field";

describe("heat field", () => {
  it("a splat adds heat centred where it was rubbed", () => {
    const f = createHeatField(20, 10);
    splat(f, 5.5, 4.5, 1.5, 1);
    expect(f.t[4 * 20 + 5]).toBeCloseTo(1, 5);
    expect(f.t[4 * 20 + 5]).toBeGreaterThan(f.t[4 * 20 + 7]);
    expect(f.t[4 * 20 + 15]).toBe(0);
  });

  it("spreads, rises and cools back to ambient", () => {
    const f = createHeatField(30, 12);
    splat(f, 15, 9, 1.5, 1.2);
    const before = totalHeat(f);
    stepHeat(f, 1 / 60);
    // spread: a neighbour two cells away warmed up
    expect(f.t[9 * 30 + 18]).toBeGreaterThan(0);
    expect(totalHeat(f)).toBeLessThan(before);
    // rise: after a while the row above is warmer than the row below
    for (let i = 0; i < 30; i++) stepHeat(f, 1 / 60);
    expect(f.t[7 * 30 + 15]).toBeGreaterThan(f.t[11 * 30 + 15]);
    // cool: a few seconds later it is back to ambient, cell for cell
    for (let i = 0; i < 60 * 8; i++) stepHeat(f, 1 / 60);
    expect(f.max).toBeLessThan(0.004);
  });

  it("stays stable with a long frame", () => {
    const f = createHeatField(16, 8);
    splat(f, 8, 4, 1, 1);
    for (let i = 0; i < 20; i++) stepHeat(f, 1 / 20);
    expect(f.t.every((v) => Number.isFinite(v) && v >= 0 && v <= 1.01)).toBe(true);
  });

  it("tracks the hottest cell", () => {
    const f = createHeatField(20, 6);
    splat(f, 3.5, 2.5, 1, 1);
    stepHeat(f, 1 / 60);
    expect(f.maxAt % 20).toBe(3);
  });

  it("palette runs from the cold colour to white-hot", () => {
    const lut = ironbow([0, 0, 0]);
    expect(lut[0] & 0xffffff).toBe(0);
    expect(lut[255] & 0xff).toBe(255);
    expect(celsius(0)).toBe(22);
    expect(celsius(1)).toBe(36);
  });
});
