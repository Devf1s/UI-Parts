/**
 * GLSL for the WebGL venom button. Adapted from exteestudio/venom-button (MIT, © 2026 exteestudio):
 * a top-down ray march of signed distance fields (slab, tendrils, webs, droplets, the cursor icon),
 * studio shading with heightfield shadows, then FXAA.
 *
 * Changes for use inside a page: the floor is transparent (only its shadows are drawn, as
 * premultiplied alpha), the slab can be a rounded rectangle, and body colour, rim tint, label
 * colour and how much the floor bounces light are uniforms so themes and CSS variables apply.
 */

export type ShaderLimits = { MAXS: number; NP: number; MAXB: number; MAXR: number; MAXBR: number; MAXC: number; WP: number };

export const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const NOISE = `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

/** Pass 1: vertical ray march of the scene into a G-buffer (normal.xy, height, material). */
export const sceneFrag = (L: ShaderLimits, float: boolean) => `#version 300 es
precision highp float;
precision highp int;
#define MAXS ${L.MAXS}
#define NP ${L.NP}
#define MAXB ${L.MAXB}
#define MAXR ${L.MAXR}
#define MAXBR ${L.MAXBR}
#define MAXC ${L.MAXC}
#define WP ${L.WP}
${float ? "" : "#define ENC8 1"}

uniform vec2 uRes;
uniform float uDpr;
uniform float uTime;
uniform int uNC;
uniform vec4 uCoil[MAXC * WP];
uniform vec4 uCBox[MAXC];
uniform sampler2D uHandSDF;
uniform sampler2D uArrowSDF;
uniform float uMorph;
uniform vec4 uHand;            // hotspot x, y, px per icon unit, visible
uniform vec4 uHand2;           // cos, sin of tilt, slab centre z, slab half thickness
uniform vec3 uCoat;            // engulf front, softness, patch threshold
uniform vec4 uBtn;             // cx, cy, half width, half height
uniform vec4 uBtnZ;            // top, sink, dome, unused
uniform vec4 uBtnZ2;           // lift, bevel, corner radius
uniform vec4 uPull;
uniform vec4 uPeak;
uniform int uNS;
uniform vec4 uPts[MAXS * NP];
uniform vec4 uBox[MAXS];
uniform vec4 uAnc[MAXS];
uniform vec4 uAncD[MAXS];
uniform int uNBr;
uniform vec4 uBr[MAXBR * 3];
uniform int uNB;
uniform vec4 uBlob[MAXB];
uniform float uBlobZ[MAXB];
uniform vec4 uRip[MAXR];
uniform float uZTop;
uniform vec3 uK;

out vec4 outG;

uint gMask[MAXS];
uint gCMask[MAXC];
bool gBlob[MAXB];
bool gBr[MAXBR];
bool gHand;
const vec2 HOT = vec2(8.0, 3.0);
const vec2 HOT_A = vec2(6.1, 0.9);

vec2 iconQ(vec2 p, vec2 hot) {
  vec2 d = p - uHand.xy;
  return vec2(uHand2.x * d.x + uHand2.y * d.y, -uHand2.y * d.x + uHand2.x * d.y) / uHand.z + hot;
}
float iconSdf(sampler2D t, vec2 q) {
  vec2 qc = clamp(q, vec2(0.0), vec2(24.0));
  return textureLod(t, qc / 24.0, 0.0).r + length(q - qc);
}
float hand2D(vec2 p) {
  float dh = uMorph > 0.001 ? iconSdf(uHandSDF, iconQ(p, HOT)) : 0.0;
  float da = uMorph < 0.999 ? iconSdf(uArrowSDF, iconQ(p, HOT_A)) : 0.0;
  return mix(da, dh, uMorph) * uHand.z;
}
float sdHand(float h2, float z, float th) {
  return length(vec2(max(h2 + th, 0.0), z - uHand2.z)) - th;
}
${NOISE}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }

// rounded rectangle (a pill when the radius is half the height) + surface lift
vec2 button2D(vec2 p) {
  vec2 q = p - uBtn.xy;
  float r = uBtnZ2.z;
  vec2 dd = abs(q) - (uBtn.zw - r);
  float d = length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0) - r;
  if (d > 110.0) return vec2(d, 0.0);
  float inner = clamp(-d / uBtn.w, 0.0, 1.0);
  float disp = uBtnZ.z * (1.0 - (1.0 - inner) * (1.0 - inner));
  float body = smoothstep(1.0, -14.0, d);
  float lift = 0.0;
  vec2 dp = p - uPull.xy;
  lift += uPull.z * exp(-dot(dp, dp) / (2.0 * uPull.w * uPull.w));
  dp = p - uPeak.xy;
  float rr = dot(dp, dp) / (uPeak.w * uPeak.w);
  lift += uPeak.z / ((1.0 + rr) * (1.0 + rr));
  for (int i = 0; i < MAXS; i++) {
    if (i >= uNS) break;
    vec4 an = uAnc[i];
    if (an.z <= 0.0) continue;
    vec4 ad = uAncD[i];
    dp = p - an.xy;
    float al = dot(dp, ad.xy), ac = dp.x * ad.y - dp.y * ad.x;
    float sl = an.w * (1.0 + ad.z), a0 = an.w * ad.z * 0.7;
    lift += an.z * exp(-ac * ac / (2.0 * an.w * an.w) - (al - a0) * (al - a0) / (2.0 * sl * sl));
  }
  for (int i = 0; i < MAXR; i++) {
    vec4 rp = uRip[i];
    if (rp.w <= 0.0) continue;
    float sg = 12.0 + rp.z * 40.0, rd = length(p - rp.xy);
    lift += rp.w * 0.6 * exp(-rd * rd / (2.0 * sg * sg)) * exp(-rp.z * 5.0);
  }
  disp += lift * body;
  return vec2(d, disp);
}

float sdButton(vec2 bd, float z) {
  float hh = 0.5 * (uBtnZ.x + uBtnZ.y), zc = 0.5 * (uBtnZ.x - uBtnZ.y) + uBtnZ2.x;
  float re = min(uBtnZ2.y, hh);
  vec2 w = vec2(bd.x + re, abs(z - zc) - hh + re);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - re - bd.y;
}
float sdSeg(vec3 p, vec4 a, vec4 b) {
  vec3 pa = p - a.xyz, ba = b.xyz - a.xyz;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h) - mix(a.w, b.w, h);
}
float sdEll(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-5); }

