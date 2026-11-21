/**
 * Small WebGL2 toolkit shared by the portfolio scenes: context creation with a software-renderer
 * check, non-blocking program compilation with readable errors, uniform lookup and CSS colour parsing.
 */

export type RGB = [number, number, number];

/** Software rasterisers (SwiftShader, llvmpipe, WARP…) draw on the CPU. */
export function isSoftwareGL(gl: WebGL2RenderingContext) {
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  return /swiftshader|llvmpipe|softpipe|software|basic render|warp/i.test(name);
}

export function createGL(canvas: HTMLCanvasElement, opts: WebGLContextAttributes = {}) {
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: "default",
      ...opts,
    });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  // lets `programsReady` ask whether the driver has finished compiling without waiting for it
  gl.getExtension("KHR_parallel_shader_compile");
  return { gl, software: isSoftwareGL(gl) };
}

function shader(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader failed");
  gl.shaderSource(sh, src.trim());
  gl.compileShader(sh);
  return sh;
}

export type Program<U extends string> = { prog: WebGLProgram; u: Record<U, WebGLUniformLocation | null> };

type Pending = { prog: WebGLProgram; shaders: WebGLShader[] };
const pending = new WeakMap<WebGL2RenderingContext, Pending[]>();

/**
 * Starts compiling and linking a program and returns at once. Nothing here waits for the driver:
 * uniform locations are looked up the first time they are read, and `programsReady` reports when
 * every program of a context can be used (and throws the compiler log if one failed).
 */
export function createProgram<U extends string>(gl: WebGL2RenderingContext, vs: string, fs: string, uniforms: readonly U[]): Program<U> {
  const prog = gl.createProgram();
  if (!prog) throw new Error("createProgram failed");
  const shaders = [shader(gl, gl.VERTEX_SHADER, vs), shader(gl, gl.FRAGMENT_SHADER, fs)];
  for (const sh of shaders) gl.attachShader(prog, sh);
  gl.linkProgram(prog);
  const list = pending.get(gl) ?? [];
  list.push({ prog, shaders });
  pending.set(gl, list);
  const u = {} as Record<U, WebGLUniformLocation | null>;
  for (const name of uniforms) {
    let loc: WebGLUniformLocation | null | undefined;
    Object.defineProperty(u, name, { enumerable: true, get: () => (loc === undefined ? (loc = gl.getUniformLocation(prog, name)) : loc) });
  }
  return { prog, u };
}

/**
 * True once every program created on `gl` has compiled and linked. With KHR_parallel_shader_compile
 * the driver compiles in the background and this only polls, so a page never stalls on a shader;
 * without it the first call waits for the compiler, as plain WebGL always does. Throws on failure.
 */
export function programsReady(gl: WebGL2RenderingContext) {
  const list = pending.get(gl);
  if (!list?.length) return true;
  if (gl.isContextLost()) return false;
  const ext = gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null;
  if (ext && list.some((p) => !gl.getProgramParameter(p.prog, ext.COMPLETION_STATUS_KHR))) return false;
  pending.delete(gl);
  for (const { prog, shaders } of list) {
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = shaders.map((sh) => gl.getShaderInfoLog(sh)).filter(Boolean).join("\n") || gl.getProgramInfoLog(prog);
      throw new Error(`shader: ${log}`);
    }
    for (const sh of shaders) gl.deleteShader(sh);
  }
  return true;
}

/** A triangle that covers the viewport, drawn with `drawArrays(TRIANGLES, 0, 3)` and no buffers. */
export const FULLSCREEN_VS = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * A grid of `cols × rows` quads over 0…1, as an indexed triangle list. Vertex shaders bend it.
 * Returns the VAO and the index count; attribute 0 is the uv.
 */
export function createGrid(gl: WebGL2RenderingContext, cols: number, rows: number) {
  const verts = new Float32Array((cols + 1) * (rows + 1) * 2);
  let k = 0;
  for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) {
    verts[k++] = x / cols;
    verts[k++] = y / rows;
  }
  const idx = new Uint16Array(cols * rows * 6);
  k = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const a = y * (cols + 1) + x, b = a + 1, c = a + cols + 1, d = c + 1;
    idx.set([a, c, b, b, c, d], k);
    k += 6;
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: idx.length, dispose: () => [vb, ib].forEach((b) => gl.deleteBuffer(b)) };
}

let probe: CanvasRenderingContext2D | null = null;

/** Any CSS colour → sRGB 0…1 (alpha dropped). Returns `fallback` if it does not parse. */
export function cssColor(css: string, fallback: RGB = [0, 0, 0]): RGB {
  if (typeof document === "undefined") return fallback;
  probe ??= document.createElement("canvas").getContext("2d");
  const value = css.trim();
  if (!probe || !value) return fallback;
  probe.fillStyle = "#010203";
  probe.fillStyle = value;
  const v = String(probe.fillStyle);
  if (v === "#010203" && value !== "#010203") return fallback;
  if (v[0] === "#") return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16) / 255) as RGB;
  const m = v.match(/[\d.]+/g);
  return m && m.length >= 3 ? (m.slice(0, 3).map((n) => Number(n) / 255) as RGB) : fallback;
}

/** Reads a CSS custom property from an element (or <html>) as a colour. */
export function cssVarColor(name: string, el?: Element | null, fallback?: RGB) {
  if (typeof document === "undefined") return fallback ?? [0, 0, 0];
  return cssColor(getComputedStyle(el ?? document.documentElement).getPropertyValue(name), fallback);
}

/** "#rgb" / "#rrggbb" → sRGB 0…1. Pure, so it also works on the server and in unit tests. */
export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return [0, 0, 0];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
}
