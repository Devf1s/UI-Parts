import { describe, expect, it } from "vitest";
import { createProgram, hexToRgb, programsReady } from "./gl";

describe("hexToRgb", () => {
  it("parses long and short hex", () => {
    expect(hexToRgb("#ff0000")).toEqual([1, 0, 0]);
    expect(hexToRgb("#0f0")).toEqual([0, 1, 0]);
    expect(hexToRgb(" 000080 ")[2]).toBeCloseTo(128 / 255);
  });
  it("returns black for anything else", () => {
    expect(hexToRgb("tomato")).toEqual([0, 0, 0]);
    expect(hexToRgb("#12")).toEqual([0, 0, 0]);
  });
});

/** Just enough of a WebGL2 context to drive program creation: the driver finishes on `finish()`. */
function fakeGL({ parallel = true, linkOk = true } = {}) {
  const COMPLETION_STATUS_KHR = 0x91b1;
  let done = false;
  const calls: string[] = [];
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    LINK_STATUS: 3,
    createProgram: () => ({}),
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    attachShader: () => {},
    linkProgram: () => {},
    deleteShader: () => calls.push("deleteShader"),
    isContextLost: () => false,
    getExtension: (name: string) => (parallel && name === "KHR_parallel_shader_compile" ? { COMPLETION_STATUS_KHR } : null),
    getProgramParameter: (_p: unknown, pname: number) => {
      calls.push(pname === COMPLETION_STATUS_KHR ? "poll" : "status");
      return pname === COMPLETION_STATUS_KHR ? done : linkOk;
    },
    getShaderInfoLog: () => "ERROR: 0:1: 'x' : undeclared identifier",
    getProgramInfoLog: () => "",
    getUniformLocation: (_p: unknown, name: string) => {
      calls.push(`uniform ${name}`);
      return { name };
    },
  };
  return { gl: gl as unknown as WebGL2RenderingContext, calls, finish: () => (done = true) };
}

describe("createProgram / programsReady", () => {
  it("never waits for the driver while it compiles in the background", () => {
    const { gl, calls, finish } = fakeGL();
    const { u } = createProgram(gl, "vs", "fs", ["uTime"] as const);
    expect(calls).toEqual([]); // no status or uniform queries at creation
    expect(programsReady(gl)).toBe(false);
    expect(calls).toEqual(["poll"]);
    finish();
    expect(programsReady(gl)).toBe(true);
    expect(calls).toContain("status");
    expect(calls.filter((c) => c === "deleteShader")).toHaveLength(2);
    // uniforms are looked up once, on first use
    expect(u.uTime).toEqual({ name: "uTime" });
    expect(u.uTime).toBe(u.uTime);
    expect(calls.filter((c) => c === "uniform uTime")).toHaveLength(1);
    // nothing left to check afterwards
    expect(programsReady(gl)).toBe(true);
  });

  it("checks the link status directly without the extension", () => {
    const { gl } = fakeGL({ parallel: false });
    createProgram(gl, "vs", "fs", []);
    expect(programsReady(gl)).toBe(true);
  });

  it("throws the compiler log when a program fails", () => {
    const { gl, finish } = fakeGL({ linkOk: false });
    createProgram(gl, "vs", "fs", []);
    finish();
    expect(() => programsReady(gl)).toThrow(/undeclared identifier/);
  });
});