float map(vec3 p, vec2 bd, float h2, out float dB, out float dS, out float dH) {
  dB = sdButton(bd, p.z);
  float ds = 1e5;
  for (int s = 0; s < MAXS; s++) {
    if (s >= uNS) break;
    uint m = gMask[s];
    if (m == 0u) continue;
    float dd = 1e5;
    for (int j = 0; j < NP - 1; j++) {
      if ((m & (1u << uint(j))) == 0u) continue;
      dd = min(dd, sdSeg(p, uPts[s * NP + j], uPts[s * NP + j + 1]));
    }
    ds = smin(ds, dd, uK.x);
  }
  for (int b = 0; b < MAXBR; b++) {
    if (b >= uNBr) break;
    if (!gBr[b]) continue;
    vec4 a = uBr[b * 3], m = uBr[b * 3 + 1], c = uBr[b * 3 + 2];
    ds = smin(ds, min(sdSeg(p, a, m), sdSeg(p, m, c)), uK.x * 0.6);
  }
  for (int b = 0; b < MAXB; b++) {
    if (b >= uNB) break;
    if (!gBlob[b]) continue;
    vec4 bl = uBlob[b];
    ds = smin(ds, sdEll(p - bl.xyz, vec3(bl.w, bl.w, bl.w * uBlobZ[b])), uK.z);
  }
  for (int c = 0; c < MAXC; c++) {
    if (c >= uNC) break;
    uint m = gCMask[c];
    if (m == 0u) continue;
    for (int j = 0; j < WP - 1; j++) {
      if ((m & (1u << uint(j))) == 0u) continue;
      ds = smin(ds, sdSeg(p, uCoil[c * WP + j], uCoil[c * WP + j + 1]), 0.8);
    }
  }
  dH = 1e5;
  if (gHand) {
    dH = sdHand(h2, p.z, uHand2.w);
    if (uCoat.x > -uCoat.y) {
      float n = 0.6 * vnoise(p.xy * 0.075 + vec2(uTime * 0.55, -uTime * 0.35)) + 0.4 * vnoise(p.xy * 0.16 - vec2(uTime * 0.8, uTime * 0.45));
      float coat = clamp((uCoat.x - bd.x) / uCoat.y, 0.0, 1.0) * smoothstep(uCoat.z, uCoat.z + 0.12, n);
      if (coat > 0.0) {
        float sh = 2.8 * coat - 0.9;
        ds = smin(ds, sdHand(h2 - sh, p.z, uHand2.w + sh), 2.5);
      }
    }
  }
  dS = ds;
  float dg = smin(dB, ds, uK.y);
  if (!gHand) return dg;
  return smin(dg, dH, 1.2);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;

  for (int s = 0; s < MAXS; s++) {
    gMask[s] = 0u;
    if (s >= uNS) continue;
    vec4 bb = uBox[s];
    if (p.x < bb.x || p.y < bb.y || p.x > bb.z || p.y > bb.w) continue;
    uint m = 0u;
    for (int j = 0; j < NP - 1; j++) {
      vec4 a = uPts[s * NP + j], b = uPts[s * NP + j + 1];
      vec2 pa = p - a.xy, ba = b.xy - a.xy;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
      if (length(pa - ba * h) - max(a.w, b.w) < uK.y + 2.0) m |= (1u << uint(j));
    }
    gMask[s] = m;
  }
  for (int b = 0; b < MAXB; b++) {
    gBlob[b] = false;
    if (b >= uNB) continue;
    gBlob[b] = length(p - uBlob[b].xy) - uBlob[b].w < uK.y + uK.z + 2.0;
  }
  for (int b = 0; b < MAXBR; b++) {
    gBr[b] = false;
    if (b >= uNBr) continue;
    vec2 lo = min(min(uBr[b * 3].xy, uBr[b * 3 + 1].xy), uBr[b * 3 + 2].xy) - uK.x - 3.0;
    vec2 hi = max(max(uBr[b * 3].xy, uBr[b * 3 + 1].xy), uBr[b * 3 + 2].xy) + uK.x + 3.0;
    gBr[b] = all(greaterThan(p, lo)) && all(lessThan(p, hi));
  }
  for (int c = 0; c < MAXC; c++) {
    gCMask[c] = 0u;
    if (c >= uNC) continue;
    vec4 bb = uCBox[c];
    if (p.x < bb.x || p.y < bb.y || p.x > bb.z || p.y > bb.w) continue;
    uint m = 0u;
    for (int j = 0; j < WP - 1; j++) {
      vec4 a = uCoil[c * WP + j], b = uCoil[c * WP + j + 1];
      vec2 pa = p - a.xy, ba = b.xy - a.xy;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
      if (length(pa - ba * h) - max(a.w, b.w) < uK.y + 2.0) m |= (1u << uint(j));
    }
    gCMask[c] = m;
  }
  vec2 hc = uHand.xy + mat2(uHand2.x, uHand2.y, -uHand2.y, uHand2.x) * (vec2(4.0, 9.0) * uHand.z);
  gHand = uHand.w > 0.5 && length(p - hc) < 17.5 * uHand.z + 4.0;

  vec2 bd = button2D(p);
  float h2 = gHand ? hand2D(p) : 1e5;
  float z = uZTop, minD = 1e5, dB, dS, dH;
  bool hit = false;
  for (int i = 0; i < 64; i++) {
    float d = map(vec3(p, z), bd, h2, dB, dS, dH);
    minD = min(minD, d);
    if (d < 0.02) { hit = true; break; }
    z -= max(d * 0.8, 0.01);
    if (z < 0.0) break;
  }
  if (!hit) {
#ifdef ENC8
    outG = vec4(clamp(minD / 4.0, 0.0, 1.0), 0.0, 0.0, 0.0);
#else
    outG = vec4(minD, 0.0, 0.0, 0.0);
#endif
    return;
  }

  vec3 pos = vec3(p, z);
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.3;
  float t0, t1, t2;
  vec3 n = k.xyy * map(pos + k.xyy * e, button2D(pos.xy + k.xy * e), gHand ? hand2D(pos.xy + k.xy * e) : 1e5, t0, t1, t2)
         + k.yyx * map(pos + k.yyx * e, button2D(pos.xy + k.yy * e), gHand ? hand2D(pos.xy + k.yy * e) : 1e5, t0, t1, t2)
         + k.yxy * map(pos + k.yxy * e, button2D(pos.xy + k.yx * e), gHand ? hand2D(pos.xy + k.yx * e) : 1e5, t0, t1, t2)
         + k.xxx * map(pos + k.xxx * e, button2D(pos.xy + k.xx * e), gHand ? hand2D(pos.xy + k.xx * e) : 1e5, t0, t1, t2);
  n = normalize(n);
  float mat = dH < min(dB, dS) - 0.05 ? 3.0 : 1.0 + smoothstep(-1.5, 1.5, dB - dS);
#ifdef ENC8
  outG = vec4(n.xy * 0.5 + 0.5, z / 128.0, mat * 0.25);
#else
  outG = vec4(n.xy, z, mat);
#endif
}`;

/** Pass 2: studio shading, heightfield soft shadows, AO, label, tone map; floor → shadow alpha. */
export const shadeFrag = (float: boolean) => `#version 300 es
precision highp float;
${float ? "" : "#define ENC8 1"}
uniform sampler2D uG;
uniform sampler2D uLabel;
uniform vec2 uRes;
uniform float uDpr;
uniform float uTime;
uniform vec4 uLabelBox;
uniform vec2 uLabelTx;
uniform float uLabelAmt;
uniform float uLabelLod;
uniform float uIri;
uniform float uZMax;
uniform float uLift;
uniform vec4 uBtnP;
uniform float uBtnR;
uniform vec2 uWin;
uniform vec2 uBtnH;
uniform sampler2D uHandCol;
uniform sampler2D uArrowCol;
uniform float uMorph;
uniform vec4 uHand;
uniform vec4 uHand2;
uniform vec3 uAlb;       // body albedo (linear)
uniform vec3 uTint;      // rim / sheen tint (linear, normalised)
uniform vec3 uSilver;    // label colour (linear)
uniform float uFloorK;   // how much the floor bounces light into the goo (white floor 1, dark floor ~0.2)
uniform float uShadowA;  // strength of the shadow drawn on the page
uniform vec3 uShadowC;   // shadow colour (display space)
uniform vec4 uRim;       // coloured fresnel edge (linear rgb, strength): keeps black goo readable on dark pages
out vec4 outC;

