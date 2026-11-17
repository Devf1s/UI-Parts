/**
 * WebGL2 renderer + physics for the venom button, adapted from exteestudio/venom-button
 * (MIT, © 2026 exteestudio). The whole button is a lit 3D scene seen from above: a rubber slab,
 * glossy goo tendrils joined to it with smooth-min fillets, silk webs, droplets and a 3D cursor
 * that the tendrils coil around.
 *
 * Differences from the original demo: it renders into a canvas around one in-page button (not the
 * whole window), the floor is transparent so only shadows land on the page, the slab can be a
 * rounded rectangle, colours come from CSS, the loop sleeps when nothing moves, and the cursor only
 * becomes the 3D icon near the button. Input, layout and the frame loop are owned by the caller.
 */

import { ARROW_SVG, HAND_SVG } from "./venom-cursors";
import { FXAA, sceneFrag, shadeFrag, VERT, type ShaderLimits } from "./venom-shaders";

export type VenomGLParams = {
  /** px from the edge where tendrils launch */
  reach: number;
  /** px where the surface starts reacting to the cursor */
  awareness: number;
  maxStrands: number;
  snapStretch: number;
  maxLen: number;
  /** viscous flow, 1/s: high = strands lengthen instead of snapping */
  creep: number;
  slither: number;
  /** lunge speed */
  whip: number;
  magnet: number;
  grip: number;
  thickness: number;
  pull: number;
  gravity: number;
  /** thin-film sheen on the goo, 0 … 1 */
  sheen: number;
  /** droplets flicked off the rim on click */
  splash: number;
  idle: boolean;
  /** draw the 3D cursor that tendrils wrap */
  glove: boolean;
};

export const GL_DEFAULTS: VenomGLParams = {
  reach: 120, awareness: 220, maxStrands: 6, snapStretch: 1.6, maxLen: 160, creep: 0.25, slither: 1, whip: 1,
  magnet: 1.6, grip: 1, thickness: 1, pull: 1, gravity: 900, sheen: 0, splash: 4, idle: true, glove: true,
};

export type RGB = [number, number, number];
export type VenomLook = {
  /** body albedo, linear */
  albedo: RGB;
  /** rim and sheen tint, linear, max channel 1 */
  tint: RGB;
  /** label colour, linear */
  label: RGB;
  /** floor bounce: 1 on a white page, lower on dark pages */
  floor: number;
  shadow: number;
  shadowColor: RGB;
  /** coloured edge light: linear rgb + strength (0 = off) */
  rim: [number, number, number, number];
};

export type VenomPointer = { x: number; y: number; mouse: boolean };

export type VenomGL = {
  params: VenomGLParams;
  /** shaders compiled (they compile in the background where the browser allows it) */
  ready(): boolean;
  failed(): boolean;
  layout(o: { w: number; h: number; pad: number; radius: number; dpr: number }): void;
  setLabel(src: HTMLCanvasElement | null, box: { cx: number; cy: number; hw: number; hh: number; ink: number }): void;
  setLook(l: VenomLook): void;
  /** advance by dt seconds and draw; returns false once everything has settled */
  frame(dt: number, pointer: VenomPointer | null): boolean;
  press(on: boolean, x?: number, y?: number): void;
  /** the 3D cursor is on screen (the caller hides the OS cursor) */
  handVisible(): boolean;
  /** seconds until the next idle burst (Infinity when idle life is off) */
  idleIn(): number;
  /** frames drawn so far (for tests and diagnostics) */
  frames(): number;
  /** deterministic stepping for previews and tests: move the pointer from→to over sec, then draw */
  simulate(sec: number, to: VenomPointer | null): void;
  /** live counts for tests */
  stats(): { strands: number; held: number; hand: boolean };
  destroy(): void;
};

// ───────────────────────────── constants ─────────────────────────────
const NP = 14;
const MAXB = 5;
const MAXR = 6;
const MAXBR = 9;
const WP = 18;
const SUB = 1 / 240;
const ITER = 3;
const PEAK_H = 15;
const LIFT_H = 14;
const BEVEL = 3;
const HAND_BIG = 2.3;
const HAND_OS = 0.85; // about the size of an OS cursor
const PULL_MAX = 10;
const TILT_MAX = 0.36;
const WRIST_ANG = Math.atan2(15.5, 5.7);
const K = [2.5, 6, 5];
const FINGERS = [
  { a: [8.45, 4.4], b: [9.6, 10.8], hw: 1.5, turns: 2.4, t0: 0.12, t1: 0.78 },
  { a: [12.45, 8.4], b: [12.6, 12.8], hw: 1.38, turns: 1.6, t0: 0.12, t1: 0.82 },
  { a: [13.7, 16.9], b: [13.7, 20.1], hw: 4.1, turns: 1.4, t0: 0.08, t1: 0.92 },
  { a: [16.0, 8.6], b: [16.1, 12.8], hw: 1.55, turns: 1.6, t0: 0.12, t1: 0.82 },
  { a: [4.6, 11.4], b: [7.4, 14.6], hw: 1.25, turns: 1.7, t0: 0.1, t1: 0.82 },
  { a: [19.3, 9.6], b: [19.6, 12.8], hw: 1.1, turns: 1.4, t0: 0.12, t1: 0.86 },
];

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const ease = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;
function spring(o: Obj, k: string, kv: string, target: number, w: number, z: number, dt: number) {
  o[kv] += (w * w * (target - o[k]) - 2 * z * w * o[kv]) * dt;
  o[k] += o[kv] * dt;
}
const settled = (o: Obj, k: string, kv: string, target: number, eps = 0.002) =>
  Math.abs(o[k] - target) < eps && Math.abs(o[kv]) < eps * 10;

type Wrap = { f: number; prog: number; th0: number | null; dir: number; ph: number; slide: number; r: number };
type Strand = {
  kind: "reach" | "micro" | "probe" | "piece";
  state: "grow" | "attached" | "recoil";
  pin: "anchor" | "cursor";
  lx: number; ly: number;
  pos: Float32Array; prev: Float32Array; rad: Float32Array;
  u: number; ud: number; uKick: boolean;
  rest: number; vol: number; stretch: number; pinch: number; len: number;
  neckS: number; side: number; wig: number; phase: number; snapMul: number; lenMul: number;
  wrap: Wrap | null;
  lat: number; life: number; ttl: number; mound: number; elong: number; dead: boolean; retract: number;
  dirX: number; dirY: number;
  probe: null | { len?: number; z: number; ph?: number; nx?: number; ny?: number; dist?: number; dir?: number; delay?: number };
};
type Crawler = { x: number; y: number; z: number; vx: number; vy: number; vz: number; r: number; state: "fall" | "crawl"; t: number; phase: number; sq: number; sqV: number; dead: boolean };
type Ripple = { x: number; y: number; age: number; amp: number };
export type Geo = { cx: number; cy: number; hw: number; hh: number; r: number; top: number };

// ── geometry of the slab outline (pure, unit tested)
// nearest point on the rounded-rect outline (optionally inset), outward normal, signed distance
export function edge(x: number, y: number, g: Geo, inset = 0) {
  const r = g.r, ax = g.hw - r, ay = g.hh - r;
  const qx = x - g.cx, qy = y - g.cy;
  const cx = clamp(qx, -ax, ax), cy = clamp(qy, -ay, ay);
  let dx = qx - cx, dy = qy - cy;
  const L = Math.hypot(dx, dy);
  if (L < 1e-3) {
    const sx = ax - Math.abs(qx), sy = ay - Math.abs(qy);
    const R = r - inset;
    if (sx < sy) {
      dx = Math.sign(qx) || 1;
      return { x: g.cx + dx * (ax + R), y: y, nx: dx, ny: 0, d: -sx - r };
    }
    dy = Math.sign(qy) || -1;
    return { x: x, y: g.cy + dy * (ay + R), nx: 0, ny: dy, d: -sy - r };
  }
  dx /= L;
  dy /= L;
  const R = r - inset;
  return { x: g.cx + cx + dx * R, y: g.cy + cy + dy * R, nx: dx, ny: dy, d: L - r };
}

