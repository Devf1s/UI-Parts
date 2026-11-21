import type { Project } from "@/data/portfolio";
import { createProgram, FULLSCREEN_VS, hexToRgb } from "@/lib/gl/gl";
import { COVER, COVER_KIND, NOISE } from "@/lib/gl/glsl";
import type { Scene, SceneEnv } from "@/lib/gl/use-gl-scene";

/**
 * The floating project preview of the work index: a project's generative cover that follows the
 * cursor. Switching projects dissolves one cover into the next through noise; moving fast splits
 * the colour channels along the motion and bends the card.
 */
const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform vec2 uRes;
uniform float uTime, uMix, uRadius;
uniform vec2 uVel;          // px / s, screen space
uniform vec4 uA, uB;        // kind, seed, -, - for the previous (A) and current (B) project
uniform vec3 uA0, uA1, uA2, uB0, uB1, uB2;
${NOISE}
${COVER}

vec3 both(vec2 p) {
  vec3 b = cover(p, uB.x, uB.y, uB0, uB1, uB2, uTime);
  if (uMix >= 1.0) return b;
  vec3 a = cover(p, uA.x, uA.y, uA0, uA1, uA2, uTime);
  // dissolve along a noisy front that sweeps across the card
  float n = vnoise(p * 5.0) * 0.25 + (vUv.x * 0.6 + (1.0 - vUv.y) * 0.4);
  float m = smoothstep(n - 0.08, n + 0.08, uMix * 1.5 - 0.1);
  return mix(a, b, m);
}

void main() {
  vec2 size = uRes;
  vec2 frag = vUv * size;
  // rounded corners
  vec2 q = abs(frag - 0.5 * size) - (0.5 * size - uRadius);
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
  float alpha = 1.0 - smoothstep(-1.0, 1.0, sd);
  if (alpha <= 0.0) { o = vec4(0.0); return; }

  vec2 p = (frag - 0.5 * size) / size.y;
  // bulge toward the motion: the middle of the card lags behind its edges
  vec2 v = uVel / size.y * 0.005;
  p -= v * (1.0 - dot(vUv - 0.5, vUv - 0.5) * 4.0);
  vec3 col;
  float split = length(v);
  if (split > 0.003) {
    vec2 off = v * 0.45;
    col = vec3(both(p + off).r, both(p).g, both(p - off).b);
  } else {
    col = both(p);
  }
  // soft vignette for depth
  col *= 0.9 + 0.1 * smoothstep(0.9, 0.2, length(vUv - 0.5));
  o = vec4(col * alpha, alpha);
}`;

const U = ["uRes", "uTime", "uMix", "uRadius", "uVel", "uA", "uB", "uA0", "uA1", "uA2", "uB0", "uB1", "uB2"] as const;

export type PreviewScene = Scene & {
  show(project: Project): void;
  /** Screen-space velocity of the card, px / s. */
  velocity(vx: number, vy: number): void;
};

export function createPreviewScene({ gl, canvas }: SceneEnv): PreviewScene {
  const { prog, u } = createProgram(gl, FULLSCREEN_VS, FRAG, U);
  const vao = gl.createVertexArray();
  let scale = 1;
  let prev: Project | null = null, cur: Project | null = null;
  let mix = 1;
  let vx = 0, vy = 0;

  const set = (slot: "A" | "B", p: Project) => {
    const [c0, c1, c2] = p.palette.map(hexToRgb);
    gl.uniform4f(slot === "A" ? u.uA : u.uB, COVER_KIND[p.category], p.seed, 0, 0);
    gl.uniform3fv(slot === "A" ? u.uA0 : u.uB0, c0);
    gl.uniform3fv(slot === "A" ? u.uA1 : u.uB1, c1);
    gl.uniform3fv(slot === "A" ? u.uA2 : u.uB2, c2);
  };

  return {
    resize(_w, _h, s) {
      scale = s;
    },
    show(p) {
      if (cur?.slug === p.slug) return;
      prev = cur;
      cur = p;
      mix = prev ? 0 : 1;
    },
    velocity(x, y) {
      vx = x;
      vy = y;
    },
    frame(t, dt) {
      if (!cur) return false;
      mix = dt > 0 ? Math.min(1, mix + dt * 2.2) : 1;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform1f(u.uTime, t);
      gl.uniform1f(u.uMix, mix);
      gl.uniform1f(u.uRadius, 14 * scale);
      gl.uniform2f(u.uVel, vx * scale, -vy * scale);
      if (prev) set("A", prev);
      set("B", cur);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return mix < 1;
    },
    dispose() {
      gl.deleteProgram(prog);
      gl.deleteVertexArray(vao);
    },
  };
}
