import type { Project } from "@/data/portfolio";
import { languageColor } from "@/data/portfolio";
import { createProgram, cssVarColor, hexToRgb, type RGB } from "@/lib/gl/gl";
import type { Scene, SceneEnv } from "@/lib/gl/use-gl-scene";
import { dust, multiply, orbitView, perspective, pick, starPositions, toScreen, yearRings, type Mat4 } from "./galaxy-math";

/**
 * A spiral galaxy of point sprites. ~6k dust particles trace two arms around a bulge; each public
 * repository is a star, placed on an arm at the radius of its age (newest near the core, oldest at
 * the rim) and coloured by language. Rings mark each new year. The camera auto-rotates, can be
 * dragged, and stars are picked on the CPU from their projected positions.
 */
const POINT_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in float aSize;
layout(location = 2) in vec3 aColor;
layout(location = 3) in float aKind;   // 0 dust, 1 star
layout(location = 4) in float aDim;    // 1 = filtered out
uniform mat4 uMVP;
uniform float uPx, uTime;
uniform float uHover, uSel;
out vec3 vColor;
out float vKind, vRing, vDim;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  float id = float(gl_VertexID);
  float tw = aKind < 0.5 ? 0.75 + 0.25 * sin(uTime * (1.0 + mod(id, 7.0) * 0.3) + id) : 1.0;
  float ring = (aKind > 0.5 && (abs(id - uHover) < 0.5 || abs(id - uSel) < 0.5)) ? 1.0 : 0.0;
  float size = aKind > 0.5 ? aSize * (1.0 + ring * 0.9) : aSize * tw;
  gl_PointSize = clamp(size * uPx / gl_Position.w, 1.0, 96.0);
  vColor = aColor;
  vKind = aKind;
  vRing = ring;
  vDim = aDim;
}`;

const POINT_FS = /* glsl */ `#version 300 es
precision mediump float;
in vec3 vColor;
in float vKind, vRing, vDim;
out vec4 o;
uniform float uDark;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float a;
  vec3 col = vColor;
  if (vKind < 0.5) {
    a = exp(-r2 * 5.0) * mix(0.55, 0.8, uDark);
  } else {
    float core = exp(-r2 * 18.0);
    float halo = exp(-r2 * 3.0) * 0.45;
    float ring = vRing * smoothstep(0.08, 0.0, abs(sqrt(r2) - 0.82)) * 0.9;
    a = clamp(core + halo + ring, 0.0, 1.0);
    // white-hot core on black, inked core on paper
    col = mix(col, mix(vec3(0.05), vec3(1.0), uDark), core * 0.55);
  }
  a *= mix(1.0, 0.12, vDim);
  o = vec4(col * a, a);
}`;

const LINE_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aCircle;
uniform mat4 uMVP;
uniform float uR;
void main() { gl_Position = uMVP * vec4(aCircle.x * uR, 0.0, aCircle.y * uR, 1.0); }`;

const LINE_FS = /* glsl */ `#version 300 es
precision mediump float;
uniform vec4 uLine;
out vec4 o;
void main() { o = vec4(uLine.rgb * uLine.a, uLine.a); }`;

export type GalaxyFrame = {
  stars: ({ x: number; y: number; w: number } | null)[];
  rings: { year: number; x: number; y: number }[];
  hover: number;
};

export type GalaxyScene = Scene & {
  pointer(x: number | null, y?: number): void;
  drag(dx: number, dy: number): void;
  release(): void;
  select(i: number): void;
  /** Languages to highlight (empty = all). */
  highlight(languages: Set<string>): void;
  hovered(): number;
  onFrame(cb: ((f: GalaxyFrame) => void) | null): void;
};

const DUST = 6000;