// a point just outside the outline at fraction t of its perimeter
export function outlineAt(t: number, g: Geo) {
  const r = g.r, ax = g.hw - r, ay = g.hh - r, arc = (Math.PI / 2) * r;
  const segs = [2 * ax, arc, 2 * ay, arc, 2 * ax, arc, 2 * ay, arc];
  const per = segs.reduce((a, b) => a + b, 0);
  let s = (((t % 1) + 1) % 1) * per;
  let i = 0;
  while (i < 7 && s > segs[i]) s -= segs[i++];
  const out = r + 1;
  let px = 0, py = 0;
  switch (i) {
    case 0: px = -ax + s; py = -ay - out; break;
    case 2: px = ax + out; py = -ay + s; break;
    case 4: px = ax - s; py = ay + out; break;
    case 6: px = -ax - out; py = ay - s; break;
    default: {
      const c = [[ax, -ay, -Math.PI / 2], [ax, ay, 0], [-ax, ay, Math.PI / 2], [-ax, -ay, Math.PI]][(i - 1) / 2];
      const th = c[2] + s / Math.max(r, 1e-3);
      px = c[0] + Math.cos(th) * out;
      py = c[1] + Math.sin(th) * out;
    }
  }
  return edge(g.cx + px, g.cy + py, g);
}

type Prog = { prog: WebGLProgram; names: string[]; u: Record<string, WebGLUniformLocation | null> };

/** Software rasterisers (SwiftShader, llvmpipe, WARP…) run the ray march on the CPU at a few fps. */
function isSoftware(gl: WebGL2RenderingContext) {
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  return /swiftshader|llvmpipe|softpipe|software|basic render|warp/i.test(name);
}

