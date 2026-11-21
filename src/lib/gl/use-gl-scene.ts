"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createGL, programsReady } from "./gl";

/**
 * "full": ambient animation runs while the canvas is on screen.
 * "static": one frame, redrawn on resize / theme / state change; short bursts on interaction.
 *   Used on software rasterisers (no GPU) so an idle page costs nothing there.
 */
export type GLQuality = "full" | "static";

export type SceneEnv = {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  quality: GLQuality;
  /** false when the user asked for reduced motion: draw still frames only. */
  motion: boolean;
};

export type Scene = {
  /** Draws one frame. Return true while something is still settling to get another frame. */
  frame(t: number, dt: number): boolean | void;
  /** Canvas size in CSS px and the pixel scale it is drawn at. */
  resize?(width: number, height: number, scale: number): void;
  /** Theme changed: re-read CSS colours. */
  theme?(): void;
  dispose?(): void;
};

export type SceneOptions = {
  /** Keep drawing every frame while on screen (only in "full" quality with motion allowed). */
  ambient?: boolean;
  /** Cap on devicePixelRatio. */
  maxDpr?: number;
  /** Extra resolution scale, e.g. 0.5 for soft full-screen shaders. */
  scale?: number;
  /** Element whose visibility gates the loop (defaults to the canvas). */
  observe?: RefObject<Element | null>;
  /** Scene time of the single frame drawn in "static" quality, s. */
  stillTime?: number;
  attributes?: WebGLContextAttributes;
  /** false: don't create anything yet (e.g. until the scene is first needed). Default true. */
  enabled?: boolean;
};

export type SceneStatus = "pending" | "on" | "off";

export type SceneControl<S extends Scene> = {
  scene: RefObject<S | null>;
  /** Animate for `ms` (interaction). Ignored with reduced motion, which only redraws once. */
  wake(ms?: number): void;
  /** Draw one more frame (state changed). */
  invalidate(): void;
};

/** Test / preview hook: `window.__PF_GL__ = "force"` animates even on a software rasteriser, "off" disables WebGL. */
const flag = () => (window as unknown as { __PF_GL__?: string }).__PF_GL__;

export type DebugHandle = {
  quality: GLQuality;
  frames: number;
  running(): boolean;
  /** Draws the frame at scene time `t` synchronously (deterministic captures). */
  renderAt(t: number): void;
  /** Advances the scene by `dt` seconds and draws, synchronously (frame-by-frame recording). */
  step(dt: number): void;
  pause(on: boolean): void;
};

/**
 * Runs a WebGL2 scene on a canvas with the lifecycle every portfolio scene needs: lazy start, DPR-
 * aware resize, one rAF loop that sleeps off-screen, in background tabs and whenever nothing moves,
 * theme changes, reduced motion, context loss, and a CSS fallback (status "off") when WebGL2 is
 * missing or a shader fails. Shaders compile in the background: the first frame is drawn once
 * they are ready, so creating a scene never blocks the page.
 */