vec3 KEY;

vec4 dec(vec4 g) {
#ifdef ENC8
  if (g.a < 0.1) return vec4(g.r * 4.0, 0.0, 0.0, 0.0);
  return vec4(g.rg * 2.0 - 1.0, g.b * 128.0, g.a * 4.0);
#else
  return g;
#endif
}
float decH(vec4 g) {
#ifdef ENC8
  return g.b * 128.0;
#else
  return g.b;
#endif
}
vec2 uvOf(vec2 p) { return vec2(p.x * uDpr / uRes.x, 1.0 - p.y * uDpr / uRes.y); }
vec4 gAt(ivec2 c) { return dec(texelFetch(uG, clamp(c, ivec2(0), ivec2(uRes) - 1), 0)); }
float hAt(vec2 p, float lod) { return decH(textureLod(uG, uvOf(p), lod)); }
${NOISE}

float softShadow(vec2 p, float h0) {
  vec2 L2 = normalize(KEY.xy);
  float tanE = KEY.z / length(KEY.xy);
  float res = 1.0, s = 1.0;
  for (int i = 0; i < 28; i++) {
    float zr = h0 + s * tanE;
    if (zr > uZMax) break;
    float hgt = hAt(p + L2 * s, log2(1.0 + s * 0.08 * uDpr));
    res = min(res, (1.5 - 0.7 * uLift) * (zr - hgt) / s);
    if (res < -0.2) break;
    s += 0.8 + s * 0.14;
  }
  res = clamp(res, 0.0, 1.0);
  return res * res * (3.0 - 2.0 * res);
}
float occlusion(vec2 p, float h) {
  vec2 uv = uvOf(p);
  float o = 0.0;
  o += 0.50 * clamp((decH(textureLod(uG, uv, log2(6.0 * uDpr))) - h) / 9.0, 0.0, 1.0);
  o += 0.32 * clamp((decH(textureLod(uG, uv, log2(20.0 * uDpr))) - h) / 26.0, 0.0, 1.0);
  o += 0.26 * clamp((decH(textureLod(uG, uv, log2(60.0 * uDpr))) - h) / 60.0, 0.0, 1.0);
  return clamp(1.0 - o, 0.0, 1.0);
}
// 0 far from everything, 1 near something tall: a soft weight instead of an on/off test, so the
// cast shadow never ends in a visible seam on the page
float nearW(vec2 p) {
  float l = log2(96.0 * uDpr);
  float m = max(max(hAt(p + vec2(48.0, 48.0), l), hAt(p + vec2(-48.0, 48.0), l)),
                max(hAt(p + vec2(48.0, -48.0), l), hAt(p + vec2(-48.0, -48.0), l)));
  return smoothstep(0.02, 1.5, max(m, hAt(p, l)));
}

