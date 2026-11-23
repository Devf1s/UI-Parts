/**
 * A plucked string as a sum of its standing waves. Each mode n is a damped oscillator kept as a
 * complex amplitude that rotates at ωn and shrinks at γn per second, which is exact for any frame
 * length (no integration error, never unstable). Displacement at x ∈ [0, 1] is Σ Re(cn)·sin(nπx).
 */
export type StringState = {
  re: Float64Array;
  im: Float64Array;
  /** Visible fundamental, Hz: slow enough for the eye. */
  f0: number;
};

export const MODES = 10;

export function createString(f0: number): StringState {
  return { re: new Float64Array(MODES), im: new Float64Array(MODES), f0 };
}

/**
 * Plucks at position p ∈ (0, 1) with peak displacement `amp`: the triangle shape the finger leaves,
 * projected on the modes (an = 2·amp·sin(nπp) / (n²π²·p(1-p))), released at rest.
 */
export function pluck(s: StringState, p: number, amp: number) {
  const q = Math.min(0.97, Math.max(0.03, p));
  for (let n = 1; n <= MODES; n++) {
    s.re[n - 1] += (2 * amp * Math.sin(n * Math.PI * q)) / (n * n * Math.PI * Math.PI * q * (1 - q));
  }
}

/** Damping of mode n, 1 / s: higher harmonics die first, as on a real string. */
const damping = (n: number) => 1.6 + 0.55 * n;

export function stepString(s: StringState, dt: number) {
  for (let n = 1; n <= MODES; n++) {
    const w = 2 * Math.PI * s.f0 * n * dt;
    const g = Math.exp(-damping(n) * dt);
    const c = Math.cos(w) * g, si = Math.sin(w) * g;
    const re = s.re[n - 1], im = s.im[n - 1];
    s.re[n - 1] = re * c - im * si;
    s.im[n - 1] = re * si + im * c;
  }
}

export function displacement(s: StringState, x: number) {
  let y = 0;
  for (let n = 1; n <= MODES; n++) y += s.re[n - 1] * Math.sin(n * Math.PI * x);
  return y;
}

/** Sum of mode amplitudes: 0 when the string is at rest. */
export function energy(s: StringState) {
  let e = 0;
  for (let n = 0; n < MODES; n++) e += Math.hypot(s.re[n], s.im[n]);
  return e;
}

export function silence(s: StringState) {
  s.re.fill(0);
  s.im.fill(0);
}
