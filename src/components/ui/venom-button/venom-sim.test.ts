import { describe, expect, it } from "vitest";
import { gloveSites } from "./venom-draw";
import { N, Outline, VenomSim, type Body, type VenomConfig } from "./venom-sim";

const CFG: VenomConfig = {
  tendrils: 6,
  sense: 220,
  reach: 120,
  maxLength: 170,
  snapStretch: 1.6,
  gravity: 320,
  lunge: 1,
  thickness: 1,
  splash: 6,
  idle: true,
};

// A 200×56 pill placed inside a padded canvas, like the component does.
const BODY: Body = { x: 300, y: 300, w: 200, h: 56, r: 28 };
const DT = 1 / 60;

function run(sim: VenomSim, seconds: number, pointer: (t: number) => { x: number; y: number } | null) {
  for (let t = 0; t < seconds; t += DT) {
    const p = pointer(t);
    sim.step(DT, BODY, p, p ? gloveSites({ x: p.x, y: p.y, rot: 0 }) : null);
  }
}

function allFinite(sim: VenomSim) {
  for (const t of sim.tendrils) {
    for (let i = 0; i < N; i++) {
      if (!Number.isFinite(t.x[i]) || !Number.isFinite(t.y[i])) return false;
    }
    if (!Number.isFinite(t.R) || !Number.isFinite(t.stretch)) return false;
  }
  for (const d of sim.drops) if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) return false;
  return Number.isFinite(sim.tugX) && Number.isFinite(sim.tugY) && Number.isFinite(sim.glove);
}

/** Just below the bottom edge, `gap` px away from it. */
const below = (gap: number) => ({ x: BODY.x + BODY.w / 2, y: BODY.y + BODY.h + gap });

describe("Outline", () => {
  const o = new Outline();
  o.set(BODY);

  it("has the perimeter of a stadium", () => {
    const straight = 2 * (BODY.w - 2 * BODY.r);
    expect(o.perimeter).toBeCloseTo(straight + 2 * Math.PI * BODY.r, 3);
  });

  it("returns points on the shape with unit outward normals", () => {
    for (let s = 0; s < o.perimeter; s += 7) {
      const p = o.at(s);
      expect(Math.hypot(p.nx, p.ny)).toBeCloseTo(1, 5);
      // the outward normal must point away from the centre
      const cx = BODY.x + BODY.w / 2, cy = BODY.y + BODY.h / 2;
      expect((p.x - cx) * p.nx + (p.y - cy) * p.ny).toBeGreaterThan(0);
    }
  });

  it("closest() inverts at() for points pushed out along the normal", () => {
    for (let s = 3; s < o.perimeter; s += 11) {
      const p = o.at(s);
      const c = o.closest(p.x + p.nx * 20, p.y + p.ny * 20);
      expect(c.dist).toBeCloseTo(20, 1);
      expect(Math.abs(o.delta(c.s, s))).toBeLessThan(0.5);
    }
  });

  it("wrap() and delta() take the short way round", () => {
    expect(o.wrap(-1)).toBeCloseTo(o.perimeter - 1);
    expect(o.delta(1, o.perimeter - 1)).toBeCloseTo(-2);
  });

  it("handles a square body (radius larger than half the height)", () => {
    const sq = new Outline();
    sq.set({ x: 0, y: 0, w: 40, h: 40, r: 999 });
    expect(sq.perimeter).toBeCloseTo(2 * Math.PI * 20, 3);
  });
});

describe("VenomSim", () => {
  it("sleeps when nobody is near and idle is off", () => {
    const sim = new VenomSim({ ...CFG, idle: false });
    run(sim, 3, () => null);
    expect(sim.busy).toBe(false);
    expect(sim.bursts).toHaveLength(0);
  });

  it("schedules idle bursts and reports when the next one is due", () => {
    const sim = new VenomSim(CFG);
    expect(sim.idleIn).toBeGreaterThan(0);
    run(sim, 1.5, () => null);
    expect(sim.bursts.length).toBeGreaterThan(0);
    expect(sim.idleIn).toBeGreaterThan(1);
  });

  it("only becomes aware inside `sense`", () => {
    const sim = new VenomSim(CFG);
    run(sim, 1, () => below(CFG.sense + 40));
    expect(sim.awareness).toBeLessThan(0.01);
    run(sim, 1, () => below(CFG.sense / 2));
    expect(sim.awareness).toBeGreaterThan(0.3);
  });

  it("launches tendrils inside `reach` and never more than `tendrils`", () => {
    for (const tendrils of [1, 3, 6]) {
      const sim = new VenomSim({ ...CFG, tendrils });
      let peak = 0;
      run(sim, 1.5, (t) => {
        peak = Math.max(peak, sim.tendrils.filter((x) => x.state !== "recoil" && x.state !== "frag").length);
        return below(t < 0.2 ? 80 : 25);
      });
      expect(peak).toBeGreaterThan(0);
      expect(peak).toBeLessThanOrEqual(tendrils);
    }
  });

  it("grabs the cursor (glove morph) once tendrils hold on", () => {
    const sim = new VenomSim(CFG);
    run(sim, 1.2, () => below(30));
    expect(sim.tendrils.some((t) => t.state === "held")).toBe(true);
    expect(sim.glove).toBeGreaterThan(0.5);
    expect(Math.hypot(sim.tugX, sim.tugY)).toBeLessThanOrEqual(10.01);
  });

  it("snaps every held strand when the cursor is pulled far away, then goes back to sleep", () => {
    const sim = new VenomSim({ ...CFG, idle: false });
    run(sim, 1.2, () => below(30));
    run(sim, 1.5, (t) => below(30 + Math.min(1, t / 0.6) * 500));
    expect(sim.tendrils.some((t) => t.state === "held" || t.state === "lunge")).toBe(false);
    run(sim, 4, () => null);
    expect(sim.tendrils).toHaveLength(0);
    expect(sim.busy).toBe(false);
  });

  it("stays numerically stable under erratic input and large frame gaps", () => {
    const sim = new VenomSim(CFG);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000; i++) {
      const p = rnd() < 0.1 ? null : { x: 100 + rnd() * 600, y: 100 + rnd() * 400 };
      const dt = rnd() < 0.05 ? 0.5 : DT; // tab switch / long task
      sim.step(dt, BODY, p, p ? gloveSites({ x: p.x, y: p.y, rot: 0 }) : null);
      if (rnd() < 0.02) sim.press(BODY.x + 50, BODY.y + 20);
    }
    expect(allFinite(sim)).toBe(true);
    expect(sim.webs.length).toBeLessThanOrEqual(9);
  });

  it("is deterministic for identical input", () => {
    const a = new VenomSim(CFG);
    const b = new VenomSim(CFG);
    const path = (t: number) => below(20 + 200 * Math.abs(Math.sin(t * 2)));
    run(a, 2, path);
    run(b, 2, path);
    expect(a.tendrils.length).toBe(b.tendrils.length);
    expect(Array.from(a.tendrils[0]?.x ?? [])).toEqual(Array.from(b.tendrils[0]?.x ?? []));
  });

  it("throws `splash` droplets on press and they expire", () => {
    const sim = new VenomSim({ ...CFG, idle: false, splash: 9 });
    sim.press(BODY.x + 100, BODY.y + 20);
    expect(sim.drops).toHaveLength(9);
    run(sim, 2, () => null);
    expect(sim.drops).toHaveLength(0);
  });

  it("splash: 0 throws nothing", () => {
    const sim = new VenomSim({ ...CFG, splash: 0 });
    sim.press(0, 0);
    expect(sim.drops).toHaveLength(0);
  });
});