float softbox(vec3 R, vec3 c, vec2 size, float edge) {
  float cd = dot(R, c);
  if (cd <= 0.0) return 0.0;
  vec3 t1 = normalize(cross(c, vec3(0.0, 0.0, 1.0)));
  vec3 t2 = cross(t1, c);
  vec2 q = abs(vec2(dot(R, t1), dot(R, t2)) / cd) / size;
  return (1.0 - smoothstep(edge, 1.0, q.x)) * (1.0 - smoothstep(edge, 1.0, q.y)) * (0.85 + 0.15 * (1.0 - q.y));
}
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
// a living room up and to the left: window, sky, tree line, warm wall, a lamp
vec3 room(vec3 R) {
  vec3 c = normalize(vec3(-0.34, -0.42, 0.84));
  float cd = dot(R, c);
  if (cd <= 0.2) return vec3(0.0);
  vec3 t1 = normalize(cross(c, vec3(0.0, 0.0, 1.0)));
  vec3 t2 = cross(t1, c);
  vec2 w = vec2(dot(R, t1), dot(R, t2)) / cd / vec2(0.34, 0.28);
  float wallMask = 1.0 - smoothstep(1.3, 2.3, length(w * vec2(0.8, 1.0)));
  vec3 col = vec3(0.92, 0.78, 0.6) * 0.3 * wallMask;
  float shelf = smoothstep(-2.3, -2.2, w.y) * (1.0 - smoothstep(-1.35, -1.25, w.y));
  col = mix(col, vec3(0.3, 0.18, 0.1) * 0.5, shelf * wallMask);
  vec2 lp = w - vec2(1.75, -0.55);
  col += vec3(1.0, 0.7, 0.4) * 5.0 * exp(-dot(lp, lp) / 0.05);
  vec2 aw = abs(w);
  float glass = (1.0 - smoothstep(0.94, 1.0, aw.x)) * (1.0 - smoothstep(0.94, 1.0, aw.y));
  if (glass > 0.0) {
    float v = w.y * 0.5 + 0.5;
    vec3 sky = mix(vec3(1.0, 0.92, 0.8), vec3(0.6, 0.76, 1.0), smoothstep(0.2, 1.0, v)) * 16.0;
    float line = 0.3 + 0.16 * vn(vec2(w.x * 4.0, 3.1)) + 0.07 * vn(vec2(w.x * 11.0, 7.3));
    float tree = 1.0 - smoothstep(line - 0.03, line + 0.03, v);
    vec3 green = mix(vec3(0.16, 0.3, 0.12), vec3(0.32, 0.45, 0.2), vn(w * 9.0)) * 3.0;
    vec3 view = mix(sky, green, tree);
    float mull = max(1.0 - smoothstep(0.025, 0.05, aw.x), 1.0 - smoothstep(0.025, 0.05, abs(w.y - 0.1)));
    view = mix(view, vec3(0.85, 0.8, 0.72) * 0.6, mull);
    col = mix(col, view, glass);
  }
  return col;
}
// black-product studio: only shaped sources reflect, so the body stays jet black
vec3 env(vec3 R) {
  vec2 rd = normalize(R.xy + vec2(1e-5));
  float keySide = 0.5 + 0.5 * dot(rd, normalize(KEY.xy));
  if (R.z < 0.0) return mix(vec3(0.14 * uFloorK) * keySide, vec3(0.0015), smoothstep(0.0, -0.22, R.z));
  vec3 c = vec3(0.0015);
  c += room(R);
  c += uTint * 7.0 * softbox(R, normalize(vec3(-0.96, 0.08, 0.2)), vec2(0.75, 0.035), 0.7);
  c += uTint * 5.0 * softbox(R, normalize(vec3(0.95, -0.12, 0.24)), vec2(0.75, 0.035), 0.7);
  c += vec3(1.0) * 5.0 * softbox(R, normalize(vec3(0.45, 0.55, 0.75)), vec2(0.07, 0.07), 0.5);
  c += vec3(0.1) * softbox(R, normalize(vec3(0.12, 0.25, 1.0)), vec2(0.8, 0.55), 0.2);
  float wall = 1.0 - smoothstep(0.0, 0.1, R.z);
  c += vec3(0.28 * uFloorK) * wall * wall * keySide * keySide * keySide;
  return c;
}

