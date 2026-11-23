import { describe, expect, it } from "vitest";
import { createString, displacement, energy, pluck, stepString } from "./string-modes";

describe("plucked string", () => {
  it("starts at rest and its ends never move", () => {
    const s = createString(5);
    expect(energy(s)).toBe(0);
    pluck(s, 0.3, 8);
    expect(displacement(s, 0)).toBeCloseTo(0, 9);
    expect(displacement(s, 1)).toBeCloseTo(0, 9);
  });

  it("takes the triangle shape of the pluck", () => {
    const s = createString(5);
    pluck(s, 0.3, 8);
    // ten modes get close to the peak and keep the triangle's shape
    expect(displacement(s, 0.3)).toBeGreaterThan(7);
    expect(displacement(s, 0.3)).toBeLessThan(8.2);
    expect(displacement(s, 0.65)).toBeCloseTo(4, 0);
  });

  it("swings to the other side after half a period", () => {
    const s = createString(5);
    pluck(s, 0.5, 6);
    const y0 = displacement(s, 0.5);
    stepString(s, 1 / 10); // half the 5 Hz period
    expect(Math.sign(displacement(s, 0.5))).toBe(-Math.sign(y0));
  });

  it("dies away, exactly the same for any frame rate", () => {
    const a = createString(6), b = createString(6);
    pluck(a, 0.4, 5);
    pluck(b, 0.4, 5);
    for (let i = 0; i < 60; i++) stepString(a, 1 / 60);
    for (let i = 0; i < 20; i++) stepString(b, 1 / 20);
    expect(displacement(a, 0.37)).toBeCloseTo(displacement(b, 0.37), 9);
    for (let i = 0; i < 60 * 4; i++) stepString(a, 1 / 60);
    expect(energy(a)).toBeLessThan(0.02);
  });
});
