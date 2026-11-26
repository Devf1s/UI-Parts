import { createProgram, FULLSCREEN_VS, type RGB } from "@/lib/gl/gl";
import { NOISE } from "@/lib/gl/glsl";
import type { Scene, SceneEnv } from "@/lib/gl/use-gl-scene";

/**
 * The picture in the work index's floating preview: a screenshot of the hovered project. Switching
 * projects dissolves one picture into the next along a noisy front; moving fast bends the picture
 * toward the motion and splits its colour channels. Everything is texture lookups (at most six
 * per pixel), so it stays cheap on any GPU. A slide whose picture hasn't arrived yet shows its
 * dominant colour and dissolves into the picture when it lands.
 */
const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform vec2 uRes;
uniform float uMix;
uniform vec2 uVel;              // px / s at canvas scale, y down like uv
uniform sampler2D uTexA, uTexB;
uniform vec4 uA, uB;            // x: has picture, y: picture aspect
uniform vec3 uColA, uColB;      // placeholder colours
${NOISE}

// cover-fit, pinned to the top (screenshots read from the top); uv has its origin top-left
vec2 fit(vec2 uv, float aspect) {
  float ca = uRes.x / uRes.y;
  vec2 s = ca > aspect ? vec2(1.0, aspect / ca) : vec2(ca / aspect, 1.0);
  return vec2(0.5 + (uv.x - 0.5) * s.x, uv.y * s.y);
}
vec3 slot(sampler2D tex, vec4 info, vec3 col, vec2 uv) {
  if (info.x < 0.5) return col * (1.04 - 0.08 * uv.y);
  return texture(tex, fit(uv, info.y)).rgb;
}
vec3 both(vec2 uv, float m) {
  vec3 b = slot(uTexB, uB, uColB, uv);
  if (m >= 1.0) return b;
  return mix(slot(uTexA, uA, uColA, uv), b, m);
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  // dissolve front sweeping from the top-left corner
  float front = uMix * 1.5 - 0.1;
  float n = vnoise(vUv * vec2(uRes.x / uRes.y, 1.0) * 5.0) * 0.25 + (vUv.x * 0.6 + (1.0 - vUv.y) * 0.4);
  float m = uMix >= 1.0 ? 1.0 : smoothstep(n - 0.08, n + 0.08, front);

  // moving: the middle lags behind the edges, the picture zooms in a touch so no edge shows
  vec2 v = uVel / uRes.y * 0.005;
  float speed = length(v);
  vec2 c = uv - 0.5;
  uv = 0.5 + c * (1.0 - min(speed * 0.6, 0.05));
  uv -= v * (1.0 - dot(c, c) * 4.0);

  vec3 col;
  if (speed > 0.003) {
    vec2 off = v * 0.45;
    col = vec3(both(uv + off, m).r, both(uv, m).g, both(uv - off, m).b);
  } else {
    col = both(uv, m);
  }
  // a faint light along the dissolve front
  if (uMix < 1.0) col += 0.18 * (1.0 - smoothstep(0.0, 0.06, abs(front - n)));
  o = vec4(col, 1.0);
}`;

const U = ["uRes", "uMix", "uVel", "uTexA", "uTexB", "uA", "uB", "uColA", "uColB"] as const;

export type Slide = { key: string; color: RGB };

export type PreviewScene = Scene & {
  show(slide: Slide): void;
  /** Whether the picture of `key` is already on the GPU. */
  has(key: string): boolean;
  /** Hands over the picture of a slide. True when it is on screen now, i.e. worth a redraw. */
  picture(key: string, image: ImageBitmap): boolean;
  /** Screen-space velocity of the card, px / s. */
  velocity(vx: number, vy: number): void;
};

type Shown = Slide & { tex: WebGLTexture | null; aspect: number };

export function createPreviewScene({ gl, canvas }: SceneEnv): PreviewScene {
  const { prog, u } = createProgram(gl, FULLSCREEN_VS, FRAG, U);
  const vao = gl.createVertexArray();
  const textures = new Map<string, { tex: WebGLTexture; aspect: number }>();
  // bound to a slot with no picture: a sampler on an empty unit makes Chrome log a warning per draw
  const blank = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, blank);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  let scale = 1;
  let prev: Shown | null = null, cur: Shown | null = null;
  let mix = 1;
  let vx = 0, vy = 0;

  const resolve = (s: Slide): Shown => {
    const t = textures.get(s.key);
    return { ...s, tex: t?.tex ?? null, aspect: t?.aspect ?? 1.6 };
  };

  const bind = (slot: 0 | 1, s: Shown | null) => {
    gl.activeTexture(slot ? gl.TEXTURE1 : gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, s?.tex ?? blank);
    gl.uniform4f(slot ? u.uB : u.uA, s?.tex ? 1 : 0, s?.aspect ?? 1.6, 0, 0);
    gl.uniform3fv(slot ? u.uColB : u.uColA, s?.color ?? [0, 0, 0]);
  };

  return {
    resize(_w, _h, s) {
      scale = s;
    },
    show(s) {
      if (cur?.key === s.key) return;
      prev = cur;
      cur = resolve(s);
      mix = prev ? 0 : 1;
    },
    has: (key) => textures.has(key),
    picture(key, image) {
      if (textures.has(key)) return false;
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      // mipmaps keep the small print of a screenshot clean when the card is drawn below its size
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      textures.set(key, { tex, aspect: image.width / image.height });
      if (prev?.key === key) prev = resolve(prev);
      if (cur?.key !== key) return prev?.key === key && mix < 1;
      // the placeholder on screen dissolves into the picture
      if (mix >= 1) prev = cur;
      cur = resolve(cur);
      if (mix >= 1) mix = 0;
      return true;
    },
    velocity(x, y) {
      vx = x;
      vy = y;
    },
    frame(_t, dt) {
      if (!cur) return false;
      mix = dt > 0 ? Math.min(1, mix + dt * 2.2) : 1;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform1f(u.uMix, mix);
      gl.uniform2f(u.uVel, vx * scale, vy * scale);
      gl.uniform1i(u.uTexA, 0);
      gl.uniform1i(u.uTexB, 1);
      bind(0, mix < 1 ? prev : null);
      bind(1, cur);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return mix < 1;
    },
    dispose() {
      for (const t of textures.values()) gl.deleteTexture(t.tex);
      textures.clear();
      gl.deleteTexture(blank);
      gl.deleteProgram(prog);
      gl.deleteVertexArray(vao);
    },
  };
}
