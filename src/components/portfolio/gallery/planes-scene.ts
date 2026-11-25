import type { Project } from "@/data/portfolio";
import { createGrid, createProgram, hexToRgb } from "@/lib/gl/gl";
import { COVER, COVER_KIND, NOISE } from "@/lib/gl/glsl";
import type { Scene, SceneEnv } from "@/lib/gl/use-gl-scene";

/**
 * Project covers drawn by one fixed, full-viewport canvas on top of their DOM boxes (DOM to
 * WebGL sync). Each frame reads the boxes' rects, so native scroll, layout animations and
 * filtering just work. Scroll velocity bends the planes (the middle lags behind the edges) and
 * splits colour; hovering zooms the cover and sends a ripple out from the cursor.
 */
const VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aUv;
uniform vec4 uRect;     // x, y, w, h in CSS px
uniform vec2 uView;     // viewport in CSS px
uniform float uVel;     // scroll velocity, px / s (down is positive)
out vec2 vUv;
void main() {
  vec2 pos = uRect.xy + aUv * uRect.zw;
  // bend: the middle of each plane trails the scroll, edges lead
  float b = clamp(uVel * 0.022, -48.0, 48.0);
  pos.y += b * sin(aUv.x * 3.14159) * (0.35 + 0.65 * sin(aUv.y * 3.14159));
  vUv = aUv;
  vec2 clip = pos / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform vec4 uRect;
uniform float uTime, uVel, uHover, uRadius, uDpr;
uniform vec2 uPtr;      // pointer in the plane's uv
uniform vec4 uCover;    // kind, seed
uniform vec3 uC0, uC1, uC2;
${NOISE}
${COVER}

void main() {
  vec2 size = uRect.zw;
  vec2 frag = vUv * size;
  vec2 q = abs(frag - 0.5 * size) - (0.5 * size - uRadius);
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
  float alpha = 1.0 - smoothstep(-0.75 / uDpr, 0.75 / uDpr, sd);
  if (alpha <= 0.0) discard;

  vec2 uv = vUv;
  // hover: zoom in a touch and ripple out from the cursor
  uv = (uv - 0.5) * (1.0 - 0.07 * uHover) + 0.5;
  vec2 d = (uv - uPtr) * vec2(size.x / size.y, 1.0);
  float r = length(d);
  uv += normalize(d + 1e-5) * sin(r * 38.0 - uTime * 7.0) * exp(-r * 5.0) * 0.012 * uHover;

  vec2 p = (uv - 0.5) * vec2(size.x / size.y, 1.0);
  float split = clamp(abs(uVel) * 0.000018, 0.0, 0.03);
  vec3 col;
  if (split > 0.002) {
    vec2 off = vec2(0.0, split * sign(uVel));
    col = vec3(cover(p + off, uCover.x, uCover.y, uC0, uC1, uC2, uTime).r,
               cover(p, uCover.x, uCover.y, uC0, uC1, uC2, uTime).g,
               cover(p - off, uCover.x, uCover.y, uC0, uC1, uC2, uTime).b);
  } else {
    col = cover(p, uCover.x, uCover.y, uC0, uC1, uC2, uTime);
  }
  col *= 0.92 + 0.08 * smoothstep(0.85, 0.2, length(vUv - 0.5));
  o = vec4(col * alpha, alpha);
}`;

const U = ["uRect", "uView", "uVel", "uTime", "uHover", "uRadius", "uDpr", "uPtr", "uCover", "uC0", "uC1", "uC2"] as const;

type Plane = { el: HTMLElement; project: Project; hover: number; radius: number; colors: [number, number, number][] };

export type PlanesScene = Scene & {
  /** The DOM boxes to draw on, with their projects (call after every filter / layout change). */
  setPlanes(list: { el: HTMLElement; project: Project }[]): void;
  /** Pointer in viewport px, or null. */
  pointer(x: number | null, y?: number): void;
};

export function createPlanesScene({ gl, canvas, motion }: SceneEnv): PlanesScene {
  const { prog, u } = createProgram(gl, VERT, FRAG, U);
  const grid = createGrid(gl, 24, 16);
  let planes: Plane[] = [];
  let w = 1, h = 1, scale = 1;
  let ptr: [number, number] | null = null;
  let lastY = typeof window === "undefined" ? 0 : window.scrollY;
  let vel = 0;

  return {
    resize(width, height, s) {
      w = width;
      h = height;
      scale = s;
    },
    setPlanes(list) {
      const prev = new Map(planes.map((p) => [p.project.slug, p.hover]));
      planes = list.map(({ el, project }) => ({
        el,
        project,
        hover: prev.get(project.slug) ?? 0,
        radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 16,
        colors: project.palette.map(hexToRgb),
      }));
    },
    pointer(x, y) {
      ptr = x === null || y === undefined ? null : [x, y];
    },
    frame(t, dt) {
      const y = window.scrollY;
      if (dt > 0 && motion) {
        const raw = (y - lastY) / dt;
        vel += (raw - vel) * (1 - Math.exp(-dt * 10));
      } else vel = 0;
      lastY = y;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(prog);
      gl.bindVertexArray(grid.vao);
      gl.uniform2f(u.uView, w, h);
      gl.uniform1f(u.uVel, vel);
      gl.uniform1f(u.uTime, t);
      gl.uniform1f(u.uDpr, scale);

      let settling = Math.abs(vel) > 4;
      for (const pl of planes) {
        const r = pl.el.getBoundingClientRect();
        const inside = !!ptr && ptr[0] >= r.left && ptr[0] <= r.right && ptr[1] >= r.top && ptr[1] <= r.bottom;
        const goal = inside ? 1 : 0;
        pl.hover += (goal - pl.hover) * (dt > 0 ? 1 - Math.exp(-dt * 7) : 1);
        if (Math.abs(goal - pl.hover) > 0.005) settling = true;
        // off screen (with room for the bend) or collapsed: skip
        if (r.width < 2 || r.height < 2 || r.bottom < -60 || r.top > h + 60 || r.right < 0 || r.left > w) continue;
        gl.uniform4f(u.uRect, r.left, r.top, r.width, r.height);
        gl.uniform1f(u.uRadius, pl.radius);
        gl.uniform1f(u.uHover, pl.hover);
        gl.uniform2f(u.uPtr, ptr ? (ptr[0] - r.left) / r.width : 0.5, ptr ? (ptr[1] - r.top) / r.height : 0.5);
        gl.uniform4f(u.uCover, COVER_KIND[pl.project.category], pl.project.seed, 0, 0);
        gl.uniform3fv(u.uC0, pl.colors[0]);
        gl.uniform3fv(u.uC1, pl.colors[1]);
        gl.uniform3fv(u.uC2, pl.colors[2]);
        gl.drawElements(gl.TRIANGLES, grid.count, gl.UNSIGNED_SHORT, 0);
      }
      return settling;
    },
    dispose() {
      gl.deleteProgram(prog);
      grid.dispose();
      gl.deleteVertexArray(grid.vao);
    },
  };
}
