import { createProgram, cssVarColor, FULLSCREEN_VS, type RGB } from "@/lib/gl/gl";
import { NOISE } from "@/lib/gl/glsl";
import type { Scene, SceneEnv } from "@/lib/gl/use-gl-scene";

/**
 * Full-screen "symbiote" ink: a glossy black mass made of signed distances (a wobbling body,
 * pseudopods, orbiting droplets) joined with a smooth minimum, so parts bridge and pinch off like
 * goo. When the cursor comes close, a tendril reaches out of the body for it and a droplet trails
 * the cursor itself. Shaded as a puffy height field: specular, fresnel and an oily thin-film sheen.
 */
const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uMass;     // centre xy, radius (aspect units, y up, height = 1)
uniform vec2 uPtr;      // pointer, aspect units
uniform vec2 uVel;      // pointer velocity, aspect units / s
uniform float uPtrOn;   // 0 … 1 presence of the pointer droplet
uniform float uReach;   // 0 … 1 tendril extension toward the pointer
uniform vec3 uBg, uInk, uRim, uHi;
uniform float uDark, uSheen;
${NOISE}

float capsule(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}

float field(vec2 p) {
  float t = uTime;
  vec2 c = uMass.xy;
  float R = uMass.z;
  vec2 q = p - c;
  // body: a circle whose radius breathes with low-frequency noise
  float d = length(q * vec2(1.0, 1.08)) - R * (1.0 + 0.2 * fbm3(q * 2.1 + vec2(t * 0.11, -t * 0.08)));
  // pseudopods: slow arms that stretch and retract
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    // irregular spacing and lengths, so the body never reads as a star
    float a = (fi < 0.5 ? 0.35 : fi < 1.5 ? 1.75 : fi < 2.5 ? 3.55 : 5.05) + t * (0.05 + 0.02 * fi) * (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0);
    vec2 dir = vec2(cos(a), sin(a));
    vec2 side = vec2(-dir.y, dir.x);
    float len = R * (1.0 + 0.16 * fi + 0.25 * sin(t * 0.5 + fi * 2.3));
    // two segments with a lazy bend, thick at the root, a rounded bead at the tip
    float bend = 0.22 * sin(t * 0.7 + fi * 1.9);
    vec2 a0 = c + dir * R * 0.6;
    vec2 a1 = c + dir * mix(R * 0.6, len, 0.55) + side * bend * R;
    vec2 a2 = c + dir * len + side * bend * R * 1.6;
    float arm = min(capsule(p, a0, a1, R * 0.22, R * 0.1), capsule(p, a1, a2, R * 0.1, R * 0.055));
    d = smin(d, arm, 0.06);
  }
  // droplets orbiting the body, merging and detaching
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float a = t * (0.16 + 0.05 * fi) + fi * 2.1;
    vec2 pos = c + vec2(cos(a), sin(a) * 0.9) * R * (1.45 + 0.2 * sin(t * 0.7 + fi));
    d = smin(d, length(p - pos) - R * (0.07 + 0.03 * fi), 0.1);
  }
  // the reaching tendril and the droplet on the cursor
  vec2 toP = uPtr - c;
  float dist = length(toP);
  vec2 dir = toP / max(dist, 1e-4);
  if (uReach > 0.001) {
    vec2 base = c + dir * R * 0.7;
    vec2 tip = mix(base, uPtr, uReach);
    // a little sideways wave so it never looks like a straight stick
    vec2 side = vec2(-dir.y, dir.x);
    vec2 mid = mix(base, tip, 0.5) + side * 0.03 * sin(t * 3.0) * uReach;
    float k = mix(R * 0.18, R * 0.08, uReach);
    float ten = min(capsule(p, base, mid, k, k * 0.7), capsule(p, mid, tip, k * 0.7, R * 0.045));
    d = smin(d, ten, 0.06);
  }
  if (uPtrOn > 0.001) {
    float r = R * 0.075 * uPtrOn;
    float drop = capsule(p, uPtr, uPtr - uVel * 0.05, r, r * 0.55);
    d = smin(d, drop, 0.04 + 0.05 * uReach);
  }
  return d;
}