// the label: a flat layer of polished metal on top of the goo, shaded on its own
vec3 shadeLabel(vec2 lu, float sh, float ao) {
  vec2 tx = uLabelTx;
  float mx = textureLod(uLabel, lu + vec2(tx.x, 0.0), uLabelLod).a - textureLod(uLabel, lu - vec2(tx.x, 0.0), uLabelLod).a;
  float my = textureLod(uLabel, lu + vec2(0.0, tx.y), uLabelLod).a - textureLod(uLabel, lu - vec2(0.0, tx.y), uLabelLod).a;
  vec3 N = normalize(vec3(-mx * 1.1, -my * 1.1, 1.0));
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), N);
  float t = clamp((lu.y - 0.32) / 0.36, 0.0, 1.0);
  float grad = t < 0.48 ? mix(1.12, 0.74, smoothstep(0.0, 0.48, t)) : mix(0.6, 0.95, smoothstep(0.5, 1.0, t));
  vec3 col = uSilver * grad * (0.82 + 0.18 * sh);
  col += env(R) * uSilver * 0.3;
  float edge = clamp(length(vec2(mx, my)) * 1.6, 0.0, 1.0);
  float facing = dot(normalize(vec2(mx, my) + 1e-5), normalize(KEY.xy));
  col *= 1.0 - 0.25 * edge * smoothstep(0.0, 0.8, -facing);
  col += vec3(1.0) * 0.55 * edge * smoothstep(0.1, 0.9, facing);
  vec3 Hh = normalize(KEY + vec3(0.0, 0.0, 1.0));
  float NdH = max(dot(N, Hh), 0.0), a2 = 0.01;
  col += vec3(1.0) * a2 / (3.14159 * pow(NdH * NdH * (a2 - 1.0) + 1.0, 2.0)) * 0.05 * sh;
  return col * mix(0.85, 1.0, ao);
}

vec3 faceWindow(vec2 b) {
  vec2 w = vec2((b.x - uWin.x + b.y * 0.08) / uWin.y, (b.y + 0.3) / 1.15);
  float fade = 1.0 - smoothstep(0.2, 1.05, length(w * vec2(0.85, 0.8)));
  if (fade <= 0.0) return vec3(0.0);
  float v = 0.5 - 0.5 * w.y;
  vec3 sky = mix(vec3(0.95, 0.88, 0.8), vec3(0.66, 0.78, 0.96), smoothstep(0.2, 1.0, v));
  float line = 0.36 + 0.1 * vn(vec2(w.x * 1.6, 2.0));
  float tree = 1.0 - smoothstep(line - 0.2, line + 0.2, v);
  vec3 view = mix(sky, vec3(0.24, 0.36, 0.18) * 0.65, tree * 0.85);
  float sash = 1.0 - smoothstep(0.04, 0.26, abs(w.y + 0.1));
  float stile = 1.0 - smoothstep(0.05, 0.3, abs(w.x));
  view *= 1.0 - 0.5 * max(sash, stile * 0.6);
  return view * 0.14 * fade;
}

