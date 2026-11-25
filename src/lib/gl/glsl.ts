/** GLSL building blocks shared by the portfolio scenes (WebGL2 / GLSL ES 3.00). */

export const NOISE = /* glsl */ `
float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
// value noise, quintic fade, -1 … 1
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}
const mat2 OCT = mat2(1.6, 1.2, -1.2, 1.6);
float fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = OCT * p; a *= 0.5; }
  return s;
}
float fbm5(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = OCT * p; a *= 0.5; }
  return s;
}
// polynomial smooth minimum: gooey union of two distances
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
// thin-film style oil colour for a phase 0 … 1
vec3 oil(float x) {
  return 0.5 + 0.5 * cos(6.28318 * (x + vec3(0.0, 0.33, 0.67)));
}
`;

/**
 * Generative project cover. `kind` encodes the category so the covers read as a system:
 * 0 web app → marbled flow, 1 game → halftone dots, 2 landing → folded ribbons, 3 bot → signal rings.
 * c0 / c1 / c2 are the palette from light to dark, all sRGB.
 */
export const COVER = /* glsl */ `
vec3 ramp(vec3 c0, vec3 c1, vec3 c2, float x) {
  x = clamp(x, 0.0, 1.0);
  return x < 0.5 ? mix(c2, c1, x * 2.0) : mix(c1, c0, x * 2.0 - 1.0);
}

vec3 coverFlow(vec2 p, float seed, vec3 c0, vec3 c1, vec3 c2, float t) {
  p += seed * 17.0;
  vec2 q = vec2(fbm3(p + vec2(0.0, t * 0.05)), fbm3(p + vec2(5.2, 1.3) - t * 0.04));
  vec2 r = vec2(fbm3(p + 3.0 * q + vec2(1.7, 9.2) + t * 0.06), fbm3(p + 3.0 * q + vec2(8.3, 2.8)));
  float v = fbm3(p + 3.2 * r);
  vec3 col = ramp(c0, c1, c2, 0.5 + 0.95 * v);
  // silky highlight along the folds
  float ridge = 1.0 - abs(sin((v + length(r)) * 9.0));
  col = mix(col, c0, pow(ridge, 6.0) * 0.45);
  return col;
}

vec3 coverDots(vec2 p, float seed, vec3 c0, vec3 c1, vec3 c2, float t) {
  float n = 11.0;
  vec2 g = p * n;
  vec2 id = floor(g), f = fract(g) - 0.5;
  float field = fbm3(id * 0.16 + seed * 9.0 + vec2(t * 0.12, -t * 0.07));
  float r = 0.08 + 0.34 * smoothstep(-0.45, 0.45, field);
  float d = length(f) - r;
  float aa = 1.2 * n * fwidth(p.x) + 0.01;
  float dot_ = 1.0 - smoothstep(-aa, aa, d);
  vec3 ink = mix(c1, c0, smoothstep(0.1, 0.4, r));
  return mix(c2, ink, dot_);
}

vec3 coverRibbons(vec2 p, float seed, vec3 c0, vec3 c1, vec3 c2, float t) {
  vec3 col = c2;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float y0 = -0.55 + fi * 0.2 + 0.05 * sin(seed * 31.0 + fi);
    float w = 0.1 + 0.02 * sin(fi * 2.3 + seed * 7.0);
    float k = 2.2 + 0.6 * sin(fi + seed * 13.0);
    float ph = seed * 6.28 + fi * 1.7 + t * (0.25 + 0.05 * fi);
    float y = y0 + 0.14 * sin(p.x * k + ph) + 0.05 * sin(p.x * k * 2.3 - ph * 1.3);
    float slope = 0.14 * k * cos(p.x * k + ph);
    float d = abs(p.y - y) - w;
    float aa = fwidth(p.y) * 1.5;
    float m = 1.0 - smoothstep(-aa, aa, d);
    // lit like a folded strip: the slope turns it toward or away from the light
    float light = 0.55 + 0.45 * clamp(-slope * 1.6 + 0.3, -1.0, 1.0);
    vec3 band = mix(c1, c0, fi / 5.0) * (0.75 + 0.35 * light);
    // soft shadow on what lies below
    float sh = smoothstep(0.08, 0.0, p.y - (y - w)) * smoothstep(-0.2, 0.0, p.y - (y - w));
    col *= 1.0 - 0.25 * sh * (1.0 - m);
    col = mix(col, band, m);
  }
  return col;
}

vec3 coverRings(vec2 p, float seed, vec3 c0, vec3 c1, vec3 c2, float t) {
  vec2 c = vec2(0.35 * sin(seed * 12.0), 0.25 * cos(seed * 9.0));
  float d = length(p - c) + 0.08 * fbm3(p * 2.0 + seed * 5.0 + t * 0.1);
  float w = fract(d * 7.0 - t * 0.35);
  float band = smoothstep(0.0, 0.08, w) * smoothstep(0.6, 0.45, w);
  vec3 col = mix(c2, mix(c1, c0, smoothstep(0.9, 0.0, d)), band);
  col += c0 * 0.35 * exp(-d * 5.0);
  return col;
}

// p: centred, aspect-correct coords (y in -0.5 … 0.5 for a full cover)
vec3 cover(vec2 p, float kind, float seed, vec3 c0, vec3 c1, vec3 c2, float t) {
  vec3 col;
  if (kind < 0.5) col = coverFlow(p * 1.05, seed, c0, c1, c2, t);
  else if (kind < 1.5) col = coverDots(p, seed, c0, c1, c2, t);
  else if (kind < 2.5) col = coverRibbons(p * 1.2, seed, c0, c1, c2, t);
  else col = coverRings(p, seed, c0, c1, c2, t);
  return col;
}
`;

/** Category → cover kind used by the COVER chunk. */
export const COVER_KIND = { app: 0, game: 1, landing: 2, bot: 3 } as const;
