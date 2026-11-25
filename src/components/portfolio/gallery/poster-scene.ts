import { createGrid, createProgram, type RGB } from "@/lib/gl/gl";
import type { Scene, SceneEnv } from "@/lib/gl/use-gl-scene";

/**
 * A paper poster taped to the wall that moves like cloth: a 48×64 grid displaced in the vertex
 * shader by wind waves whose amplitude grows away from the taped top edge, plus a push where the
 * cursor touches it that rings out over a second. Normals come from the same displacement
 * function (finite differences), so the folds catch the light. The artwork is a 2D canvas
 * texture drawn once per theme.
 */
const VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aUv;
uniform float uTime, uAspect, uWind, uShadow;
uniform vec3 uPush;          // uv of the touch, strength
uniform vec2 uTilt;          // radians, from the pointer
uniform vec2 uScale;         // poster size in clip units at z = 0
out vec2 vUv;
out vec3 vN;
out float vFade;

float disp(vec2 uv) {
  float t = uTime;
  float hang = pow(uv.y, 1.25);            // 0 at the taped top edge
  float w = 0.05 * sin(uv.x * 4.5 + t * 1.6 + uv.y * 2.2)
          + 0.03 * sin(uv.x * 9.0 - t * 2.1 + uv.y * 5.0)
          + 0.025 * sin(uv.y * 6.5 + t * 1.2 + uv.x * 1.5);
  // corners flap more than the middle of the edge
  float corner = 0.6 + 0.4 * abs(uv.x - 0.5) * 2.0;
  vec2 d = (uv - uPush.xy) * vec2(uAspect, 1.0);
  float push = uPush.z * exp(-dot(d, d) * 18.0) * pow(uv.y, 0.6);
  return hang * (w * uWind * corner) - push * 0.22;
}

vec3 place(vec2 uv) {
  float z = disp(uv);
  // the cloth also sways sideways a little and its bottom edge lifts with the wave
  float sway = pow(uv.y, 1.5) * 0.015 * sin(uTime * 0.9 + uv.y * 3.0) * uWind;
  return vec3((uv.x - 0.5) * uAspect + sway, 0.5 - uv.y + abs(z) * 0.15 * uv.y, z);
}

