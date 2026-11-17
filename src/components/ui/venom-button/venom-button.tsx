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
import { drawVenom, getGlove, GLOVE_SIZE, gloveSites, type GlovePose, type VenomPalette } from "./venom-draw";
import { VenomSim, type VenomConfig } from "./venom-sim";
import "./venom-button.css";

export type VenomButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Max tendrils at once (one per finger/wrist), 1 … 6. */
  tendrils?: number;
  /** Distance from the edge where surface strings start to fizz, px. */
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
  /** Corner radius of the body, px. Defaults to a pill. */
  radius?: number;
  /** Ink droplets thrown on click. 0 disables. */
  splash?: number;
  /** Small bursts of strings every ~2 s while nobody is near. */
  idle?: boolean;
  /** "glove" morphs the cursor into a cartoon glove while it is caught. */
  cursor?: "glove" | "native";
  /** Ghost glove that plays the effect when nobody points. "touch" = only on touch screens. */
  autoplay?: boolean | "touch";
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
};

/**
 * A glossy black "symbiote" button. As the cursor approaches, strings fizz on the facing edge,
 * then thin tendrils lunge out, coil around the cursor (a cartoon glove) and hold on. Pull away
 * and they thin, bead, web together, then pinch off and recoil.
 *
 * Performance
 * - Body is pure CSS; only the goo is drawn, on a 2D canvas sized to the button + reach.
 * - One rAF loop (physics at 240 Hz substeps, a few hundred float ops), zero React renders per
 *   frame. It sleeps when nothing moves; idle bursts wake it with a timer, not a running loop.
 * - Pauses off-screen (IntersectionObserver). Layout comes from a cached rect.
 * - prefers-reduced-motion: static glossy button, no canvas, no listeners.
 */
export const VenomButton = forwardRef<HTMLButtonElement, VenomButtonProps>(function VenomButton(
  {
    tendrils = 6,
    sense = 220,
    reach = 120,
    maxLength = 170,
    snapStretch = 1.6,
    lunge = 1,
    thickness = 1,
    gravity = 320,
    radius,
    splash = 6,
    idle = true,
    cursor = "glove",
    autoplay = "touch",
    className,
    wrapperClassName,
    wrapperStyle,
    children,
    onPointerDown,
    style,
    ...rest
  },
  ref,
) {
  const reduced = usePrefersReducedMotion();
  const btnRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(ref, () => btnRef.current as HTMLButtonElement);

  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const pad = Math.ceil(Math.max(sense, maxLength + GLOVE_SIZE.h) + 30);

  const simCfg: VenomConfig = {
    tendrils: Math.max(1, Math.min(tendrils, 6)),
    sense, reach, maxLength, snapStretch, gravity, lunge, thickness, splash, idle,
  };
  const props = { simCfg, radius, cursor, autoplay, pad, size };
  const cfg = useRef(props);
  useEffect(() => {
    cfg.current = props;
    if (S.current.sim) S.current.sim.cfg = props.simCfg;
  });

  const S = useRef({
    sim: null as VenomSim | null,
    ctx: null as CanvasRenderingContext2D | null,
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

  const frame = useCallback((now: number) => {
    const st = S.current;
    const C = cfg.current;
    const canvas = canvasRef.current;
    st.raf = 0;
    if (!st.sim || !st.ctx || !C.size || !canvas || !btnRef.current) return;
    const dt = st.last ? Math.min((now - st.last) / 1000, 0.05) : 1 / 60;
    st.last = now;

    if (st.rectDirty || !st.rect) {
      st.rect = btnRef.current.getBoundingClientRect();
      st.rectDirty = false;
    }
    const { w, h } = C.size;
    const P = C.pad;
    const W = w + P * 2, H = h + P * 2;

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

    const sim = st.sim;
    const pose: GlovePose | null = pointer ? { x: pointer.x + sim.tugX, y: pointer.y + sim.tugY, rot: sim.tugRot } : null;
    const sites = pose ? gloveSites(pose) : null;
    sim.step(dt, { x: P, y: P, w, h, r: C.radius ?? h / 2 }, pointer, sites);

    // canvas
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

    if (st.visible && (sim.busy || ghost)) {
      st.raf = requestAnimationFrame(frame);
    } else {
      st.last = 0;
      hideCursor(false);
      // asleep: wake for the next idle burst with a timer instead of a running loop
      if (st.visible && sim.cfg.idle && !reducedRef.current) {
        st.sleptAt = performance.now();
        clearTimeout(st.timer);
        st.timer = setTimeout(() => {
          sim.skip((performance.now() - st.sleptAt) / 1000);
          if (!st.raf) st.raf = requestAnimationFrame(frame);
        }, sim.idleIn * 1000 + 16);
      }
    }
  }, []);

  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  const wake = useCallback(() => {
    const st = S.current;
    if (st.raf || !st.visible || !st.sim) return;
    if (st.timer) {
      clearTimeout(st.timer);
      st.timer = 0;
      st.sim.skip((performance.now() - st.sleptAt) / 1000);
    }
    st.raf = requestAnimationFrame(frame);
  }, [frame]);

  const readColors = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const ink = cs.getPropertyValue("--venom-color").trim() || "#0b0b12";
    const sheen = cs.getPropertyValue("--venom-color-2").trim() || "#ffffff";
    const edge = cs.getPropertyValue("--venom-edge").trim();
    S.current.palette = { ink, sheen, edge: edge && edge !== "none" && edge !== "transparent" ? edge : null };
  }, []);

  // canvas + sim, once measured
  useEffect(() => {
    if (reduced || !size) return;
    const st = S.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!st.sim) {
      st.ctx = canvas.getContext("2d");
      st.sim = new VenomSim(cfg.current.simCfg);
      getGlove();
      readColors();
    }
    st.coarse = window.matchMedia("(pointer: coarse)").matches;
    st.rectDirty = true;
    wake();
  }, [reduced, size, wake, readColors]);

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
    const onLeave = () => {
      st.lastReal = -1e9;
      hideCursor(false);
      wake();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        st.visible = entry.isIntersecting;
        st.rectDirty = true;
        if (st.visible) wake();
        else {
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
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", markDirty, { passive: true, capture: true });
    window.addEventListener("resize", markDirty, { passive: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
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
    if (!st.sim || !st.rect) return;
    const P = cfg.current.pad;
    st.sim.press(e.clientX - st.rect.left + P, e.clientY - st.rect.top + P);
    wake();
  };

  const W = (size?.w ?? 0) + pad * 2;
  const H = (size?.h ?? 0) + pad * 2;

  return (
    <span ref={wrapRef} className={cn("relative inline-flex align-middle", wrapperClassName)} style={wrapperStyle}>
      {!reduced && size && (
        <canvas
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
        style={{ borderRadius: radius ?? 9999, ...style }}
        className={cn(
          "venom-btn inline-flex select-none items-center justify-center gap-2 whitespace-nowrap",
          "h-12 px-7 text-[15px] font-semibold tracking-tight",
          "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
          className,
        )}
      >
        <span className="venom-label">{children}</span>
      </button>
    </span>
  );
});