vec3 shadeGoo(vec2 p, vec4 g) {
  vec3 N = vec3(g.xy, sqrt(max(1e-4, 1.0 - dot(g.xy, g.xy))));
  float strandness = clamp(g.w - 1.0, 0.0, 1.0);
  vec3 V = vec3(0.0, 0.0, 1.0);
  float NdV = clamp(N.z, 0.03, 1.0);
  vec3 R = reflect(-V, N);
  float F = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
  float sh = softShadow(p, g.z + 0.6);
  float ao = occlusion(p, g.z);

  vec3 dN = vec3(N.xy, 0.0) * 0.07 + vec3(0.012, 0.008, 0.0);
  vec3 spec = vec3(env(normalize(R + dN)).r, env(R).g, env(normalize(R - dN)).b) * F * mix(0.5, 1.0, min(sh, ao));
  float fr = pow(1.0 - NdV, 2.0);
  vec3 film = mix(vec3(0.8, 0.88, 1.12), vec3(0.9, 0.86, 1.1), 0.5 + 0.5 * sin((1.0 - NdV) * 9.0)) * mix(vec3(1.0), uTint, 0.5);
  spec *= mix(vec3(1.0), film, uIri * fr);
  vec3 Hh = normalize(KEY + V);
  float NdH = max(dot(N, Hh), 0.0), a2 = 0.0025;
  float D = a2 / (3.14159 * pow(NdH * NdH * (a2 - 1.0) + 1.0, 2.0));
  spec += vec3(0.9, 0.95, 1.0) * D * F * 0.55 * sh;

  // the face is matte rubber, the tendrils glossy goo
  float matte = (1.0 - strandness) * 0.92;
  float ar2 = 0.16;
  float Dr = ar2 / (3.14159 * pow(NdH * NdH * (ar2 - 1.0) + 1.0, 2.0));
  vec3 cRoom = normalize(vec3(-0.34, -0.42, 0.84));
  vec3 rough = vec3(1.0) * Dr * F * 0.06 * sh + vec3(0.95, 0.9, 0.84) * pow(max(dot(R, cRoom), 0.0), 10.0) * F * 0.9;
  spec = mix(spec, rough, matte);

  vec3 diff = uAlb * (1.8 * max(dot(N, KEY), 0.0) * sh + 0.9 * ao);
  vec3 col = diff + spec;

  vec2 bq = (p - uBtnP.xy) / uBtnP.zw + N.xy * 1.6;
  vec2 dsp = normalize(bq - vec2(uWin.x, -0.3) + 1e-4) * 0.02;
  vec3 win = vec3(faceWindow(bq + dsp).r, faceWindow(bq).g, faceWindow(bq - dsp).b);
  col += win * matte * mix(0.6, 1.0, ao);

  float bevel = 1.0 - smoothstep(0.3, 0.86, N.z);
  vec2 nd = normalize(N.xy + 1e-5);
  float rimL = pow(max(dot(nd, vec2(-0.6, -0.8)), 0.0), 2.0);
  float rimR = pow(max(dot(nd, vec2(0.8, 0.6)), 0.0), 3.0) * 0.55;
  vec2 cq = (p - uBtnP.xy) / uBtnP.zw;
  float glint = pow(0.5 + 0.5 * cos(atan(cq.y, cq.x) - uTime * 0.9), 28.0);
  vec3 rimC = vec3(0.82, 0.9, 1.0) * uTint * rimL + vec3(1.0, 0.94, 0.86) * rimR + vec3(1.0) * glint * 1.4;
  col += rimC * bevel * 0.5 * (1.0 - strandness) * mix(0.7, 1.0, sh);
  col += uRim.rgb * uRim.a * pow(1.0 - NdV, 2.2) * mix(0.55, 1.0, strandness);

  if (uLabelAmt > 0.0) {
    vec2 lu = (p - uLabelBox.xy) / (2.0 * uLabelBox.zw) + 0.5;
    if (lu.x > 0.0 && lu.y > 0.0 && lu.x < 1.0 && lu.y < 1.0) {
      float m = textureLod(uLabel, lu, uLabelLod).a * (1.0 - smoothstep(0.15, 0.5, strandness)) * uLabelAmt;
      if (m > 0.002) col = mix(col, shadeLabel(lu, sh, ao), m);
    }
  }
  return col;
}

vec3 shadeHand(vec2 p, vec4 g) {
  vec3 N = vec3(g.xy, sqrt(max(1e-4, 1.0 - dot(g.xy, g.xy))));
  vec2 d = p - uHand.xy;
  vec2 r = vec2(uHand2.x * d.x + uHand2.y * d.y, -uHand2.y * d.x + uHand2.x * d.y) / uHand.z;
  vec4 tc = mix(textureLod(uArrowCol, clamp((r + vec2(6.1, 0.9)) / 24.0, 0.0, 1.0), 0.0),
                textureLod(uHandCol, clamp((r + vec2(8.0, 3.0)) / 24.0, 0.0, 1.0), 0.0), uMorph);
  vec3 alb = pow(mix(vec3(0.0), tc.rgb, smoothstep(0.2, 0.8, tc.a)), vec3(2.2)) * 0.86 + 0.012;
  float sh = softShadow(p, g.z + 0.6);
  float ao = occlusion(p, g.z);
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), N);
  float F = 0.04 + 0.96 * pow(1.0 - clamp(N.z, 0.03, 1.0), 5.0);
  vec3 Hh = normalize(KEY + vec3(0.0, 0.0, 1.0));
  float NdH = max(dot(N, Hh), 0.0), a2 = 0.004;
  float D = a2 / (3.14159 * pow(NdH * NdH * (a2 - 1.0) + 1.0, 2.0));
  return alb * (1.2 * max(dot(N, KEY), 0.0) * sh + 0.9 * ao) + env(R) * F * 1.15 * mix(0.6, 1.0, sh) + vec3(0.95) * D * F * 0.5 * sh;
}
vec3 shadeAny(vec2 p, vec4 g) { return g.w > 2.5 ? shadeHand(p, g) : shadeGoo(p, g); }

