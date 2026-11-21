"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
} from "react";
import { usePrefersReducedMotion } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import { drawVenom, getGlove, gloveSites, type GlovePose, type VenomPalette } from "./venom-draw";
import type { RGB, VenomGL, VenomGLParams, VenomLook } from "./venom-gl";
import { rasterLabel } from "./venom-label";
import { VenomSim, type VenomConfig } from "./venom-sim";
import "./venom-button.css";

export type VenomButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Max tendrils at once (one per finger/wrist), 1 … 6. */
  tendrils?: number;
  /** Distance from the edge where the surface starts reacting, px. */
  sense?: number;
  /** Distance from the edge where tendrils launch, px. */
  reach?: number;
  /** A held tendril always snaps past this length, px. */
  maxLength?: number;
  /** A held tendril snaps past this stretch ratio. */
  snapStretch?: number;
  /** Lunge speed multiplier. */
  lunge?: number;
  /** Strand thickness multiplier. */
  thickness?: number;
  /** Gravity on strands, px/s². */
  gravity?: number;
  /** Oily blue-violet thin-film sheen on the goo, 0 … 1 (WebGL renderer). */
  sheen?: number;
  /** Corner radius of the body, px. Defaults to a pill. */
  radius?: number;
  /** Droplets flicked off the rim on click. 0 disables. */
  splash?: number;
  /** Small bursts of strings every ~2 s while nobody is near. */
  idle?: boolean;
  /** "glove" turns the cursor into a 3D hand the tendrils coil around while it is near. */
  cursor?: "glove" | "native";
  /** Ghost cursor that plays the effect when nobody points. "touch" = only on touch screens. */
  autoplay?: boolean | "touch";
  /** "auto" renders the lit 3D scene with WebGL2 and falls back to the 2D canvas. */
  renderer?: "auto" | "2d";
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
};

/**
 * Test / preview hook: set `window.__VENOM_GL__ = "force"` before load to use WebGL even on a
 * software rasteriser, and reach each engine through `canvas.__venom`.
 */
const glFlag = () => (typeof window === "undefined" ? undefined : (window as unknown as { __VENOM_GL__?: string }).__VENOM_GL__);

// ── colour helpers (CSS colour → linear RGB)
let probe: CanvasRenderingContext2D | null = null;
/** CSS colour → [linear r, g, b, alpha], or null if it does not parse. */
function parseColor(css: string): [number, number, number, number] | null {
  probe ??= document.createElement("canvas").getContext("2d");
  if (!probe || !css || css === "none") return null;
  probe.fillStyle = "#010203";
  probe.fillStyle = css;
  const v = String(probe.fillStyle);
  if (v === "#010203" && css.trim() !== "#010203") return null;
  let c: number[];
  if (v[0] === "#") c = [...[1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)), 1];
  else {
    const m = v.match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    c = [...m.slice(0, 3).map(Number), m[3] !== undefined ? Number(m[3]) : 1];
  }
  const lin = (x: number) => {
    const s = x / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [lin(c[0]), lin(c[1]), lin(c[2]), c[3]];
}
function toLinear(css: string, fallback: RGB): RGB {
  const c = parseColor(css);
  return c ? [c[0], c[1], c[2]] : fallback;
}
const luma = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * A black "symbiote" button. As the cursor approaches, short strings sprout on the facing edge,
 * then glossy tendrils lunge out, coil around the cursor (which becomes a 3D hand) and hold on.
 * Pull away and they thin, bead, web together, then pinch off and recoil into the body.
 *
 * Rendering
 * - WebGL2 (default): the slab, goo, label and cursor are one lit 3D scene, ray marched from above
 *   (adapted from exteestudio/venom-button, MIT). Shaders compile in the background; the button is
 *   pure CSS until they are ready, and stays CSS if WebGL2 is missing or fails.
 * - 2D fallback: CSS body + strands drawn on a 2D canvas.
 *
 * Performance
 * - The canvas only covers the button + its reach. One rAF loop, zero React renders per frame; it
 *   sleeps when nothing moves and idle bursts wake it with a timer. Pauses off-screen.
 * - Nothing is created until the button first scrolls into view.
 * - prefers-reduced-motion: static glossy button, no canvas, no listeners.
 */