export function createVenomGL(
  canvas: HTMLCanvasElement,
  init: Partial<VenomGLParams> = {},
  opts: { allowSoftware?: boolean } = {},
): VenomGL | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false, alpha: true, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: !opts.allowSoftware,
  });
  if (!gl) return null;
  if (!opts.allowSoftware && isSoftware(gl)) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }

  const P: VenomGLParams = { ...GL_DEFAULTS, ...init };
  const FLOAT = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
  let MAXS = 18, MAXC = 24;
  if (gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) < 900) {
    MAXS = 6;
    MAXC = 3;
  }
  const limits: ShaderLimits = { MAXS, NP, MAXB, MAXR, MAXBR, MAXC, WP };
  const parallel = gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null;

  let failed = false;
  let lost = false;
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    failed = true;
  };
  canvas.addEventListener("webglcontextlost", onLost);

  // ── programs: compile without waiting; link status is checked once the driver is done
  const shaders: WebGLShader[] = [];
  function compile(type: number, src: string) {
    const sh = gl!.createShader(type)!;
    gl!.shaderSource(sh, src.trim());
    gl!.compileShader(sh);
    shaders.push(sh);
    return sh;
  }
  const vs = compile(gl.VERTEX_SHADER, VERT);
  function program(fs: string, names: string[]): Prog {
    const prog = gl!.createProgram()!;
    gl!.attachShader(prog, vs);
    gl!.attachShader(prog, compile(gl!.FRAGMENT_SHADER, fs));
    gl!.linkProgram(prog);
    return { prog, names, u: {} };
  }
  const p1 = program(sceneFrag(limits, FLOAT), [
    "uArrowSDF", "uMorph", "uCoat", "uNC", "uCoil", "uCBox", "uHandSDF", "uHand", "uHand2", "uRes", "uDpr", "uTime", "uBtn", "uBtnZ",
    "uBtnZ2", "uPull", "uPeak", "uNS", "uPts", "uBox", "uAnc", "uAncD", "uNBr", "uBr", "uNB", "uBlob", "uBlobZ", "uRip", "uZTop", "uK",
  ]);
  const p2 = program(shadeFrag(FLOAT), [
    "uG", "uLabel", "uRes", "uDpr", "uTime", "uLabelBox", "uLabelTx", "uLabelAmt", "uLabelLod", "uIri", "uZMax", "uLift", "uBtnP",
    "uBtnR", "uWin", "uBtnH", "uHandCol", "uArrowCol", "uMorph", "uHand", "uHand2", "uAlb", "uTint", "uSilver", "uFloorK",
    "uShadowA", "uShadowC", "uRim",
  ]);
  const p3 = program(FXAA, ["uC", "uRes"]);
  const progs = [p1, p2, p3];
  let linked = false;
  function checkLinked() {
    if (linked || failed) return linked;
    if (parallel && !progs.every((p) => gl!.getProgramParameter(p.prog, parallel.COMPLETION_STATUS_KHR))) return false;
    for (const p of progs) {
      if (!gl!.getProgramParameter(p.prog, gl!.LINK_STATUS)) {
        failed = true;
        if (process.env.NODE_ENV !== "production") {
          console.warn("venom-button: WebGL program failed, using the 2D renderer", gl!.getProgramInfoLog(p.prog), ...shaders.map((s) => gl!.getShaderInfoLog(s)));
        }
        return false;
      }
      for (const n of p.names) p.u[n] = gl!.getUniformLocation(p.prog, n);
    }
    linked = true;
    return true;
  }

  // ── icons: colour texture + signed distance field
  const handColTex = gl.createTexture(), handSdfTex = gl.createTexture();
  const arrowColTex = gl.createTexture(), arrowSdfTex = gl.createTexture();
  let iconsLoaded = 0;
  function buildIcon(svg: string, colTex: WebGLTexture | null, sdfTex: WebGLTexture | null) {
    const img = new Image();
    img.onload = () => {
      if (lost) return;
      const C = 256, cv = document.createElement("canvas");
      cv.width = cv.height = C;
      cv.getContext("2d")!.drawImage(img, 0, 0, C, C);
      gl!.bindTexture(gl!.TEXTURE_2D, colTex);
      gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, cv);
      gl!.generateMipmap(gl!.TEXTURE_2D);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR_MIPMAP_LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      // silhouette → signed distance in icon units, brute force against the boundary; runs once
      const N = 96, sc = document.createElement("canvas");
      sc.width = sc.height = N;
      const sx = sc.getContext("2d", { willReadFrequently: true })!;
      sx.drawImage(img, 0, 0, N, N);
      const a = sx.getImageData(0, 0, N, N).data;
      const inside = new Uint8Array(N * N);
      for (let i = 0; i < N * N; i++) inside[i] = a[i * 4 + 3] > 127 ? 1 : 0;
      const edge: number[] = [];
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const v = inside[y * N + x];
          if ((x > 0 && inside[y * N + x - 1] !== v) || (x < N - 1 && inside[y * N + x + 1] !== v) ||
            (y > 0 && inside[(y - 1) * N + x] !== v) || (y < N - 1 && inside[(y + 1) * N + x] !== v)) edge.push(x, y);
        }
      const sdf = new Float32Array(N * N), unit = 24 / N;
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          let best = 1e9;
          for (let k = 0; k < edge.length; k += 2) {
            const dx = edge[k] - x, dy = edge[k + 1] - y, d = dx * dx + dy * dy;
            if (d < best) best = d;
          }
          const d = (Math.sqrt(best) + 0.5) * unit;
          sdf[y * N + x] = inside[y * N + x] ? -d : d;
        }
      gl!.bindTexture(gl!.TEXTURE_2D, sdfTex);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.R16F, N, N, 0, gl!.RED, gl!.FLOAT, sdf);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      if (++iconsLoaded === 2) hand.ready = true;
    };
    img.src = "data:image/svg+xml," + encodeURIComponent(svg);
  }
  const vao = gl.createVertexArray();

  // ── render targets
  let W = 1, H = 1, DPR = 1, cssW = 1, cssH = 1, dprWanted = 1, quality = 1;
  let gTex: WebGLTexture | null = null, cTex: WebGLTexture | null = null;
  const fbo = gl.createFramebuffer(), cFbo = gl.createFramebuffer();
  function makeTargets() {
    if (gTex) gl!.deleteTexture(gTex);
    gTex = gl!.createTexture();
    gl!.bindTexture(gl!.TEXTURE_2D, gTex);
    const levels = Math.floor(Math.log2(Math.max(W, H))) + 1;
    gl!.texStorage2D(gl!.TEXTURE_2D, levels, FLOAT ? gl!.RGBA16F : gl!.RGBA8, W, H);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR_MIPMAP_LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, gTex, 0);
    if (cTex) gl!.deleteTexture(cTex);
    cTex = gl!.createTexture();
    gl!.bindTexture(gl!.TEXTURE_2D, cTex);
    gl!.texStorage2D(gl!.TEXTURE_2D, 1, gl!.RGBA8, W, H);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, cFbo);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, cTex, 0);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
  }
  function applySize() {
    const w = Math.max(1, Math.round(cssW * dprWanted * quality));
    const h = Math.max(1, Math.round(cssH * dprWanted * quality));
    if (w === W && h === H && gTex) return;
    W = w;
    H = h;
    canvas.width = W;
    canvas.height = H;
    DPR = W / cssW;
    makeTargets();
  }

  // ── label
  const labelTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, labelTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  let labelW = 1, labelH = 1, labelInk = 60;
  const labelBox = { cx: 0, cy: 0, hw: 1, hh: 1 };
  let labelAmt = 0, labelTarget = 0;

  const look: VenomLook = {
    albedo: [0.0007, 0.0007, 0.0008], tint: [1, 1, 1], label: [0.9, 0.91, 0.94], floor: 1, shadow: 1, shadowColor: [0.03, 0.035, 0.06], rim: [0, 0, 0, 0],
  };

  // ───────────────────────────── state ─────────────────────────────
  const strands: Strand[] = [];
  const crawlers: Crawler[] = [];
  const ripples: Ripple[] = [];
  const hand = { m: 0, mV: 0, s: HAND_OS, v: 0, ang: 0, angV: 0, on: false, ready: false, coat: -60, coatV: 0, thr: 0.8, ox: 0, oy: 0, oxV: 0, oyV: 0 };
  const cur = { x: -1e4, y: -1e4, vx: 0, vy: 0, present: false, mouse: false };
  const btn = { cx: 0, cy: 0, hw: 100, hh: 30, r: 30, top: 14, sink: 5, dome: 1.2, lift: 0, liftV: 0, press: 0, pressV: 0, pressTarget: 0, intro: 1, introV: 0 };
  const pull = { x: 0, y: 0, amt: 0, v: 0 };
  const peak = { x: 0, y: 0, amt: 0, v: 0 };
  let time = 0, lastSnap = -1, lastSpawn = -1, lastMicro = -1, nextProbe = 1.2, awareNow = 0, lastProbeT = Math.random();
  let CURZ = 25;
  let frameCount = 0;
  let acc = 0, frameEma = 1 / 60, slowFor = 0;

  // ───────────────────────────── geometry ─────────────────────────────
  function geo(): Geo {
    const e = btn.intro, pr = btn.press;
    const hh = btn.hh * (0.55 + 0.45 * e) + 1 * pr;
    const hw = btn.hh * 0.5 + (btn.hw - btn.hh * 0.5) * e + 2.5 * pr;
    return { cx: btn.cx, cy: btn.cy, hw, hh, r: Math.min(btn.r, hh, hw), top: Math.max(1, btn.top * e * (1 - 0.3 * pr)) };
  }
  function anchorFor(px: number, py: number, lat: number, g: Geo) {
    const e = edge(px, py, g);
    return edge(e.x - e.ny * lat - e.nx * 4, e.y + e.nx * lat - e.ny * 4, g, Math.min(10, g.r * 0.7));
  }
  function addRipple(x: number, y: number, amp: number) {
    ripples.push({ x, y, age: 0, amp });
    if (ripples.length > MAXR) ripples.shift();
  }

  // ───────────────────────────── tendrils ─────────────────────────────
  function newStrand(kind: Strand["kind"], g: Geo, ax: number, ay: number): Strand {
    const s: Strand = {
      kind, state: "grow", pin: "anchor",
      lx: (ax - g.cx) / g.hw, ly: (ay - g.cy) / g.hh,
      pos: new Float32Array(NP * 3), prev: new Float32Array(NP * 3), rad: new Float32Array(NP).fill(2),
      u: 0, ud: 0, uKick: true,
      rest: 1, vol: 0, stretch: 1, pinch: 0, len: 0,
      neckS: rand(0.42, 0.62), side: Math.random() < 0.5 ? -1 : 1, wig: rand(0.5, 1.2), phase: rand(0, 100),
      snapMul: rand(0.85, 1.15), lenMul: rand(0.88, 1.12), wrap: null,
      lat: 0, life: 0, ttl: 0, probe: null, mound: 0, elong: 0, dead: false, retract: 0, dirX: 0, dirY: -1,
    };
    const z = Math.max(2, g.top - 4) + btn.lift * LIFT_H;
    const e = edge(ax, ay, g);
    for (let i = 0; i < NP; i++) {
      const o = i * 3;
      s.pos[o] = s.prev[o] = ax + e.nx * i * 0.4;
      s.pos[o + 1] = s.prev[o + 1] = ay + e.ny * i * 0.4;
      s.pos[o + 2] = s.prev[o + 2] = z;
    }
    return s;
  }
  function spawnReach(g: Geo) {
    if (strands.length >= MAXS - 1) return;
    const k = strands.filter((s) => s.kind === "reach" && s.pin === "anchor" && s.state !== "recoil").length;
    const lat = [0, 30, -30, 58, -58, 82, -82][k % 7] + rand(-6, 6);
    const a = anchorFor(cur.x, cur.y, lat, g);
    const s = newStrand("reach", g, a.x, a.y);
    s.lat = lat;
    s.vol = Math.PI * 1.25 * 1.25 * 170;
    const taken = new Set(strands.filter((o) => o.wrap).map((o) => o.wrap!.f));
    let f = 0;
    while (taken.has(f) && f < FINGERS.length - 1) f++;
    s.wrap = { f, prog: 0, th0: null, dir: 1, ph: rand(0, 6.28), slide: 0, r: 0.7 };
    strands.push(s);
  }
  function handToWorld(ix: number, iy: number) {
    const dx = (ix - 8) * hand.s, dy = (iy - 3) * hand.s, c = Math.cos(hand.ang), sn = Math.sin(hand.ang);
    return [cur.x + hand.ox + c * dx - sn * dy, cur.y + hand.oy + sn * dx + c * dy];
  }
  const handTh = () => 0.8 * hand.s;
  const cp = [0, 0, 0, 0];
  function coilPoint(s: Strand, f: number, hair: boolean) {
    const w = s.wrap!, F = FINGERS[w.f];
    const A = handToWorld(F.a[0], F.a[1]), B = handToWorld(F.b[0], F.b[1]);
    let ux = B[0] - A[0], uy = B[1] - A[1];
    const L = Math.hypot(ux, uy) || 1;
    ux /= L;
    uy /= L;
    const nx = -uy, ny = ux;
    if (w.th0 === null) {
      const side = (s.pos[0] - (A[0] + B[0]) / 2) * nx + (s.pos[1] - (A[1] + B[1]) / 2) * ny;
      w.th0 = side > 0 ? 0 : Math.PI;
      w.dir = side > 0 ? 1 : -1;
    }
    const r = (hair ? 0.45 : w.r) * P.thickness;
    const phi = f * F.turns * (hair ? 1.25 : 1) * 2 * Math.PI * w.prog;
    const t = clamp(F.t0 + w.slide + ((F.t1 - F.t0) * phi) / (F.turns * 2 * Math.PI * (hair ? 1.1 : 1)), 0.02, 0.98);
    const th = w.th0 + w.dir * phi;
    const hw = F.hw * hand.s + r + 0.35, zr = handTh() + r + 0.3;
    cp[0] = A[0] + ux * t * L + nx * Math.cos(th) * hw;
    cp[1] = A[1] + uy * t * L + ny * Math.cos(th) * hw;
    cp[2] = CURZ + Math.sin(th) * zr;
    cp[3] = r * (1 - 0.35 * f * f);
    return cp;
  }
  const coilStart = (s: Strand) => {
    const p = coilPoint(s, 0, false);
    return [p[0], p[1], p[2]];
  };
  function spawnMicro(g: Geo) {
    if (strands.length >= MAXS - 6) return;
    const lat = rand(-1, 1) * 75;
    const a = anchorFor(cur.x, cur.y, lat, g);
    const s = newStrand("micro", g, a.x, a.y);
    s.lat = lat;
    s.probe = { len: rand(0.5, 1.2), z: rand(1, 5), ph: rand(0, 6.28) };
    s.ttl = rand(0.7, 1.9);
    s.vol = Math.PI * 0.55 * 0.55 * 40;
    strands.push(s);
  }
  function spawnProbe(g: Geo) {
    const dir = Math.random() < 0.5 ? -1 : 1, n = Math.random() < 0.5 ? 2 : 3;
    const t = lastProbeT + rand(0.25, 0.75);
    lastProbeT = t;
    const base = outlineAt(t, g);
    for (let i = 0; i < n && strands.length < MAXS - 2; i++) {
      const lat = (i - (n - 1) / 2) * 13 + rand(-3, 3);
      const a = edge(base.x - base.ny * lat, base.y + base.nx * lat, g, Math.min(8, g.r * 0.6));
      const s = newStrand("probe", g, a.x, a.y);
      s.probe = { nx: a.nx, ny: a.ny, dist: rand(11, 20), z: rand(2, 6), dir, delay: i * 0.07 };
      s.ttl = rand(0.8, 1.0);
      s.vol = Math.PI * 0.8 * 0.8 * 40;
      strands.push(s);
    }
  }

  const cum = new Float32Array(NP), tmpP = new Float32Array(NP * 3), tmpV = new Float32Array(NP * 3);
  function truncate(s: Strand, Lnew: number) {
    const pos = s.pos, prev = s.prev;
    cum[0] = 0;
    for (let i = 1; i < NP; i++) {
      const a = (i - 1) * 3, b = i * 3;
      cum[i] = cum[i - 1] + Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
    }
    if (cum[NP - 1] < 1e-3 || Lnew >= cum[NP - 1]) return;
    let k = 0;
    for (let j = 0; j < NP; j++) {
      const target = (Lnew * j) / (NP - 1);
      while (k < NP - 2 && cum[k + 1] < target) k++;
      const t = clamp((target - cum[k]) / Math.max(cum[k + 1] - cum[k], 1e-6), 0, 1);
      for (let c = 0; c < 3; c++) {
        tmpP[j * 3 + c] = pos[k * 3 + c] * (1 - t) + pos[(k + 1) * 3 + c] * t;
        tmpV[j * 3 + c] = prev[k * 3 + c] * (1 - t) + prev[(k + 1) * 3 + c] * t;
      }
    }
    pos.set(tmpP);
    prev.set(tmpV);
  }
  function resample(src: Float32Array, a: number, b: number) {
    const out = new Float32Array(NP * 3);
    for (let j = 0; j < NP; j++) {
      const f = a + ((b - a) * j) / (NP - 1);
      const i0 = clamp(Math.floor(f), 0, NP - 2), t = f - i0;
      for (let c = 0; c < 3; c++) out[j * 3 + c] = src[i0 * 3 + c] * (1 - t) + src[(i0 + 1) * 3 + c] * t;
    }
    return out;
  }
  function split(s: Strand, g: Geo) {
    const k = s.neckS * (NP - 1);
    const base: Strand = { ...s, kind: "piece", state: "recoil", pin: "anchor", pinch: 0, wrap: null,
      pos: resample(s.pos, 0, k), prev: resample(s.prev, 0, k), rad: new Float32Array(NP), vol: s.vol * s.neckS };
    const tip: Strand = { ...s, kind: "piece", state: "recoil", pin: "cursor", pinch: 0, mound: 0,
      pos: resample(s.pos, NP - 1, k), prev: resample(s.prev, NP - 1, k), rad: new Float32Array(NP), vol: s.vol * (1 - s.neckS) };
    base.len = s.len * s.neckS;
    base.rest = base.len / (NP - 1);
    tip.len = s.len * (1 - s.neckS);
    tip.rest = tip.len / (NP - 1);
    base.retract = tip.retract = 0;
    strands[strands.indexOf(s)] = base;
    if (strands.length < MAXS) strands.push(tip);
    addRipple(g.cx + s.lx * g.hw, g.cy + s.ly * g.hh, 0.8);
    lastSnap = time;
  }
  function releaseAll(absorb: boolean) {
    for (const s of strands) {
      if (s.kind === "reach" && (s.state === "grow" || s.state === "attached")) {
        if (absorb || s.state === "grow") {
          s.state = "recoil";
          s.kind = "piece";
        } else if (!s.pinch) s.pinch = 1e-4;
      }
    }
  }

  function stepStrand(s: Strand, dt: number, g: Geo) {
    s.life += dt;
    const w = s.wrap;
    if (w) {
      w.slide = 0.045 * Math.sin(time * 1.4 + w.ph);
      if (s.state === "attached") w.prog += (1 - w.prog) * (1 - Math.exp(-dt * 10));
      else if (s.state === "recoil") {
        w.prog -= dt * 5;
        if (w.prog <= 0) {
          s.wrap = null;
          if (s.pin === "cursor") s.dead = true;
        }
      }
    }
    const R = s.pin === "anchor"
      ? [g.cx + s.lx * g.hw, g.cy + s.ly * g.hh, Math.max(2, g.top - 4) + btn.lift * LIFT_H]
      : s.wrap ? coilStart(s) : [cur.x, cur.y, CURZ];

    let T: number[] | null = null;
    if (s.kind === "reach" && (s.state === "grow" || s.state === "attached")) {
      T = coilStart(s);
      if (s.state === "attached") {
        const an = anchorFor(cur.x, cur.y, s.lat, g), k = 1 - Math.exp(-dt * 1.4);
        s.lx += ((an.x - g.cx) / g.hw - s.lx) * k;
        s.ly += ((an.y - g.cy) / g.hh - s.ly) * k;
      }
    } else if (s.kind === "micro" && s.state !== "recoil") {
      const an = anchorFor(cur.x, cur.y, s.lat, g), k = 1 - Math.exp(-dt * 2);
      s.lx += ((an.x - g.cx) / g.hw - s.lx) * k;
      s.ly += ((an.y - g.cy) / g.hh - s.ly) * k;
      const e2 = edge(R[0], R[1], g);
      const tx = cur.x - R[0], ty = cur.y - R[1];
      const tl = Math.hypot(tx, ty) || 1;
      let dx = e2.nx * 0.25 + (tx / tl) * 0.75, dy = e2.ny * 0.25 + (ty / tl) * 0.75;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl;
      dy /= dl;
      const pr = s.probe!;
      const len = (10 + 38 * awareNow) * pr.len!, sway = Math.sin(time * 3 + pr.ph!) * 4;
      T = [R[0] + dx * len - dy * sway, R[1] + dy * len + dx * sway, R[2] + pr.z * awareNow];
      if (s.life > s.ttl || awareNow < 0.08) {
        s.state = "recoil";
        T = null;
      }
    } else if (s.kind === "probe" && s.state !== "recoil") {
      const pr = s.probe!, f = clamp((s.life - pr.delay!) / s.ttl, 0, 1), wave = Math.sin(Math.PI * f);
      const glide = pr.dir! * (f - 0.3) * 24, out = 3 + pr.dist! * wave;
      T = [R[0] + pr.nx! * out - pr.ny! * glide, R[1] + pr.ny! * out + pr.nx! * glide, R[2] + pr.z * wave];
      if (s.life > s.ttl + pr.delay!) {
        s.state = "recoil";
        T = null;
      }
    }

    let tip: number[] | null = null;
    if (T) {
      const L0 = Math.hypot(T[0] - R[0], T[1] - R[1], T[2] - R[2]);
      if (s.state === "grow") {
        // second-order dynamics: slight wind-up, a fast rise and an overshooting latch
        const f = 3.8 * P.whip * (0.75 + 0.25 * P.magnet), z = 0.5, r = -0.2;
        const k1 = z / (Math.PI * f), k2 = 1 / (2 * Math.PI * f) ** 2, k3 = (r * z) / (2 * Math.PI * f);
        const xd = s.uKick ? 1 / dt : 0;
        s.uKick = false;
        const k2s = Math.max(k2, (dt * dt) / 2 + (dt * k1) / 2, dt * k1);
        s.u += dt * s.ud;
        s.ud += (dt * (1 + k3 * xd - s.u - k1 * s.ud)) / k2s;
        const u = s.u, uc = clamp(u, 0, 1);
        const L2 = Math.hypot(T[0] - R[0], T[1] - R[1]) || 1;
        const nx = -(T[1] - R[1]) / L2, ny = (T[0] - R[0]) / L2;
        const lat = s.side * s.wig * Math.sin(Math.PI * uc) * Math.min(L2 * 0.3, 38);
        tip = [R[0] + (T[0] - R[0]) * u + nx * lat, R[1] + (T[1] - R[1]) * u + ny * lat, R[2] + (T[2] - R[2]) * uc + 22 * Math.sin(Math.PI * uc)];
        s.rest = (Math.max(4, L0 * Math.max(u, 0.03)) * 1.05) / (NP - 1);
        if (u > 0.85 && Math.abs(s.ud) < 1.6) s.state = "attached";
      } else {
        tip = T;
        let Lr = s.rest * (NP - 1);
        if (L0 < Lr * 1.03) Lr += (L0 * 1.03 - Lr) * (1 - Math.exp(-dt * 3.5));
        else Lr += (L0 - Lr) * (1 - Math.exp(-dt * P.creep));
        s.rest = Lr / (NP - 1);
        s.stretch = L0 / Math.max(Lr, 1);
        if (s.kind === "reach" && !s.pinch && (s.stretch > P.snapStretch * s.snapMul || L0 > P.maxLen * s.lenMul)) s.pinch = 1e-4;
      }
    } else if (s.state === "recoil") {
      s.retract += dt;
      const Ln = Math.max(0, s.len * Math.exp(-dt * 9) - (s.pin === "cursor" ? 160 : 110) * dt);
      truncate(s, Ln);
      s.rest = Ln / (NP - 1);
    }

    if (s.pinch > 0) {
      s.pinch += dt / 0.1;
      if (s.pinch >= 1) {
        split(s, g);
        return;
      }
    }

    // verlet
    const pos = s.pos, prev = s.prev;
    const damp = s.state === "recoil" ? 0.94 : 0.975;
    const lastO = (NP - 1) * 3;
    const ex = pos[lastO] - R[0], ey = pos[lastO + 1] - R[1], el = Math.hypot(ex, ey) || 1;
    const px = -ey / el, py = ex / el;
    const slack = clamp(1.35 - s.stretch, 0.15, 1);
    const amp = (s.state === "recoil" ? 0 : 700) * P.slither * slack * (s.state === "grow" ? 0.4 : 1);
    const gdt = P.gravity * dt * dt;
    const mag = (s.kind === "reach" || s.kind === "micro") && s.state !== "recoil" && cur.present ? P.magnet * 900 * dt * dt : 0;
    for (let i = 1; i < NP; i++) {
      const o = i * 3, sp = i / (NP - 1);
      const vx = (pos[o] - prev[o]) * damp, vy = (pos[o + 1] - prev[o + 1]) * damp, vz = (pos[o + 2] - prev[o + 2]) * damp;
      prev[o] = pos[o];
      prev[o + 1] = pos[o + 1];
      prev[o + 2] = pos[o + 2];
      const env = Math.sin(Math.PI * sp);
      const wave = Math.sin(sp * 8.5 - time * 7.5 + s.phase) * env * amp * dt * dt;
      pos[o] += vx + px * wave;
      pos[o + 1] += vy + py * wave;
      pos[o + 2] += vz - gdt + Math.cos(sp * 6 - time * 5 + s.phase) * env * amp * 0.25 * dt * dt;
      if (mag) {
        const mx = cur.x - pos[o], my = cur.y - pos[o + 1], ml = Math.hypot(mx, my) || 1;
        pos[o] += (mx / ml) * mag * env;
        pos[o + 1] += (my / ml) * mag * env;
      }
    }
    const rest = Math.max(s.rest, 0.05);
    for (let it = 0; it < ITER; it++) {
      pos[0] = R[0];
      pos[1] = R[1];
      pos[2] = R[2];
      if (tip) {
        pos[lastO] = tip[0];
        pos[lastO + 1] = tip[1];
        pos[lastO + 2] = tip[2];
      }
      for (let i = 0; i < NP - 1; i++) {
        const a = i * 3, b = a + 3;
        let dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const wa = i === 0 ? 0 : 1, wb = i + 1 === NP - 1 && tip ? 0 : 1, ws = wa + wb;
        if (!ws) continue;
        const diff = ((d - rest) / d) * 0.95;
        dx *= diff;
        dy *= diff;
        dz *= diff;
        if (wa) {
          const f = wa / ws;
          pos[a] += dx * f;
          pos[a + 1] += dy * f;
          pos[a + 2] += dz * f;
        }
        if (wb) {
          const f = wb / ws;
          pos[b] -= dx * f;
          pos[b + 1] -= dy * f;
          pos[b + 2] -= dz * f;
        }
      }
      for (let i = 0; i < NP - 2; i++) {
        const a = i * 3, b = a + 6;
        let dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6, min = rest * 1.55;
        if (d >= min) continue;
        const wa = i === 0 ? 0 : 1, wb = i + 2 === NP - 1 && tip ? 0 : 1, ws = wa + wb;
        if (!ws) continue;
        const diff = ((d - min) / d) * 0.25;
        dx *= diff;
        dy *= diff;
        dz *= diff;
        if (wa) {
          const f = wa / ws;
          pos[a] += dx * f;
          pos[a + 1] += dy * f;
          pos[a + 2] += dz * f;
        }
        if (wb) {
          const f = wb / ws;
          pos[b] -= dx * f;
          pos[b + 1] -= dy * f;
          pos[b + 2] -= dz * f;
        }
      }
    }
    for (let i = 1; i < NP; i++) {
      const o = i * 3, rmin = s.rad[i] * 0.7;
      if (pos[o + 2] < rmin) {
        pos[o + 2] = rmin;
        prev[o] += (pos[o] - prev[o]) * 0.3;
        prev[o + 1] += (pos[o + 1] - prev[o + 1]) * 0.3;
      }
    }

    // thickness: volume conservation, necking, beads ~9 radii apart
    let L = 0;
    for (let i = 0; i < NP - 1; i++) {
      const a = i * 3, b = a + 3;
      L += Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
    }
    s.len = L;
    const rMean = clamp(Math.sqrt(s.vol / (Math.PI * Math.max(L, 2))), 0.55, s.state === "recoil" ? 5 : 7.5) * P.thickness;
    const held = s.state === "attached";
    const neck = held ? clamp((s.stretch - 1.15) / 1.2, 0, 0.7) : 0;
    const nk = neck * (1 - s.pinch) + s.pinch * 0.96;
    const bead = held ? clamp((s.stretch - 1.5) / 0.8, 0, 1) : 0;
    const beadFreq = L / (9 * Math.max(rMean, 0.6));
    const capGrow = s.state === "recoil" ? Math.min(0.8, s.retract * 3) : 0;
    for (let i = 0; i < NP; i++) {
      const sp = i / (NP - 1);
      let r = rMean * (s.pin === "cursor" ? 0.6 : 1 + 0.55 * Math.exp(-sp / 0.08));
      if ((s.wrap && s.kind === "reach") || s.kind === "micro" || s.kind === "probe") r *= 1 - 0.62 * ease(0.5, 1, sp);
      else r *= 1 + (0.5 + capGrow) * Math.exp(-(1 - sp) / 0.07);
      r *= 1 - nk * Math.exp(-(((sp - s.neckS) / 0.16) ** 2));
      r *= 1 + bead * 0.3 * Math.sin(sp * Math.PI * 2 * beadFreq + s.phase);
      s.rad[i] = Math.max(r, 0.35);
    }

    let moundT = 0, elongT = 0;
    if (s.pin === "anchor") {
      if (s.state === "grow") {
        moundT = 7;
        elongT = 0.9;
      } else if (s.state === "attached") {
        moundT = 6 + 6 * clamp(s.stretch - 1, 0, 1.4);
        elongT = 1.0 + 1.6 * clamp(s.stretch - 0.8, 0, 1.4);
      }
      if (s.kind === "micro") {
        moundT *= 0.35;
        elongT *= 0.6;
      }
      if (s.kind === "probe") {
        moundT *= 0.12;
        elongT *= 0.4;
      }
    }
    s.mound += (moundT * 0.55 * P.pull - s.mound) * (1 - Math.exp(-dt * (moundT > s.mound ? 10 : 5)));
    s.elong += (elongT - s.elong) * (1 - Math.exp(-dt * 8));
    const dxm = pos[9] - pos[0], dym = pos[10] - pos[1], dm = Math.hypot(dxm, dym);
    if (dm > 1) {
      s.dirX = dxm / dm;
      s.dirY = dym / dm;
    }
    if (s.state === "recoil" && (s.rest * (NP - 1) < 12 || L < 5)) {
      s.dead = true;
      if (s.pin === "anchor" && s.kind !== "micro") addRipple(R[0], R[1], 0.5);
    }
  }

  function stepCrawler(c: Crawler, dt: number, g: Geo) {
    c.t += dt;
    if (c.state === "fall") {
      c.vz -= P.gravity * 1.6 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.vx *= 0.985;
      c.vy *= 0.985;
      if (c.z <= c.r * 0.55) {
        c.z = c.r * 0.55;
        c.state = "crawl";
        c.sqV = -5;
        c.sq = 0.55;
      }
      return;
    }
    const e = edge(c.x, c.y, g);
    const pulse = Math.sin(c.t * 9) ** 2;
    const speed = 110 + 230 * pulse;
    const wob = Math.sin(c.t * 11 + c.phase) * 40;
    c.x += (-e.nx * speed - e.ny * wob) * dt;
    c.y += (-e.ny * speed + e.nx * wob) * dt;
    spring(c, "sq", "sqV", 0.5 + 0.16 * pulse, 30, 0.5, dt);
    c.z = c.r * c.sq * 0.9;
    if (e.d < -c.r || c.t > 3) {
      c.dead = true;
      addRipple(e.x + e.nx * c.r, e.y + e.ny * c.r, 1.0);
    }
  }
  // droplets flicked off the rim around where it was pressed; they land and crawl back in
  function splash(x: number, y: number) {
    const g = geo();
    const n = Math.min(P.splash, MAXB - crawlers.length);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const e = edge(x + Math.cos(a) * 400, y + Math.sin(a) * 400, g);
      const sp = rand(90, 190);
      crawlers.push({
        x: e.x, y: e.y, z: g.top + btn.lift * LIFT_H, vx: (e.nx + rand(-0.3, 0.3)) * sp, vy: (e.ny + rand(-0.3, 0.3)) * sp,
        vz: rand(140, 240), r: rand(2.4, 4.2) * P.thickness, state: "fall", t: 0, phase: rand(0, 6), sq: 1, sqV: 0, dead: false,
      });
    }
  }

  // ───────────────────────────── simulation step ─────────────────────────────
  let aware = 0, inside = false, engaged = false;
  function step(dt: number) {
    time += dt;
    spring(btn, "intro", "introV", 1, 9, 0.85, dt);
    spring(btn, "press", "pressV", btn.pressTarget, 30, 0.75, dt);
    labelAmt += (labelTarget - labelAmt) * (1 - Math.exp(-dt * 6));
    const g = geo();

    const present = cur.present && btn.intro > 0.6;
    const e = edge(cur.x, cur.y, g);
    inside = present && e.d < -4;
    aware = present && !inside ? ease(P.awareness, 18, e.d) : 0;
    awareNow = aware;

    spring(pull, "amt", "v", 0, 14, 1.0, dt);
    const pk = 1 - Math.exp(-dt * 10);
    pull.x += (e.x - e.nx * 6 - pull.x) * pk;
    pull.y += (e.y - e.ny * 6 - pull.y) * pk;
    spring(peak, "amt", "v", 0, 12, 1.0, dt);
    spring(btn, "lift", "liftV", inside ? 1 : 0, 11, 0.95, dt);
    CURZ = g.top + btn.lift * LIFT_H + 11;
    const fk = 1 - Math.exp(-dt * 14);
    peak.x += (cur.x - peak.x) * (peak.amt < 0.02 ? 1 : fk);
    peak.y += (cur.y - peak.y) * (peak.amt < 0.02 ? 1 : fk);

    const active = strands.filter((s) => s.kind === "reach" && (s.state === "grow" || s.state === "attached")).length;
    if (!present) releaseAll(false);
    else if (inside) releaseAll(true);
    else {
      const want = e.d < P.reach
        ? Math.min(P.maxStrands, Math.round(Math.min(2, P.maxStrands) + Math.max(0, P.maxStrands - 2) * ease(P.reach, P.reach * 0.4, e.d)))
        : 0;
      if (active < want && time - lastSpawn > rand(0.03, 0.06) && time - lastSnap > 0.15) {
        spawnReach(g);
        lastSpawn = time;
      }
      const micro = strands.filter((s) => s.kind === "micro" && s.state !== "recoil").length;
      if (micro < Math.round(9 * ease(0.1, 0.8, aware)) && time - lastMicro > rand(0.03, 0.07)) {
        spawnMicro(g);
        lastMicro = time;
      }
    }
    if (P.idle && !inside && aware < 0.02 && time > nextProbe && btn.intro > 0.95) {
      if (strands.every((s) => s.kind === "probe" || s.state === "recoil")) spawnProbe(g);
      nextProbe = time + rand(1.8, 2.3);
    }

    for (let i = 0; i < strands.length; i++) stepStrand(strands[i], dt, g);
    for (let i = strands.length - 1; i >= 0; i--) if (strands[i].dead) strands.splice(i, 1);

    // the cursor becomes the 3D icon only near the goo, growing from OS-cursor size
    const wrapped = strands.some((s) => s.wrap);
    engaged = P.glove && hand.ready && present && cur.mouse && (e.d < P.reach + 40 || inside || wrapped);
    if (engaged && !hand.on) {
      hand.on = true;
      hand.s = HAND_OS;
      hand.v = 0;
    }
    spring(hand, "s", "v", engaged ? HAND_BIG : HAND_OS * 0.9, 16, 0.9, dt);
    if (!engaged && hand.on && hand.s < HAND_OS) hand.on = false;
    spring(hand, "coat", "coatV", inside ? 160 : present ? clamp(45 - e.d, -60, 160) : -60, 9, 0.9, dt);
    const thrT = inside ? 0.57 : 0.8 - 0.2 * clamp(1 - e.d / 60, 0, 1);
    hand.thr += (thrT - hand.thr) * (1 - Math.exp(-dt * 4));
    const touching = inside || strands.some((s) => s.kind === "reach" && (s.state === "attached" || (s.state === "grow" && s.u > 0.5)));
    spring(hand, "m", "mV", (engaged && touching) || (hand.on && inside) ? 1 : 0, 32, 1.0, dt);
    hand.m = clamp(hand.m, 0, 1);
    // caught in the web: wrapped strands tug the drawn icon and turn it toward the pull
    let tx = 0, ty = 0;
    for (const s of strands) {
      if (s.kind !== "reach" || s.state !== "attached" || !s.wrap) continue;
      const a = (NP - 1) * 3, b = (NP - 4) * 3;
      const dx = s.pos[b] - s.pos[a], dy = s.pos[b + 1] - s.pos[a + 1], dl = Math.hypot(dx, dy) || 1;
      const tension = clamp(s.stretch - 0.7, 0, 1.2) * s.wrap.prog;
      tx += (dx / dl) * tension;
      ty += (dy / dl) * tension;
    }
    const tm = Math.hypot(tx, ty), grip = hand.on ? Math.min(1, tm / 1.5) * P.grip : 0;
    const ux = tm > 1e-4 ? tx / tm : 0, uy = tm > 1e-4 ? ty / tm : 0;
    spring(hand, "ox", "oxV", ux * PULL_MAX * grip, 16, 0.62, dt);
    spring(hand, "oy", "oyV", uy * PULL_MAX * grip, 16, 0.62, dt);
    let dA = Math.atan2(uy, ux) - WRIST_ANG;
    dA = Math.atan2(Math.sin(dA), Math.cos(dA));
    const pullTilt = tm > 1e-4 ? clamp(dA * 0.35, -TILT_MAX, TILT_MAX) * grip : 0;
    spring(hand, "ang", "angV", clamp(cur.vx * 0.00022, -0.32, 0.32) + pullTilt, 12, 0.85, dt);

    for (const c of crawlers) stepCrawler(c, dt, g);
    for (let i = crawlers.length - 1; i >= 0; i--) if (crawlers[i].dead) crawlers.splice(i, 1);
    for (const r of ripples) r.age += dt;
    while (ripples.length && ripples[0].age > 1.6) ripples.shift();
    cur.vx *= Math.exp(-dt * 8);
    cur.vy *= Math.exp(-dt * 8);
  }

  function busy() {
    return (
      strands.length > 0 || crawlers.length > 0 || ripples.length > 0 || aware > 0 || inside || hand.on ||
      !settled(btn, "lift", "liftV", 0) || !settled(btn, "press", "pressV", btn.pressTarget) || !settled(btn, "intro", "introV", 1) ||
      !settled(hand, "m", "mV", 0) || Math.abs(labelAmt - labelTarget) > 0.004 || btn.pressTarget > 0
    );
  }

  // ───────────────────────────── render ─────────────────────────────
  const ptsBuf = new Float32Array(MAXS * NP * 4), boxBuf = new Float32Array(MAXS * 4), ancBuf = new Float32Array(MAXS * 4);
  const ancDBuf = new Float32Array(MAXS * 4), brBuf = new Float32Array(MAXBR * 12);
  const coilBuf = new Float32Array(MAXC * WP * 4), cboxBuf = new Float32Array(MAXC * 4);
  const blobBuf = new Float32Array(MAXB * 4), blobZBuf = new Float32Array(MAXB), ripBuf = new Float32Array(MAXR * 4);

  function render() {
    const g = geo();
    let zTop = g.top + btn.dome + pull.amt + peak.amt * PEAK_H * P.pull + btn.lift * LIFT_H + 4;
    let maxMound = 0;
    const ns = Math.min(strands.length, MAXS);
    for (let i = 0; i < ns; i++) {
      const s = strands[i];
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, rMax = 0;
      for (let j = 0; j < NP; j++) {
        const o = (i * NP + j) * 4, x = s.pos[j * 3], y = s.pos[j * 3 + 1], z = s.pos[j * 3 + 2], r = s.rad[j];
        ptsBuf[o] = x;
        ptsBuf[o + 1] = y;
        ptsBuf[o + 2] = z;
        ptsBuf[o + 3] = r;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
        rMax = Math.max(rMax, r);
        zTop = Math.max(zTop, z + r + K[1] * 0.3);
      }
      const pad = rMax + K[1] + 3;
      boxBuf.set([x0 - pad, y0 - pad, x1 + pad, y1 + pad], i * 4);
      const anchored = s.pin === "anchor";
      const m = anchored ? s.mound : 0;
      maxMound = Math.max(maxMound, m);
      ancBuf.set([anchored ? g.cx + s.lx * g.hw : 0, anchored ? g.cy + s.ly * g.hh : 0, m, 17], i * 4);
      ancDBuf.set([s.dirX, s.dirY, s.elong, 0], i * 4);
    }
    zTop += maxMound;

    // silk webs between neighbouring held tendrils
    const held = strands.filter((s) => s.kind === "reach" && s.state === "attached").sort((a, b) => a.lat - b.lat);
    let nbr = 0;
    for (let i = 0; i + 1 < held.length && nbr < MAXBR; i++) {
      const A = held[i], B = held[i + 1];
      const grow = clamp((Math.min(A.life, B.life) - 0.3) * 4, 0, 1);
      const taut = clamp(2.3 - Math.max(A.stretch, B.stretch), 0.25, 1);
      for (const sp of [0.22, 0.42, 0.62]) {
        if (nbr >= MAXBR) break;
        const j = Math.round(sp * (NP - 1)) * 3;
        const ax = A.pos[j], ay = A.pos[j + 1], az = A.pos[j + 2], bx = B.pos[j], by = B.pos[j + 1], bz = B.pos[j + 2];
        const dist = Math.hypot(bx - ax, by - ay);
        const r = 0.22 * P.thickness * clamp(1.6 - dist / 70, 0, 1) * grow * taut;
        if (r < 0.2) continue;
        const rx = (A.pos[0] + B.pos[0]) / 2, ry = (A.pos[1] + B.pos[1]) / 2;
        let mx = (ax + bx) / 2, my = (ay + by) / 2;
        const dl = Math.hypot(rx - mx, ry - my) || 1, sag = dist * 0.22;
        mx += ((rx - mx) / dl) * sag;
        my += ((ry - my) / dl) * sag;
        brBuf.set([ax, ay, az, r, mx, my, (az + bz) / 2 - dist * 0.05, r * 0.75, bx, by, bz, r], nbr * 12);
        nbr++;
      }
    }

    // wrap coils around the hand, then mozzarella fibres peeling off stretched tendrils
    let nc = 0;
    if (hand.on && hand.m > 0.6) {
      for (const hair of [false, true]) {
        for (const s of strands) {
          if (nc >= MAXC) break;
          if (!s.wrap || s.wrap.prog < 0.02) continue;
          let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
          for (let j = 0; j < WP; j++) {
            const q = coilPoint(s, j / (WP - 1), hair);
            coilBuf.set(q, (nc * WP + j) * 4);
            x0 = Math.min(x0, q[0]);
            y0 = Math.min(y0, q[1]);
            x1 = Math.max(x1, q[0]);
            y1 = Math.max(y1, q[1]);
          }
          const pad = 4 + K[1];
          cboxBuf.set([x0 - pad, y0 - pad, x1 + pad, y1 + pad], nc * 4);
          nc++;
        }
      }
    }
    if (hand.on) zTop = Math.max(zTop, CURZ + handTh() + 6);
    for (const s of strands) {
      if (s.kind !== "reach" || s.state !== "attached") continue;
      const spread = clamp((s.stretch - 0.8) * 18, 0, 9) * clamp((s.life - 0.4) * 3, 0, 1);
      if (spread < 0.5) continue;
      for (const side of [-1, 1, 0.4]) {
        if (nc >= MAXC) break;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (let j = 0; j < WP; j++) {
          const f = j / (WP - 1), fi = f * (NP - 1), i0 = Math.min(NP - 2, Math.floor(fi)), t = fi - i0;
          const a = i0 * 3, b = a + 3, P0 = s.pos;
          const tx = P0[b] - P0[a], ty = P0[b + 1] - P0[a + 1], tl = Math.hypot(tx, ty) || 1;
          const env = Math.sin(Math.PI * f) ** 1.4;
          const wob = 0.75 + 0.25 * Math.sin(time * 3.1 + f * 7 + s.phase + side);
          const off = side * spread * env * wob * (side > 0 ? 1 : 0.7);
          const q = [
            P0[a] + (P0[b] - P0[a]) * t - (ty / tl) * off,
            P0[a + 1] + (P0[b + 1] - P0[a + 1]) * t + (tx / tl) * off,
            P0[a + 2] + (P0[b + 2] - P0[a + 2]) * t - spread * (side === 0.4 ? -0.25 : 0.35) * env,
            (0.24 + 0.1 * (1 - env)) * P.thickness,
          ];
          coilBuf.set(q, (nc * WP + j) * 4);
          x0 = Math.min(x0, q[0]);
          y0 = Math.min(y0, q[1]);
          x1 = Math.max(x1, q[0]);
          y1 = Math.max(y1, q[1]);
        }
        const pad = 4 + K[1];
        cboxBuf.set([x0 - pad, y0 - pad, x1 + pad, y1 + pad], nc * 4);
        nc++;
      }
    }
    const handOn = hand.on && hand.ready ? 1 : 0;

    let nb = 0;
    for (const c of crawlers) {
      if (nb >= MAXB) break;
      blobBuf.set([c.x, c.y, c.z, c.r], nb * 4);
      blobZBuf[nb] = c.state === "fall" ? 1 : c.sq;
      zTop = Math.max(zTop, c.z + c.r + 2);
      nb++;
    }
    ripBuf.fill(0);
    ripples.forEach((r, i) => ripBuf.set([r.x, r.y, r.age, r.amp], i * 4));

    const t = gl!;
    // pass 1
    t.bindFramebuffer(t.FRAMEBUFFER, fbo);
    t.viewport(0, 0, W, H);
    t.useProgram(p1.prog);
    t.bindVertexArray(vao);
    const u1 = p1.u;
    t.uniform2f(u1.uRes, W, H);
    t.uniform1f(u1.uDpr, DPR);
    t.uniform1f(u1.uTime, time);
    t.uniform4f(u1.uBtn, g.cx, g.cy, g.hw, g.hh);
    t.uniform4f(u1.uBtnZ2, btn.lift * LIFT_H, BEVEL, g.r, 0);
    t.uniform4f(u1.uBtnZ, g.top, btn.sink * Math.min(1, btn.intro), btn.dome * Math.min(1, btn.intro), 0);
    t.uniform4f(u1.uPull, pull.x, pull.y, pull.amt, 34);
    t.uniform4f(u1.uPeak, peak.x, peak.y, peak.amt * PEAK_H * P.pull, 24);
    t.uniform1i(u1.uNS, ns);
    t.uniform4fv(u1.uPts, ptsBuf);
    t.uniform4fv(u1.uBox, boxBuf);
    t.uniform4fv(u1.uAnc, ancBuf);
    t.uniform4fv(u1.uAncD, ancDBuf);
    t.uniform1i(u1.uNBr, nbr);
    t.uniform4fv(u1.uBr, brBuf);
    t.uniform1i(u1.uNB, nb);
    t.uniform4fv(u1.uBlob, blobBuf);
    t.uniform1fv(u1.uBlobZ, blobZBuf);
    t.uniform4fv(u1.uRip, ripBuf);
    t.uniform1f(u1.uZTop, zTop);
    t.uniform3f(u1.uK, K[0], K[1], K[2]);
    t.uniform1i(u1.uNC, nc);
    t.uniform4fv(u1.uCoil, coilBuf);
    t.uniform4fv(u1.uCBox, cboxBuf);
    t.uniform4f(u1.uHand, cur.x + hand.ox, cur.y + hand.oy, hand.s, handOn);
    t.uniform4f(u1.uHand2, Math.cos(hand.ang), Math.sin(hand.ang), CURZ, handTh());
    t.uniform3f(u1.uCoat, hand.coat, 22, hand.thr);
    t.uniform1i(u1.uHandSDF, 2);
    t.activeTexture(t.TEXTURE2);
    t.bindTexture(t.TEXTURE_2D, handSdfTex);
    t.uniform1i(u1.uArrowSDF, 5);
    t.activeTexture(t.TEXTURE5);
    t.bindTexture(t.TEXTURE_2D, arrowSdfTex);
    t.uniform1f(u1.uMorph, hand.m);
    t.drawArrays(t.TRIANGLES, 0, 3);

    t.activeTexture(t.TEXTURE0);
    t.bindTexture(t.TEXTURE_2D, gTex);
    t.generateMipmap(t.TEXTURE_2D);

    // pass 2
    t.bindFramebuffer(t.FRAMEBUFFER, cFbo);
    t.viewport(0, 0, W, H);
    t.useProgram(p2.prog);
    const u2 = p2.u;
    t.uniform1i(u2.uG, 0);
    t.uniform1i(u2.uLabel, 1);
    t.activeTexture(t.TEXTURE1);
    t.bindTexture(t.TEXTURE_2D, labelTex);
    t.uniform2f(u2.uRes, W, H);
    t.uniform1f(u2.uDpr, DPR);
    t.uniform1f(u2.uTime, time);
    t.uniform4f(u2.uLabelBox, labelBox.cx, labelBox.cy, labelBox.hw, labelBox.hh);
    t.uniform2f(u2.uLabelTx, 1.6 / labelW, 1.6 / labelH);
    t.uniform1f(u2.uLabelAmt, labelAmt);
    t.uniform1f(u2.uLabelLod, Math.max(0, Math.log2(labelW / (2 * labelBox.hw * DPR)) - 0.6));
    t.uniform1f(u2.uIri, P.sheen);
    t.uniform1f(u2.uZMax, zTop);
    t.uniform1f(u2.uLift, btn.lift);
    t.uniform4f(u2.uBtnP, g.cx, g.cy, g.hw, g.hh);
    t.uniform1f(u2.uBtnR, g.r);
    t.uniform2f(u2.uWin, -(labelInk + 16) / g.hw, 15 / g.hw);
    t.uniform2f(u2.uBtnH, g.top, btn.lift * LIFT_H);
    t.uniform4f(u2.uHand, cur.x + hand.ox, cur.y + hand.oy, hand.s, handOn);
    t.uniform4f(u2.uHand2, Math.cos(hand.ang), Math.sin(hand.ang), CURZ, handTh());
    t.uniform1i(u2.uHandCol, 3);
    t.activeTexture(t.TEXTURE3);
    t.bindTexture(t.TEXTURE_2D, handColTex);
    t.uniform1i(u2.uArrowCol, 6);
    t.activeTexture(t.TEXTURE6);
    t.bindTexture(t.TEXTURE_2D, arrowColTex);
    t.uniform1f(u2.uMorph, hand.m);
    t.uniform3fv(u2.uAlb, look.albedo);
    t.uniform3fv(u2.uTint, look.tint);
    t.uniform3fv(u2.uSilver, look.label);
    t.uniform1f(u2.uFloorK, look.floor);
    t.uniform1f(u2.uShadowA, look.shadow);
    t.uniform3fv(u2.uShadowC, look.shadowColor);
    t.uniform4fv(u2.uRim, look.rim);
    t.drawArrays(t.TRIANGLES, 0, 3);

    // pass 3: FXAA to the canvas
    t.bindFramebuffer(t.FRAMEBUFFER, null);
    t.viewport(0, 0, W, H);
    t.useProgram(p3.prog);
    t.uniform1i(p3.u.uC, 4);
    t.uniform2f(p3.u.uRes, W, H);
    t.activeTexture(t.TEXTURE4);
    t.bindTexture(t.TEXTURE_2D, cTex);
    t.drawArrays(t.TRIANGLES, 0, 3);
    frameCount++;
  }

  buildIcon(HAND_SVG, handColTex, handSdfTex);
  buildIcon(ARROW_SVG, arrowColTex, arrowSdfTex);

  return {
    params: P,
    ready: () => checkLinked(),
    failed: () => failed,
    layout({ w, h, pad, radius, dpr }) {
      btn.hw = w / 2;
      btn.hh = h / 2;
      btn.r = Math.min(radius, h / 2, w / 2);
      btn.cx = pad + w / 2;
      btn.cy = pad + h / 2;
      btn.top = clamp(h * 0.23, 10, 16);
      cssW = w + pad * 2;
      cssH = h + pad * 2;
      dprWanted = Math.min(dpr || 1, 2);
      applySize();
    },
    setLabel(src, box) {
      labelBox.cx = box.cx;
      labelBox.cy = box.cy;
      labelBox.hw = box.hw;
      labelBox.hh = box.hh;
      labelInk = box.ink;
      if (!src) {
        labelTarget = 0;
        return;
      }
      labelW = src.width;
      labelH = src.height;
      gl.bindTexture(gl.TEXTURE_2D, labelTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      labelTarget = 1;
      if (frameCount === 0) labelAmt = 1;
    },
    setLook(l) {
      Object.assign(look, l);
    },
    frame(dt, pointer) {
      if (!linked || failed) return false;
      if (pointer) {
        if (cur.present && dt > 0) {
          cur.vx = (pointer.x - cur.x) / Math.max(dt, 1 / 240);
          cur.vy = (pointer.y - cur.y) / Math.max(dt, 1 / 240);
        }
        cur.x = pointer.x;
        cur.y = pointer.y;
        cur.mouse = pointer.mouse;
        cur.present = true;
      } else cur.present = false;
      dt = Math.min(dt, 0.1);
      frameEma += (dt - frameEma) * 0.05;
      acc += dt;
      let n = 0;
      while (acc >= SUB && n < 40) {
        step(SUB);
        acc -= SUB;
        n++;
      }
      if (n === 40) acc = 0;
      render();
      // adaptive resolution if the device struggles
      if (frameEma > 1 / 40 && dt < 0.09 && document.visibilityState === "visible") slowFor += dt;
      else slowFor = 0;
      if (slowFor > 1 && quality > 0.6) {
        quality -= 0.1;
        slowFor = 0;
        applySize();
      }
      return busy();
    },
    press(on, x, y) {
      btn.pressTarget = on ? 1 : 0;
      if (!on) {
        const px = x ?? btn.cx, py = y ?? btn.cy;
        addRipple(px, py, 1.6);
        for (const s of strands) if (s.state === "attached") s.rest *= 0.82;
        if (P.splash > 0) splash(px, py);
      }
    },
    handVisible: () => hand.on && hand.ready,
    idleIn: () => (P.idle ? Math.max(0, nextProbe - time) : Infinity),
    frames: () => frameCount,
    simulate(sec, to) {
      if (!linked) return;
      const n = Math.max(1, Math.round(sec / SUB)), x0 = cur.x, y0 = cur.y, was = cur.present;
      for (let i = 1; i <= n; i++) {
        if (to) {
          const f = was ? i / n : 1;
          const nx = x0 + (to.x - x0) * f, ny = y0 + (to.y - y0) * f;
          cur.vx = (nx - cur.x) / SUB;
          cur.vy = (ny - cur.y) / SUB;
          cur.x = nx;
          cur.y = ny;
          cur.mouse = to.mouse;
          cur.present = true;
        } else cur.present = false;
        step(SUB);
      }
      render();
    },
    stats: () => ({
      strands: strands.length,
      held: strands.filter((s) => s.kind === "reach" && s.state === "attached").length,
      hand: hand.on,
    }),
    destroy() {
      canvas.removeEventListener("webglcontextlost", onLost);
      for (const p of progs) gl.deleteProgram(p.prog);
      for (const s of shaders) gl.deleteShader(s);
      for (const tex of [gTex, cTex, labelTex, handColTex, handSdfTex, arrowColTex, arrowSdfTex]) gl.deleteTexture(tex);
      gl.deleteFramebuffer(fbo);
      gl.deleteFramebuffer(cFbo);
      gl.deleteVertexArray(vao);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