export function useGLScene<S extends Scene>(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  create: (env: SceneEnv) => S,
  options: SceneOptions = {},
): [SceneStatus, SceneControl<S>] {
  const [status, setStatus] = useState<SceneStatus>("pending");
  const sceneRef = useRef<S | null>(null);
  const createRef = useRef(create);
  const optsRef = useRef(options);
  useEffect(() => {
    createRef.current = create;
    optsRef.current = options;
  });

  const ctl = useRef({ wake: (ms?: number) => void ms, invalidate: () => {} });
  const enabled = options.enabled ?? true;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;
    const c = ctl.current;
    const opts = optsRef.current;
    const mode = flag();
    // status changes are reported asynchronously, like any other external event
    let disposed = false;
    const report = (s: SceneStatus) => queueMicrotask(() => !disposed && setStatus(s));
    if (mode === "off") {
      report("off");
      return () => void (disposed = true);
    }
    const made = createGL(canvas, opts.attributes);
    if (!made) {
      report("off");
      return () => void (disposed = true);
    }
    const { gl, software } = made;
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let motion = !reducedQuery.matches;
    const quality: GLQuality = mode === "force" ? "full" : software ? "static" : "full";

    let scene: S;
    try {
      scene = createRef.current({ gl, canvas, quality, motion });
    } catch (err) {
      console.warn("[webgl] scene disabled:", err);
      report("off");
      return () => void (disposed = true);
    }
    sceneRef.current = scene;

    let raf = 0;
    let last = 0;
    let t = quality === "full" && motion ? 0 : (opts.stillTime ?? 2);
    let onScreen = true;
    let paused = false;
    let wakeUntil = 0;
    let shown = false;
    let lost = false;
    let compiled = false;
    let width = 0, height = 0;
    const debug: DebugHandle = {
      quality,
      frames: 0,
      running: () => raf !== 0,
      renderAt(at) {
        t = at;
        draw(0);
      },
      step(dt) {
        t += dt;
        draw(dt);
      },
      pause(on) {
        paused = on;
        if (on) stop();
        else request();
      },
    };
    (canvas as unknown as { __pf: DebugHandle }).__pf = debug;

    const ambient = () => !!optsRef.current.ambient && quality === "full" && motion;

    /** Polls the background shader compile; a failed shader switches to the fallback. */
    function ready() {
      if (compiled) return true;
      try {
        compiled = programsReady(gl);
      } catch (err) {
        console.warn("[webgl] scene disabled:", err);
        lost = true;
        report("off");
      }
      return compiled;
    }

    function draw(dt: number) {
      if (lost || !width || !height || !ready()) return false;
      let busy = false;
      try {
        busy = !!scene.frame(t, dt);
      } catch (err) {
        console.warn("[webgl] frame failed:", err);
        lost = true;
        report("off");
        return false;
      }
      debug.frames++;
      if (!shown) {
        shown = true;
        report("on");
      }
      return busy;
    }

    function tick(now: number) {
      raf = 0;
      if (!onScreen || document.hidden || paused) {
        last = 0;
        return;
      }
      if (!ready()) {
        if (!lost) raf = requestAnimationFrame(tick); // still compiling: check again next frame
        return;
      }
      const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
      last = now;
      const animate = motion && (ambient() || now < wakeUntil);
      if (animate) t += dt;
      const busy = draw(animate ? dt : 0);
      if (animate || (busy && motion)) raf = requestAnimationFrame(tick);
      else last = 0;
    }
    function request() {
      if (!raf && !lost) raf = requestAnimationFrame(tick);
    }
    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    }

    c.wake = (ms = 1200) => {
      if (motion) wakeUntil = Math.max(wakeUntil, performance.now() + ms);
      request();
    };
    c.invalidate = request;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const o = optsRef.current;
      const scale = Math.min(window.devicePixelRatio || 1, o.maxDpr ?? 2) * (o.scale ?? 1);
      width = r.width;
      height = r.height;
      const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      scene.resize?.(width, height, w / Math.max(1, width));
      request();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const target = optsRef.current.observe?.current ?? canvas;
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      if (onScreen) request();
      else {
        stop();
        // one last frame: a fixed canvas must not keep showing what was last on screen
        draw(0);
      }
    });
    io.observe(target);

    const onVisibility = () => (document.hidden ? stop() : request());
    document.addEventListener("visibilitychange", onVisibility);

    const onMotion = () => {
      motion = !reducedQuery.matches;
      request();
    };
    reducedQuery.addEventListener("change", onMotion);

    const mo = new MutationObserver(() => {
      scene.theme?.();
      request();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });

    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      stop();
      report("off");
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      disposed = true;
      stop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reducedQuery.removeEventListener("change", onMotion);
      canvas.removeEventListener("webglcontextlost", onLost);
      try {
        scene.dispose?.();
      } catch {
        /* context already gone */
      }
      sceneRef.current = null;
      c.wake = () => {};
      c.invalidate = () => {};
    };
  }, [canvasRef, enabled]);

  // stable object: the callbacks read the live loop through a ref when they are called
  const [control] = useState<SceneControl<S>>(() => ({
    scene: sceneRef,
    wake: (ms) => ctl.current.wake(ms),
    invalidate: () => ctl.current.invalidate(),
  }));
  return [status, control];
}