export const VenomButton = forwardRef<HTMLButtonElement, VenomButtonProps>(function VenomButton(
  {
    tendrils = 6,
    sense = 220,
    reach = 120,
    maxLength = 160,
    snapStretch = 1.6,
    lunge = 1,
    thickness = 1,
    gravity = 900,
    sheen = 0,
    radius,
    splash = 4,
    idle = true,
    cursor = "glove",
    autoplay = "touch",
    renderer: rendererProp = "auto",
    className,
    wrapperClassName,
    wrapperStyle,
    children,
    onPointerDown,
    onKeyDown,
    onKeyUp,
    style,
    ...rest
  },
  ref,
) {
  const reduced = usePrefersReducedMotion();
  const btnRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(ref, () => btnRef.current as HTMLButtonElement);

  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [seen, setSeen] = useState(false);
  const [renderer, setRenderer] = useState<"gl" | "2d">(rendererProp === "2d" ? "2d" : "gl");
  const pad = Math.ceil(Math.max(sense, maxLength * 1.15 + 60) + 24);

  const n = Math.max(1, Math.min(tendrils, 6));
  const simCfg: VenomConfig = {
    tendrils: n, sense, reach, maxLength, snapStretch, gravity: (gravity * 320) / 900, lunge, thickness, splash, idle,
  };
  const glParams: Partial<VenomGLParams> = {
    reach, awareness: sense, maxStrands: n, snapStretch, maxLen: maxLength, whip: lunge, thickness, gravity, sheen,
    splash: Math.max(0, Math.min(splash, 5)), idle, glove: cursor === "glove",
  };
  const props = { simCfg, glParams, radius, cursor, autoplay, pad, size };
  const cfg = useRef(props);
  useEffect(() => {
    cfg.current = props;
    const st = S.current;
    if (st.sim) st.sim.cfg = props.simCfg;
    if (st.gl) Object.assign(st.gl.params, props.glParams);
    st.layoutDirty = true;
  });

  const S = useRef({
    sim: null as VenomSim | null,
    ctx: null as CanvasRenderingContext2D | null,
    gl: null as VenomGL | null,
    glOn: false,
    layoutDirty: true,
    labelDirty: true,
    labelBusy: false,
    palette: { ink: "#0b0b12", sheen: "#ffffff", edge: null } as VenomPalette,
    raf: 0,
    timer: 0 as ReturnType<typeof setTimeout> | 0,
    last: 0,
    sleptAt: 0,
    visible: true,
    rect: null as DOMRect | null,
    rectDirty: true,
    pointer: null as null | { x: number; y: number },
    pointerType: "mouse",
    lastReal: -1e9,
    touchUntil: 0,
    coarse: false,
    hidingCursor: false,
    paused: false,
    pressed: false,
  });

  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0];
      const w = box ? box.inlineSize : el.offsetWidth;
      const h = box ? box.blockSize : el.offsetHeight;
      setSize((p) => (p && p.w === w && p.h === h ? p : { w, h }));
      S.current.rectDirty = true;
      S.current.layoutDirty = true;
      S.current.labelDirty = true;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hideCursor = (on: boolean) => {
    const st = S.current;
    if (st.hidingCursor === on) return;
    st.hidingCursor = on;
    document.documentElement.classList.toggle("venom-glove", on);
  };

  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  const frame = useCallback((now: number) => {
    const st = S.current;
    const C = cfg.current;
    const canvas = canvasRef.current;
    const button = btnRef.current;
    st.raf = 0;
    if (!C.size || !canvas || !button || (!st.sim && !st.gl)) return;
    if (st.paused && st.glOn) return;
    const dt = st.last ? Math.min((now - st.last) / 1000, 0.05) : 1 / 60;
    st.last = now;

    if (st.rectDirty || !st.rect) {
      st.rect = button.getBoundingClientRect();
      st.rectDirty = false;
    }
    const { w, h } = C.size;
    const P = C.pad;

    // pointer: real mouse, a recent touch, or the autoplay ghost
    let pointer: { x: number; y: number } | null = null;
    let ghost = false;
    const realActive = now - st.lastReal < 2500 || now < st.touchUntil;
    if (st.pointer && realActive) {
      pointer = { x: st.pointer.x - st.rect.left + P, y: st.pointer.y - st.rect.top + P };
    } else if (C.autoplay === true || (C.autoplay === "touch" && st.coarse)) {
      ghost = true;
      const t = now / 1000;
      // wander under the button: come close to get caught, drift away to snap the strands
      pointer = {
        x: P + w / 2 + Math.sin(t * 0.6) * w * 0.42,
        y: P + h + 30 + 130 * (0.5 + 0.5 * Math.sin(t * 0.85)),
      };
    }

    let busy = false;
    let idleIn = Infinity;
    const gl = st.gl;
    if (gl) {
      if (gl.failed()) {
        fallback();
        return;
      }
      if (!gl.ready()) {
        // shaders still compiling in the background: check again next frame, CSS button meanwhile
        if (!gl.failed()) st.raf = requestAnimationFrame(frame);
        else fallback();
        return;
      }
      if (st.layoutDirty) {
        gl.layout({ w, h, pad: P, radius: C.radius ?? h / 2, dpr: window.devicePixelRatio || 1 });
        st.layoutDirty = false;
      }
      if (st.labelDirty) {
        if (!st.labelBusy && labelRef.current) {
          st.labelBusy = true;
          st.labelDirty = false;
          rasterLabel(button, labelRef.current, P).then((r) => {
            st.labelBusy = false;
            if (st.gl !== gl) return;
            gl.setLabel(r.canvas, r.box);
            wake();
          });
        }
        // the first frame waits for the label so the slab never shows up blank
        if (!st.glOn) return;
      }
      const touchNow = st.pointerType === "touch" && !ghost;
      busy = gl.frame(dt, pointer ? { ...pointer, mouse: !touchNow } : null);
      if (!st.glOn) {
        st.glOn = true;
        button.classList.add("venom-btn--gl");
      }
      hideCursor(!ghost && !touchNow && gl.handVisible());
      idleIn = gl.idleIn();
    } else if (st.sim && st.ctx) {
      const W = w + P * 2, H = h + P * 2;
      const sim = st.sim;
      const pose: GlovePose | null = pointer ? { x: pointer.x + sim.tugX, y: pointer.y + sim.tugY, rot: sim.tugRot } : null;
      const sites = pose ? gloveSites(pose) : null;
      sim.step(dt, { x: P, y: P, w, h, r: C.radius ?? h / 2 }, pointer, sites);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      const ctx = st.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const showGlove = C.cursor === "glove" && (st.pointerType !== "touch" || ghost);
      drawVenom(ctx, sim, st.palette, showGlove ? pose : null, sites);
      hideCursor(showGlove && !ghost && sim.glove > 0.5);
      busy = sim.busy;
      idleIn = sim.cfg.idle ? sim.idleIn : Infinity;
    }

    if (st.visible && (busy || ghost)) {
      st.raf = requestAnimationFrame(frame);
    } else {
      st.last = 0;
      hideCursor(false);
      // asleep: wake for the next idle burst with a timer instead of a running loop
      if (st.visible && Number.isFinite(idleIn) && !reducedRef.current) {
        st.sleptAt = performance.now();
        clearTimeout(st.timer);
        st.timer = setTimeout(() => {
          st.timer = 0;
          st.sim?.skip((performance.now() - st.sleptAt) / 1000);
          if (!st.raf) st.raf = requestAnimationFrame(frame);
        }, idleIn * 1000 + 16);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wake = useCallback(() => {
    const st = S.current;
    if (st.raf || !st.visible || (!st.sim && !st.gl)) return;
    if (st.timer) {
      clearTimeout(st.timer);
      st.timer = 0;
      st.sim?.skip((performance.now() - st.sleptAt) / 1000);
    }
    st.raf = requestAnimationFrame(frame);
  }, [frame]);

  // WebGL unavailable or broken: swap in a fresh canvas for the 2D renderer
  const fallback = useCallback(() => {
    const st = S.current;
    st.gl?.destroy();
    st.gl = null;
    st.glOn = false;
    btnRef.current?.classList.remove("venom-btn--gl");
    setRenderer("2d");
  }, []);

  const readColors = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const ink = cs.getPropertyValue("--venom-color").trim() || "#0b0b12";
    const sheenC = cs.getPropertyValue("--venom-color-2").trim() || "#ffffff";
    const fg = cs.getPropertyValue("--venom-fg").trim() || "#ffffff";
    const edge = cs.getPropertyValue("--venom-edge").trim();
    const st = S.current;
    st.palette = { ink, sheen: sheenC, edge: edge && edge !== "none" && edge !== "transparent" ? edge : null };
    if (st.gl) {
      const alb = toLinear(ink, [0.0033, 0.0033, 0.006]);
      const tint = toLinear(sheenC, [1, 1, 1]);
      const tm = Math.max(...tint, 1e-3);
      const lab = toLinear(fg, [1, 1, 1]);
      // page brightness decides how much the floor lights the goo from below and how dark shadows read
      const bgc = parseColor(getComputedStyle(document.body).backgroundColor);
      const L = bgc && bgc[3] > 0 ? luma([bgc[0], bgc[1], bgc[2]]) : 1;
      const rim = parseColor(edge);
      const look: VenomLook = {
        albedo: alb.map((c) => c * 0.3) as RGB,
        tint: tint.map((c) => 0.45 + (0.55 * c) / tm) as RGB,
        label: lab.map((c) => (0.9 * (0.5 + 0.5 * c)) / (0.5 + 0.5 * Math.max(...lab, 1e-3))) as RGB,
        floor: 0.45 + 0.55 * L,
        shadow: 0.85 + 0.15 * L,
        shadowColor: L > 0.3 ? [0.03, 0.035, 0.06] : [0, 0, 0],
        rim: rim ? [rim[0], rim[1], rim[2], rim[3] * 2.5] : [0, 0, 0, 0],
      };
      st.gl.setLook(look);
    }
  }, []);

  // create the renderer once the button is measured and has been on screen
  useEffect(() => {
    if (reduced || !size || !seen) return;
    const st = S.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const start = () => {
      st.coarse = window.matchMedia("(pointer: coarse)").matches;
      st.rectDirty = true;
      wake();
    };
    if (renderer === "gl" && !st.gl) {
      // the WebGL engine is most of the button's code: fetch it only once a button is on screen
      let live = true;
      import("./venom-gl")
        .then(({ createVenomGL }) => {
          if (!live || st.gl) return;
          const force = glFlag() === "force";
          st.gl = createVenomGL(canvas, cfg.current.glParams, { allowSoftware: force });
          if (force && st.gl) (canvas as HTMLCanvasElement & { __venom?: unknown }).__venom = { gl: st.gl, pause: () => (st.paused = true) };
          if (!st.gl) throw new Error("no WebGL");
          st.layoutDirty = st.labelDirty = true;
          readColors();
          start();
        })
        .catch(() => {
          if (!live) return;
          st.gl?.destroy();
          st.gl = null;
          setRenderer("2d");
        });
      return () => {
        live = false;
      };
    }
    if (renderer === "2d" && !st.sim) {
      st.ctx = canvas.getContext("2d");
      st.sim = new VenomSim(cfg.current.simCfg);
      getGlove();
      readColors();
    }
    start();
  }, [reduced, size, seen, renderer, wake, readColors]);

  useEffect(
    () => () => {
      const st = S.current;
      st.gl?.destroy();
      st.gl = null;
      st.glOn = false;
    },
    [],
  );

  // label edits (children, fonts) re-rasterise the WebGL label
  useEffect(() => {
    const st = S.current;
    st.labelDirty = true;
    wake();
  }, [children, wake]);

  // listeners
  useEffect(() => {
    if (reduced) return;
    const st = S.current;
    const markDirty = () => (st.rectDirty = true);

    const onMove = (e: PointerEvent) => {
      st.pointer = { x: e.clientX, y: e.clientY };
      st.pointerType = e.pointerType;
      if (e.pointerType === "touch") st.touchUntil = performance.now() + 900;
      else st.lastReal = performance.now();
      const r = st.rect;
      const R = cfg.current.pad;
      const near = !r || (e.clientX > r.left - R && e.clientX < r.right + R && e.clientY > r.top - R && e.clientY < r.bottom + R);
      if (near) wake();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      st.pointer = { x: e.clientX, y: e.clientY };
      st.pointerType = "touch";
      st.touchUntil = performance.now() + 1400;
      st.rectDirty = true;
      wake();
    };
    const onUp = (e: PointerEvent) => {
      if (!st.pressed) return;
      st.pressed = false;
      if (!st.gl || !st.rect) return;
      const P = cfg.current.pad;
      st.gl.press(false, e.clientX - st.rect.left + P, e.clientY - st.rect.top + P);
      wake();
    };
    const onLeave = () => {
      st.lastReal = -1e9;
      hideCursor(false);
      wake();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        st.visible = entry.isIntersecting;
        st.rectDirty = true;
        if (st.visible) {
          setSeen(true);
          wake();
        } else {
          cancelAnimationFrame(st.raf);
          clearTimeout(st.timer);
          st.raf = 0;
          st.timer = 0;
          st.last = 0;
          hideCursor(false);
        }
      },
      { rootMargin: "120px" },
    );
    if (btnRef.current) io.observe(btnRef.current);

    const mo = new MutationObserver(() => {
      readColors();
      wake();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    const fonts = document.fonts;
    const onFonts = () => {
      st.labelDirty = true;
      wake();
    };
    fonts?.addEventListener?.("loadingdone", onFonts);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", markDirty, { passive: true, capture: true });
    window.addEventListener("resize", markDirty, { passive: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      fonts?.removeEventListener?.("loadingdone", onFonts);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", markDirty, { capture: true });
      window.removeEventListener("resize", markDirty);
      cancelAnimationFrame(st.raf);
      clearTimeout(st.timer);
      st.raf = 0;
      st.timer = 0;
      hideCursor(false);
    };
  }, [reduced, wake, readColors]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    onPointerDown?.(e);
    const st = S.current;
    if (!st.rect) return;
    const P = cfg.current.pad;
    if (st.gl) {
      st.gl.press(true);
      st.pressed = true;
    } else st.sim?.press(e.clientX - st.rect.left + P, e.clientY - st.rect.top + P);
    wake();
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(e);
    if ((e.key === "Enter" || e.key === " ") && !e.repeat && S.current.gl) {
      S.current.gl.press(true);
      wake();
    }
  };
  const handleKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    onKeyUp?.(e);
    if ((e.key === "Enter" || e.key === " ") && S.current.gl) {
      S.current.gl.press(false);
      wake();
    }
  };

  const W = (size?.w ?? 0) + pad * 2;
  const H = (size?.h ?? 0) + pad * 2;

  return (
    <span ref={wrapRef} className={cn("relative inline-flex align-middle", wrapperClassName)} style={wrapperStyle}>
      {!reduced && size && (
        <canvas
          key={renderer}
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute z-10"
          style={{ left: -pad, top: -pad, width: W, height: H }}
        />
      )}
      <button
        ref={btnRef}
        type="button"
        {...rest}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        style={{ borderRadius: radius ?? 9999, ...style }}
        className={cn(
          "venom-btn inline-flex select-none items-center justify-center gap-2 whitespace-nowrap",
          "h-12 px-7 text-[15px] font-bold tracking-tight",
          "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
          className,
        )}
      >
        <span ref={labelRef} className="venom-label">
          {children}
        </span>
      </button>
    </span>
  );
});