void main() {
  vec2 uv = aUv;
  vec3 p;
  if (uShadow > 0.5) {
    // shadow: the flat poster, grown a little, pushed back and down
    uv = (aUv - 0.5) * 1.12 + 0.5;
    p = vec3((uv.x - 0.5) * uAspect + 0.035, 0.5 - uv.y - 0.05, -0.12);
    vFade = 1.0;
  } else {
    p = place(uv);
    float e = 0.01;
    vec3 px = place(uv + vec2(e, 0.0)) - p;
    vec3 py = place(uv + vec2(0.0, e)) - p;
    vN = normalize(cross(px, -py));
    vFade = 0.0;
  }
  vUv = aUv;
  // tilt toward the pointer, then a simple perspective
  float cy = cos(uTilt.x), sy = sin(uTilt.x), cx = cos(uTilt.y), sx = sin(uTilt.y);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
  float persp = 1.0 / (1.0 - p.z * 0.45);
  gl_Position = vec4(p.xy * uScale * persp, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vN;
in float vFade;
out vec4 o;
uniform sampler2D uTex;
uniform vec3 uShadowCol;
uniform float uShadowA;

void main() {
  if (vFade > 0.5) {
    // soft-edged shadow: fades out over the 6 % margin the shadow mesh adds
    vec2 q = abs(vUv - 0.5) * 2.0;
    float edge = max(q.x, q.y);
    float a = (1.0 - smoothstep(0.72, 1.0, edge)) * uShadowA;
    o = vec4(uShadowCol * a, a);
    return;
  }
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 L = normalize(vec3(-0.35, 0.55, 0.8));
  float diff = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 40.0);
  vec4 tex = texture(uTex, vUv);
  vec3 col = tex.rgb * (0.68 + 0.42 * diff) + spec * 0.07;
  o = vec4(col, 1.0);
}`;

const U = ["uTime", "uAspect", "uWind", "uShadow", "uPush", "uTilt", "uScale", "uTex", "uShadowCol", "uShadowA"] as const;

export type PosterArt = {
  /** Draws the poster artwork; called again on theme change. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void;
};

export type PosterScene = Scene & {
  /** Pointer over the poster in canvas CSS px, or null. */
  pointer(x: number | null, y?: number): void;
  /** Redraw the artwork (fonts loaded, theme changed). */
  repaint(): void;
};

const TEX_W = 1024, TEX_H = 1365;

export function createPosterScene({ gl, canvas }: SceneEnv, art: PosterArt, shadow: () => { color: RGB; alpha: number }): PosterScene {
  const { prog, u } = createProgram(gl, VERT, FRAG, U);
  const grid = createGrid(gl, 48, 64);
  const tex = gl.createTexture();
  const paper = document.createElement("canvas");
  paper.width = TEX_W;
  paper.height = TEX_H;

  const repaint = () => {
    const ctx = paper.getContext("2d");
    if (!ctx) return;
    art.draw(ctx, TEX_W, TEX_H);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paper);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };
  repaint();

  let w = 1, h = 1;
  let target: [number, number] | null = null;
  const ptr: [number, number] = [0.5, 0.5];
  let push = 0;
  let lastUv: [number, number] | null = null;
  const tilt = [0, 0];

  // poster units: x in ±aspect/2, y in ±0.5. It fills 80 % of the canvas height, centred,
  // with square pixels whatever the canvas aspect.
  const layout = () => {
    const aspect = TEX_W / TEX_H;
    const fill = 0.8;
    return { aspect, scale: [2 * fill * (h / w), 2 * fill] as const };
  };

  return {
    resize(width, height) {
      w = width;
      h = height;
    },
    theme: repaint,
    repaint,
    pointer(x, y) {
      if (x === null || y === undefined) {
        target = null;
        lastUv = null;
        return;
      }
      const { aspect, scale } = layout();
      // canvas px → poster uv (ignores the small tilt)
      const cx = (x / w) * 2 - 1, cy = 1 - (y / h) * 2;
      const uvx = cx / scale[0] / aspect + 0.5;
      const uvy = 0.5 - cy / scale[1];
      const inside = uvx > -0.05 && uvx < 1.05 && uvy > -0.05 && uvy < 1.05;
      if (!inside) {
        target = null;
        lastUv = null;
        return;
      }
      if (lastUv) {
        // the faster the swipe, the harder the push
        const dv = Math.hypot(uvx - lastUv[0], uvy - lastUv[1]);
        push = Math.min(1, push + dv * 6);
      }
      lastUv = [uvx, uvy];
      target = [uvx, uvy];
    },
    frame(t, dt) {
      if (target) {
        ptr[0] += (target[0] - ptr[0]) * (dt > 0 ? 1 - Math.exp(-dt * 12) : 1);
        ptr[1] += (target[1] - ptr[1]) * (dt > 0 ? 1 - Math.exp(-dt * 12) : 1);
      }
      push *= dt > 0 ? Math.exp(-dt * 2.2) : 1;
      const want = target ? [(ptr[0] - 0.5) * 0.35, (ptr[1] - 0.5) * 0.25] : [0, 0];
      const k = dt > 0 ? 1 - Math.exp(-dt * 4) : 1;
      tilt[0] += (want[0] - tilt[0]) * k;
      tilt[1] += (want[1] - tilt[1]) * k;

      const { aspect, scale } = layout();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(prog);
      gl.bindVertexArray(grid.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.uTex, 0);
      gl.uniform1f(u.uTime, t);
      gl.uniform1f(u.uAspect, aspect);
      gl.uniform1f(u.uWind, 1);
      gl.uniform3f(u.uPush, ptr[0], ptr[1], push);
      gl.uniform2f(u.uTilt, tilt[0], tilt[1]);
      gl.uniform2f(u.uScale, scale[0], scale[1]);
      const sh = shadow();
      gl.uniform3fv(u.uShadowCol, sh.color);
      gl.uniform1f(u.uShadowA, sh.alpha);
      gl.uniform1f(u.uShadow, 1);
      gl.drawElements(gl.TRIANGLES, grid.count, gl.UNSIGNED_SHORT, 0);
      gl.uniform1f(u.uShadow, 0);
      gl.drawElements(gl.TRIANGLES, grid.count, gl.UNSIGNED_SHORT, 0);
      return push > 0.01 || Math.abs(want[0] - tilt[0]) + Math.abs(want[1] - tilt[1]) > 0.002;
    },
    dispose() {
      gl.deleteProgram(prog);
      gl.deleteTexture(tex);
      grid.dispose();
      gl.deleteVertexArray(grid.vao);
    },
  };
}