void main() {
  vec2 frag = vUv * uRes;
  float px = 1.0 / uRes.y;
  vec2 p = (frag - 0.5 * uRes) * px;
  float d = field(p);

  // shadow cast on the page, offset away from the key light
  float ds = field(p + vec2(0.018, 0.028));
  float shadow = (1.0 - smoothstep(-0.02, 0.09, ds)) * mix(0.22, 0.5, uDark);
  vec3 bg = uBg * (1.0 - shadow);
  // dark theme: a faint coloured halo separates black goo from a black page
  bg += uRim * exp(-max(d, 0.0) * 28.0) * 0.16 * uDark;

  float aa = 1.6 * px;
  float mask = 1.0 - smoothstep(-aa, aa, d);
  if (mask <= 0.0) { o = vec4(bg, 1.0); return; }

  // puffy height from the distance, normal from finite differences
  float e = 2.0 * px;
  float h = sqrt(clamp(-d / 0.06, 0.0, 1.0));
  float hx = sqrt(clamp(-field(p + vec2(e, 0.0)) / 0.06, 0.0, 1.0));
  float hy = sqrt(clamp(-field(p + vec2(0.0, e)) / 0.06, 0.0, 1.0));
  vec3 n = normalize(vec3(-(hx - h) / e * 0.012, -(hy - h) / e * 0.012, 1.0));

  vec3 L = normalize(vec3(-0.45, 0.6, 0.75));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 90.0);
  float broad = pow(max(dot(n, H), 0.0), 12.0);
  float fres = pow(1.0 - n.z, 1.6);
  float rimL = pow(max(dot(n, normalize(vec3(0.7, -0.5, 0.4))), 0.0), 3.0);

  vec3 col = uInk * (0.75 + 0.25 * n.z);
  col += uHi * (spec * 0.95 + broad * 0.06);
  col += uRim * rimL * (0.35 + 0.35 * uDark);
  vec3 film = oil(h * 1.3 + fbm3(p * 3.0 + uTime * 0.05) * 0.6 + 0.15);
  col += film * fres * uSheen * 0.55;
  o = vec4(mix(bg, col, mask), 1.0);
}`;

const U = ["uRes", "uTime", "uMass", "uPtr", "uVel", "uPtrOn", "uReach", "uBg", "uInk", "uRim", "uHi", "uDark", "uSheen"] as const;

export type InkScene = Scene & {
  /** Pointer in CSS px relative to the canvas, or null when it left. */
  pointer(x: number | null, y?: number): void;
};

export function createInkScene({ gl, canvas }: SceneEnv, host: () => Element | null): InkScene {
  const { prog, u } = createProgram(gl, FULLSCREEN_VS, FRAG, U);
  const vao = gl.createVertexArray();

  let w = 1, h = 1;
  let colors = { bg: [1, 1, 1] as RGB, ink: [0, 0, 0] as RGB, rim: [0.6, 0.5, 1] as RGB, hi: [1, 1, 1] as RGB, dark: 0, sheen: 0.6 };
  const readTheme = () => {
    const el = host() ?? canvas;
    const dark = document.documentElement.classList.contains("dark") ? 1 : 0;
    colors = {
      bg: cssVarColor("--ink-bg", el, [0.95, 0.94, 0.92]),
      ink: cssVarColor("--ink-body", el, [0.02, 0.02, 0.03]),
      rim: cssVarColor("--ink-rim", el, [0.6, 0.5, 1]),
      hi: cssVarColor("--ink-hi", el, [1, 1, 1]),
      dark,
      sheen: Number(getComputedStyle(el).getPropertyValue("--ink-sheen")) || 0.6,
    };
  };
  readTheme();

  // pointer state in aspect units (y up). `target` is where the pointer is, `ptr` follows it softly.
  let target: [number, number] | null = null;
  const ptr: [number, number] = [0, 0];
  const vel: [number, number] = [0, 0];
  let presence = 0, reach = 0;
  let lastInput = -1e9;

  const mass = () => {
    const a = w / h;
    // full-bleed desktop hero: body on the right, clear of the copy (smaller on squarer screens).
    // Below that the canvas is its own stage above the copy: body in the middle.
    if (w >= 1000 && a >= 1.15) {
      const R = Math.min(0.22, (a - 1) * 0.45);
      return [a * 0.5 - R * 1.9, -0.02, R];
    }
    return [0, -0.02, Math.min(0.2, a * 0.2)];
  };

  return {
    resize(width, height) {
      w = width;
      h = height;
    },
    theme: readTheme,
    pointer(x, y) {
      if (x === null || y === undefined) {
        target = null;
        return;
      }
      const nx = (x - w / 2) / h, ny = (h / 2 - y) / h;
      if (!target) {
        ptr[0] = nx;
        ptr[1] = ny;
      }
      target = [nx, ny];
      lastInput = performance.now();
    },
    frame(t, dt) {
      const [mx, my, R] = mass();
      // ghost pointer when nobody points (touch screens, or the mouse is elsewhere): wanders
      // in and out of reach so the tendril keeps showing off
      const ghost = !target && performance.now() - lastInput > 2500;
      const goal: [number, number] | null = target ?? (ghost && dt > 0 ? [mx + Math.cos(t * 0.45) * R * 2.6, my + Math.sin(t * 0.7) * R * 1.6] : null);

      if (goal && dt > 0) {
        const k = 1 - Math.exp(-dt * 14);
        const px = ptr[0], py = ptr[1];
        ptr[0] += (goal[0] - ptr[0]) * k;
        ptr[1] += (goal[1] - ptr[1]) * k;
        const vk = 1 - Math.exp(-dt * 10);
        vel[0] += ((ptr[0] - px) / dt - vel[0]) * vk;
        vel[1] += ((ptr[1] - py) / dt - vel[1]) * vk;
      } else if (dt > 0) {
        vel[0] *= 0.9;
        vel[1] *= 0.9;
      }
      const dist = Math.hypot(ptr[0] - mx, ptr[1] - my) - R;
      const speed = Math.hypot(vel[0], vel[1]);
      // reach out within ~1.7 radii; a fast flick snaps the tendril back
      const want = goal ? Math.max(0, Math.min(1, 1 - (dist - R * 0.2) / (R * 1.7))) * (speed > 2.2 ? 0.2 : 1) : 0;
      const step = dt > 0 ? 1 - Math.exp(-dt * (want > reach ? 3.2 : 6)) : 1;
      reach += (want - reach) * step;
      presence += ((goal ? 1 : 0) - presence) * (dt > 0 ? 1 - Math.exp(-dt * 6) : 1);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform1f(u.uTime, t);
      gl.uniform3f(u.uMass, mx, my, R);
      gl.uniform2f(u.uPtr, ptr[0], ptr[1]);
      gl.uniform2f(u.uVel, vel[0], vel[1]);
      gl.uniform1f(u.uPtrOn, presence);
      gl.uniform1f(u.uReach, reach);
      gl.uniform3fv(u.uBg, colors.bg);
      gl.uniform3fv(u.uInk, colors.ink);
      gl.uniform3fv(u.uRim, colors.rim);
      gl.uniform3fv(u.uHi, colors.hi);
      gl.uniform1f(u.uDark, colors.dark);
      gl.uniform1f(u.uSheen, colors.sheen);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // keep going while the tendril or the droplet is still moving
      return Math.abs(want - reach) > 0.01 || Math.abs((goal ? 1 : 0) - presence) > 0.01 || speed > 0.01;
    },
    dispose() {
      gl.deleteProgram(prog);
      gl.deleteVertexArray(vao);
    },
  };
}