export function createGalaxyScene({ gl, canvas, motion }: SceneEnv, projects: Project[]): GalaxyScene {
  const points = createProgram(gl, POINT_VS, POINT_FS, ["uMVP", "uPx", "uTime", "uHover", "uSel", "uDark"] as const);
  const lines = createProgram(gl, LINE_VS, LINE_FS, ["uMVP", "uR", "uLine"] as const);

  const d = dust(DUST, 11);
  const stars = starPositions(projects);
  const N = projects.length;
  const total = N + DUST;
  // stars first so their index equals gl_VertexID
  const pos = new Float32Array(total * 3), size = new Float32Array(total), color = new Float32Array(total * 3);
  const kind = new Float32Array(total), dim = new Float32Array(total);
  stars.forEach((p, i) => {
    pos.set(p, i * 3);
    size[i] = 0.075 + Math.min(0.05, Math.log10(1 + projects[i].size) * 0.012);
    kind[i] = 1;
  });
  pos.set(d.pos, N * 3);
  for (let i = 0; i < DUST; i++) size[N + i] = d.size[i] * 0.012;

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = (data: Float32Array, loc: number, n: number, usage: number = gl.STATIC_DRAW) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
    return b;
  };
  const bufs = [buf(pos, 0, 3), buf(size, 1, 1), buf(kind, 3, 1)];
  const colorBuf = buf(color, 2, 3, gl.DYNAMIC_DRAW);
  const dimBuf = buf(dim, 4, 1, gl.DYNAMIC_DRAW);
  gl.bindVertexArray(null);

  const circle = new Float32Array(129 * 2);
  for (let i = 0; i <= 128; i++) circle.set([Math.cos((i / 128) * Math.PI * 2), Math.sin((i / 128) * Math.PI * 2)], i * 2);
  const ringVao = gl.createVertexArray();
  gl.bindVertexArray(ringVao);
  const ringBuf = buf(circle, 0, 2);
  gl.bindVertexArray(null);
  const rings = yearRings(projects);

  let dark = 1;
  let lineCol: RGB = [1, 1, 1];
  const paint = () => {
    const host = canvas.closest(".pf-orbit") ?? document.documentElement;
    dark = document.documentElement.classList.contains("dark") ? 1 : 0;
    const core = cssVarColor("--orb-core", host, [1, 0.9, 0.75]);
    const arm = cssVarColor("--orb-arm", host, [0.55, 0.62, 1]);
    lineCol = cssVarColor("--orb-line", host, [1, 1, 1]);
    projects.forEach((p, i) => color.set(hexToRgb(languageColor(p.language)), i * 3));
    for (let i = 0; i < DUST; i++) {
      const t = d.tint[i];
      color.set([core[0] + (arm[0] - core[0]) * t, core[1] + (arm[1] - core[1]) * t, core[2] + (arm[2] - core[2]) * t], (N + i) * 3);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, color);
  };
  paint();

  let w = 1, h = 1, px = 1;
  let yaw = 0.6, pitch = 1.02, vyaw = 0, vpitch = 0, dragging = false;
  let ptr: [number, number] | null = null;
  let hover = -1, sel = -1;
  let frameCb: ((f: GalaxyFrame) => void) | null = null;
  let mvp: Mat4 = new Float32Array(16);

  return {
    resize(width, height, scale) {
      w = width;
      h = height;
      px = scale;
    },
    theme: paint,
    pointer(x, y) {
      ptr = x === null || y === undefined ? null : [x, y];
    },
    drag(dx, dy) {
      dragging = true;
      yaw += dx * 0.006;
      pitch = Math.max(0.35, Math.min(1.4, pitch + dy * 0.004));
      vyaw = dx * 0.006 * 60;
      vpitch = dy * 0.004 * 60;
    },
    release() {
      dragging = false;
    },
    select(i) {
      sel = i;
    },
    highlight(langs) {
      projects.forEach((p, i) => (dim[i] = langs.size && !langs.has(p.language) ? 1 : 0));
      gl.bindBuffer(gl.ARRAY_BUFFER, dimBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, dim.subarray(0, N));
    },
    hovered: () => hover,
    onFrame(cb) {
      frameCb = cb;
    },
    frame(t, dt) {
      if (!dragging && dt > 0) {
        // inertia after a drag, then the slow auto-rotation takes over again
        yaw += (vyaw + (motion ? 0.05 : 0)) * dt;
        pitch = Math.max(0.35, Math.min(1.4, pitch + vpitch * dt));
        vyaw *= Math.exp(-dt * 3);
        vpitch *= Math.exp(-dt * 3);
      }
      const aspect = w / h;
      // keep the whole disc (radius ~1.2) in frame on portrait screens, and lift it above the
      // copy at the bottom of the hero
      const dist = Math.max(2.55, 1.2 / (Math.tan(0.4) * aspect));
      const lift = aspect < 1 ? 0.22 : 0.04;
      const shift = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, lift, 0, 1]);
      mvp = multiply(shift, multiply(perspective(0.8, aspect, 0.1, 30), orbitView(yaw, pitch, dist)));

      const screen = stars.map((p) => toScreen(mvp, p, w, h));
      hover = ptr ? pick(screen, ptr[0], ptr[1], 22) : -1;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      if (dark) gl.blendFunc(gl.ONE, gl.ONE);
      else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(lines.prog);
      gl.bindVertexArray(ringVao);
      gl.uniformMatrix4fv(lines.u.uMVP, false, mvp);
      for (const r of rings) {
        gl.uniform1f(lines.u.uR, r.r);
        gl.uniform4f(lines.u.uLine, lineCol[0], lineCol[1], lineCol[2], dark ? 0.14 : 0.22);
        gl.drawArrays(gl.LINE_STRIP, 0, 129);
      }

      gl.useProgram(points.prog);
      gl.bindVertexArray(vao);
      gl.uniformMatrix4fv(points.u.uMVP, false, mvp);
      // world size → px: the projection's focal length times half the canvas height (device px)
      gl.uniform1f(points.u.uPx, (1 / Math.tan(0.4)) * h * 0.5 * px);
      gl.uniform1f(points.u.uTime, t);
      gl.uniform1f(points.u.uHover, hover);
      gl.uniform1f(points.u.uSel, sel);
      gl.uniform1f(points.u.uDark, dark);
      // dust first, stars on top
      gl.drawArrays(gl.POINTS, N, DUST);
      gl.drawArrays(gl.POINTS, 0, N);
      gl.bindVertexArray(null);

      (canvas as unknown as { __stars?: typeof screen }).__stars = screen;
      frameCb?.({
        stars: screen,
        rings: rings.map((r) => {
          const s = toScreen(mvp, [r.r * Math.cos(-0.7), 0, r.r * Math.sin(-0.7)], w, h);
          return { year: r.year, x: s?.x ?? -999, y: s?.y ?? -999 };
        }),
        hover,
      });
      return Math.abs(vyaw) + Math.abs(vpitch) > 0.01;
    },
    dispose() {
      gl.deleteProgram(points.prog);
      gl.deleteProgram(lines.prog);
      [...bufs, colorBuf, dimBuf, ringBuf].forEach((b) => gl.deleteBuffer(b));
      gl.deleteVertexArray(vao);
      gl.deleteVertexArray(ringVao);
    },
  };
}
