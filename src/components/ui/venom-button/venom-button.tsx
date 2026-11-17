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
import { drawVenom, getGlove, GLOVE_SIZE, type VenomPalette } from "./venom-draw";
import { VenomSim, type VenomInput } from "./venom-sim";
import "./venom-button.css";

export type VenomButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** A held strand snaps once stretched past this length, px. */
  reach?: number;
  /** How close (from the edge) the cursor must come to wake the strands, px. */
  sense?: number;
  /** Number of strands in the bundle. */
  tendrils?: number;
  /** Strand thickness multiplier. */
  thickness?: number;
  /** Pull on the strands, px/frame². Higher = more sag and drip. */
  gravity?: number;
  /** Lunge/follow speed multiplier, 0.3 … 2. */
  stiffness?: number;
  /** Corner radius of the body, px. Defaults to a pill. */
  radius?: number;
  /** Ink droplets thrown on click. 0 disables. */
  splash?: number;
  /** "glove" swaps the cursor for a cartoon glove near the button. */
  cursor?: "glove" | "native";
  /** Ghost glove that plays the effect when nobody points. "touch" = only on touch screens. */
  autoplay?: boolean | "touch";
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
};

/**
 * A glossy black "symbiote" button. When the cursor comes close, a bundle of thin
 * ink strands lunges out of the facing edge, grabs the cursor (a cartoon glove), sags
 * and drips while you drag it around, and snaps strand by strand when you pull away.
 *
 * Performance
 * - Body is pure CSS. Only the strands use a 2D canvas, sized to the button + reach.
 * - One rAF loop, zero React renders per frame; it sleeps when the strands settle,
 *   when the button is off-screen (IntersectionObserver) or the tab is hidden.
 * - Layout is read from a cached rect that refreshes on scroll/resize only.
 * - prefers-reduced-motion: static glossy button, no canvas, no listeners.
 */
export const VenomButton = forwardRef<HTMLButtonElement, VenomButtonProps>(function VenomButton(
  {
    reach = 230,
    sense = 170,
    tendrils = 16,
    thickness = 1,
    gravity = 0.32,
    stiffness = 1,
    radius,
    splash = 10,
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
  const pad = Math.ceil(Math.max(reach, sense) + GLOVE_SIZE.h + 24);

  const props = { reach, sense, tendrils: Math.max(1, Math.min(tendrils, 40)), thickness, gravity, stiffness, radius, splash, cursor, autoplay, pad, size };
  const cfg = useRef(props);
  useEffect(() => {
    cfg.current = props;
    const sim = S.current.sim;
    if (sim) sim.cfg = { strands: props.tendrils, reach, sense, thickness, gravity, stiffness, splash };
  });

  const S = useRef({
    sim: null as VenomSim | null,
    ctx: null as CanvasRenderingContext2D | null,
    palette: { ink: "#0b0b12", sheen: "#ffffff", edge: null } as VenomPalette,
    raf: 0,
    last: 0,
    visible: true,
    rect: null as DOMRect | null,
    rectDirty: true,
    pointer: null as null | { x: number; y: number },
    pointerType: "mouse",
    lastReal: -1e9,
    touchUntil: 0,
    coarse: false,
    gloveOn: false,
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

  const setGlove = (on: boolean) => {
    const st = S.current;
    if (st.gloveOn === on) return;
    st.gloveOn = on;
    document.documentElement.classList.toggle("venom-glove", on);
  };

  const frame = useCallback((now: number) => {
    const st = S.current;
    const C = cfg.current;
    const canvas = canvasRef.current;
    if (!st.sim || !st.ctx || !C.size || !canvas || !btnRef.current) {
      st.raf = 0;
      return;
    }
    const dt = st.last ? Math.min((now - st.last) / 16.667, 3) : 1;
    st.last = now;

    if (st.rectDirty || !st.rect) {
      // Read the layout box without our own lean transform.
      const r = btnRef.current.getBoundingClientRect();
      st.rect = new DOMRect(r.left - st.sim.pullX, r.top - st.sim.pullY, r.width, r.height);
      st.rectDirty = false;
    }
    const { w, h } = C.size;
    const P = C.pad;
    const W = w + P * 2, H = h + P * 2;

    let pointer: { x: number; y: number } | null = null;
    let ghost = false;
    const realActive = now - st.lastReal < 2500 || now < st.touchUntil;
    if (st.pointer && realActive) {
      pointer = { x: st.pointer.x - st.rect.left + P, y: st.pointer.y - st.rect.top + P };
    } else if (C.autoplay === true || (C.autoplay === "touch" && st.coarse)) {
      ghost = true;
      const t = now / 1000;
      // Wander below/around the button, come close to get grabbed, then pull away to snap.
      const rr = h / 2 + 30 + C.reach * (0.45 + 0.5 * Math.sin(t * 0.9));
      const a = Math.PI / 2 + Math.sin(t * 0.47) * 1.25;
      pointer = { x: P + w / 2 + Math.cos(a) * (rr + w * 0.2), y: P + h / 2 + Math.sin(a) * rr };
    }

    const input: VenomInput = { pointer, bx: P, by: P, bw: w, bh: h, radius: C.radius ?? h / 2 };
    const active = st.sim.step(dt, input);

    // Lean the body toward what it is holding (compositor-only transform).
    btnRef.current.style.setProperty("--vx", `${st.sim.pullX.toFixed(2)}px`);
    btnRef.current.style.setProperty("--vy", `${st.sim.pullY.toFixed(2)}px`);

    // Canvas
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const ctx = st.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const glove =
      C.cursor === "glove" && pointer && (st.pointerType !== "touch" || ghost) && (active || ghost);
    drawVenom(ctx, st.sim, st.palette, pointer, !!glove);
    if (!ghost) setGlove(!!glove && st.pointerType === "mouse");

    const keep = st.visible && (active || ghost || !st.sim.settled());
    st.raf = keep ? requestAnimationFrame(frame) : 0;
    if (!keep) {
      st.last = 0;
      setGlove(false);
    }
  }, []);

  const wake = useCallback(() => {
    const st = S.current;
    if (!st.raf && st.visible && st.sim) st.raf = requestAnimationFrame(frame);
  }, [frame]);

  const readColors = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const ink = cs.getPropertyValue("--venom-color").trim() || "#0b0b12";
    const rim = cs.getPropertyValue("--venom-color-2").trim() || "#ffffff";
    const edge = cs.getPropertyValue("--venom-edge").trim();
    S.current.palette = { ink, sheen: rim, edge: edge && edge !== "transparent" && edge !== "none" ? edge : null };
  }, []);

  // Set up canvas + sim once measured.
  useEffect(() => {
    if (reduced || !size) return;
    const st = S.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!st.sim) {
      st.ctx = canvas.getContext("2d");
      const C = cfg.current;
      st.sim = new VenomSim({ strands: C.tendrils, reach: C.reach, sense: C.sense, thickness: C.thickness, gravity: C.gravity, stiffness: C.stiffness, splash: C.splash });
      getGlove(); // start decoding the cursor image early
      readColors();
    }
    st.coarse = window.matchMedia("(pointer: coarse)").matches;
    st.rectDirty = true;
    wake();
  }, [reduced, size, wake, readColors]);

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
      if (near || st.raf) wake();
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
      setGlove(false);
      wake();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        st.visible = entry.isIntersecting;
        st.rectDirty = true;
        if (st.visible) wake();
        else if (st.raf) {
          cancelAnimationFrame(st.raf);
          st.raf = 0;
          st.last = 0;
          setGlove(false);
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
      st.raf = 0;
      setGlove(false);
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
        {children}
      </button>
    </span>
  );
});