float sdRect(vec2 q, vec2 b, float r) {
  r = min(r, min(b.x, b.y));
  vec2 dd = abs(q) - (b - r);
  return length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0) - r;
}
// layered product-shot shadow: contact crease, near occlusion, soft key shadow, ambient fade
float buttonShadow(vec2 p) {
  vec2 q = p - uBtnP.xy;
  float d0 = max(sdRect(q, uBtnP.zw, uBtnR), 0.0);
  float lift = uBtnH.y, h = uBtnH.x + lift;
  vec2 off = -normalize(KEY.xy) * (h * 0.38 + lift * 0.45);
  float d1 = max(sdRect(q - off, uBtnP.zw - vec2(1.0), uBtnR - 1.0), 0.0);
  float grounded = 1.0 - smoothstep(0.0, 12.0, lift);
  float contact = exp(-d0 / (2.2 + lift * 0.4)) * 0.62 * grounded;
  float occl = exp(-d0 / 7.0) * 0.3 * mix(0.45, 1.0, grounded);
  float dropSh = exp(-d1 / (8.0 + h * 0.25 + lift * 0.6)) * (0.34 - 0.08 * (1.0 - grounded));
  float ambient = exp(-d0 / 34.0) * 0.12;
  float lit = (1.0 - contact) * (1.0 - occl) * (1.0 - dropSh) * (1.0 - ambient);
  return clamp(1.0 - lit, 0.0, 0.88);
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 tone(vec3 c) { return pow(aces(c * 0.95), vec3(1.0 / 2.2)); }
float toneL(float c) { return tone(vec3(c)).g; }

// the page is the floor: light it like the original's white studio floor, tone map it, and keep only
// how much darker than the unshadowed floor it came out (premultiplied shadow colour + alpha), so the
// highlight roll-off softens shadows exactly as on the white floor
vec4 floorShade(vec2 p) {
  float sh = 1.0, ao = 1.0, w = nearW(p);
  if (w > 0.0) {
    sh = mix(1.0, softShadow(p, 0.0), w);
    ao = mix(1.0, mix(occlusion(p, 0.0), 1.0, 0.55 * uLift), w);
  }
  float k = 1.3 * KEY.z, alb = 0.86;
  float lit = alb * (k * sh + 1.2 * ao) * (1.0 - buttonShadow(p) * 0.94);
  float a = clamp(1.0 - toneL(lit) / toneL(alb * (k + 1.2)), 0.0, 1.0) * uShadowA;
  return vec4(uShadowC * a, a);
}

void main() {
  KEY = normalize(vec3(-0.45, -0.56, 0.74));
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec4 g = gAt(c);
  vec4 o;
  if (g.w < 0.5) {
    o = floorShade(p);
    // analytic edge coverage from the closest approach of the ray (keeps hair-thin strands visible)
    float cov = clamp(0.5 - g.x * uDpr, 0.0, 1.0);
    if (cov > 0.0) {
      vec4 n0 = gAt(c + ivec2(1, 0)), n1 = gAt(c - ivec2(1, 0)), n2 = gAt(c + ivec2(0, 1)), n3 = gAt(c - ivec2(0, 1));
      vec4 gn = n0.w > 0.5 ? n0 : n1.w > 0.5 ? n1 : n2.w > 0.5 ? n2 : n3.w > 0.5 ? n3 : vec4(0.0);
      vec3 gc = tone(gn.w > 0.5 ? shadeAny(p, gn) : uAlb * 3.0 + 0.004);
      o = o * (1.0 - cov) + vec4(gc, 1.0) * cov;
    }
  } else {
    o = vec4(tone(shadeAny(p, g)), 1.0);
  }
  o.rgb += (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0 * o.a;
  outC = o;
}`;

/** Pass 3: FXAA on premultiplied colour, alpha carried along. */
export const FXAA = `#version 300 es
precision highp float;
uniform sampler2D uC;
uniform vec2 uRes;
out vec4 outC;
float luma(vec4 c) { return dot(c.rgb, vec3(0.299, 0.587, 0.114)) + (1.0 - c.a) * 0.5; }
void main() {
  vec2 px = 1.0 / uRes, uv = gl_FragCoord.xy * px;
  vec4 cM = texture(uC, uv);
  float lNW = luma(texture(uC, uv + vec2(-1.0, -1.0) * px)), lNE = luma(texture(uC, uv + vec2(1.0, -1.0) * px));
  float lSW = luma(texture(uC, uv + vec2(-1.0, 1.0) * px)), lSE = luma(texture(uC, uv + vec2(1.0, 1.0) * px));
  float lM = luma(cM);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.03, lMax * 0.08)) { outC = cM; return; }
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), -8.0, 8.0) * px;
  vec4 A = 0.5 * (texture(uC, uv - dir / 6.0) + texture(uC, uv + dir / 6.0));
  vec4 B = A * 0.5 + 0.25 * (texture(uC, uv - dir * 0.5) + texture(uC, uv + dir * 0.5));
  float lB = luma(B);
  outC = (lB < lMin || lB > lMax) ? A : B;
}`;
