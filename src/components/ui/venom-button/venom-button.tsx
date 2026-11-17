"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
} from "react";
import { usePrefersReducedMotion } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";

export type VenomButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** How far (px) from the button edge the symbiote starts reaching for the cursor. */
  reach?: number;
  /** Number of blobs in the tendril. More = smoother, slightly more work per frame. */
  tendrils?: number;
  /** Radius (px) of the blob that follows the cursor. */
  headSize?: number;
  /** Blur radius of the goo filter. Higher = thicker, more liquid. */
  viscosity?: number;
  /** 0.2 … 2. How tightly the blob follows the pointer. */
  stiffness?: number;
  /** Corner radius of the button body, px. Defaults to a pill. */
  radius?: number;
  /** Droplets thrown on click/tap. 0 disables. */
  splash?: number;
  /** Hide the native cursor while over the button (the blob becomes the cursor). */
  hideCursor?: boolean;
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
};

type Blob = { x: number; y: number; vx: number; vy: number; r: number };
type Drop = Blob & { life: number; max: number; rTarget: number };

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * A button that grows a liquid "symbiote" tendril toward the cursor.
 *
 * Performance notes
 * - All per-frame work happens in one rAF loop that writes SVG attributes
 *   directly (no React re-renders), and the loop sleeps as soon as the goo settles.
 * - The goo filter only covers the button + `reach` padding, never the full screen.
 * - Layout is read once per frame (cached rect) before any writes: no layout thrash.
 * - Touch: no hover, so a tap spawns the tendril + splash at the finger, then retracts.
 * - prefers-reduced-motion: renders a static button, no loop, no listeners.
 */
export const VenomButton = forwardRef<HTMLButtonElement, VenomButtonProps>(function VenomButton(
  {
    reach = 140,
    tendrils = 9,
    headSize = 14,
    viscosity = 9,
    stiffness = 1,
    radius,
    splash = 7,
    hideCursor = false,
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
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const filterId = `venom-goo-${uid}`;
  const gradId = `venom-grad-${uid}`;

  const btnRef = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => btnRef.current as HTMLButtonElement);

  const bodyRef = useRef<SVGRectElement>(null);
  const headRef = useRef<SVGCircleElement>(null);
  const tendrilRefs = useRef<(SVGCircleElement | null)[]>([]);
  const dropRefs = useRef<(SVGCircleElement | null)[]>([]);

  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Measure the button (only on resize, never per frame).
  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0];
      const w = box ? box.inlineSize : el.offsetWidth;
      const h = box ? box.blockSize : el.offsetHeight;
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------ simulation ------------------------------ */

  const sim = useRef({
    raf: 0,
    last: 0,
    time: 0,
    px: 0,
    py: 0,
    pointerIn: false,
    touchUntil: 0,
    rect: null as DOMRect | null,
    rectDirty: true,
    visible: true,
    head: { x: 0, y: 0, vx: 0, vy: 0, r: 0 } as Blob,
    blobs: [] as Blob[],
    drops: [] as Drop[],
    pendingSplash: null as null | { x: number; y: number },
    bodyScale: 1,
    bodyOx: 0,
    bodyOy: 0,
  });

  const cfg = useRef({ reach, tendrils, headSize, viscosity, stiffness, splash, radius, size });
  cfg.current = { reach, tendrils, headSize, viscosity, stiffness, splash, radius, size };

  const frame = useCallback((now: number) => {
    const S = sim.current;
    const C = cfg.current;
    if (!C.size) return;
    const dt = S.last ? Math.min((now - S.last) / 16.667, 3) : 1;
    S.last = now;
    S.time += dt / 60;

    // ---- READ (one layout read, only when something scrolled/resized) ----
    if (S.rectDirty || !S.rect) {
      S.rect = btnRef.current!.getBoundingClientRect();
      S.rectDirty = false;
    }
    const rect = S.rect;

    // ---- COMPUTE (svg space: button sits at [reach, reach, w, h]) ----
    const { w, h } = C.size;
    const R = C.reach;
    const rad = Math.min(C.radius ?? h / 2, h / 2, w / 2);
    const bx0 = R, by0 = R, bx1 = R + w, by1 = R + h;
    const cx = R + w / 2, cy = R + h / 2;

    const touching = now < S.touchUntil;
    const px = S.px - rect.left + R;
    const py = S.py - rect.top + R;

    // Closest point on the rounded rect's "spine", then push out by the radius.
    const qx = clamp(px, bx0 + rad, bx1 - rad);
    const qy = clamp(py, by0 + rad, by1 - rad);
    let dx = px - qx, dy = py - qy;
    const dist = Math.hypot(dx, dy) || 0.0001;
    dx /= dist; dy /= dist;
    const edgeDist = Math.max(0, dist - rad);
    const inside = dist <= rad;
    const engaged = (S.pointerIn || touching) && edgeDist < R;
    const strength = engaged ? Math.pow(1 - edgeDist / R, 0.55) : 0;
    const ax = qx + dx * (rad - 3);
    const ay = qy + dy * (rad - 3);

    // Head blob: damped spring -> liquid overshoot.
    const k = 0.16 * C.stiffness;
    const damp = Math.pow(0.7, dt);
    const head = S.head;
    if (head.r < 0.5 && engaged) {
      // (Re)spawn at the anchor so the tendril visibly grows out of the button.
      head.x = ax; head.y = ay; head.vx = head.vy = 0;
    }
    head.vx = (head.vx + (px - head.x) * k * dt) * damp;
    head.vy = (head.vy + (py - head.y) * k * dt) * damp;
    head.x += head.vx * dt;
    head.y += head.vy * dt;
    const speed = Math.hypot(head.vx, head.vy);
    const headTarget = engaged ? C.headSize * (inside ? 1.35 : 1) + Math.min(speed * 0.15, 4) : 0;
    head.r += (headTarget - head.r) * Math.min(1, 0.2 * dt);

    // Tendril: chain of blobs between anchor and head, each lagging differently.
    const n = C.tendrils;
    while (S.blobs.length < n) S.blobs.push({ x: ax, y: ay, vx: 0, vy: 0, r: 0 });
    for (let i = 0; i < n; i++) {
      const b = S.blobs[i];
      const t = (i + 1) / (n + 1);
      const tx = ax + (head.x - ax) * t;
      const ty = ay + (head.y - ay) * t;
      const kk = (0.1 + 0.18 * (1 - t)) * C.stiffness;
      const dd = Math.pow(0.68, dt);
      b.vx = (b.vx + (tx - b.x) * kk * dt) * dd;
      b.vy = (b.vy + (ty - b.y) * kk * dt) * dd;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // Thick at the root, thinner mid-way, swelling again near the head. Never thinner
      // than the blur radius, otherwise the goo threshold would erase it and break the strand.
      const thick = Math.max(C.viscosity * 1.05, C.headSize * (0.95 - 0.35 * Math.sin(Math.PI * t)));
      const wobble = Math.sin(S.time * 7 + i * 0.9) * 1.4;
      // Strand "snaps" (shrinks away) only near the edge of the reach.
      const grip = clamp(strength * 2.6, 0, 1);
      const target = inside ? 0 : Math.max(0, (thick + wobble) * grip);
      b.r += (target - b.r) * Math.min(1, 0.22 * dt);
    }

    // Body: swells and leans toward the cursor.
    const lean = engaged ? strength * 5 : 0;
    S.bodyOx += (dx * lean - S.bodyOx) * Math.min(1, 0.18 * dt);
    S.bodyOy += (dy * lean - S.bodyOy) * Math.min(1, 0.18 * dt);
    const scaleTarget = 1 + (engaged ? 0.025 * strength : 0) + (inside && engaged ? 0.035 : 0);
    S.bodyScale += (scaleTarget - S.bodyScale) * Math.min(1, 0.15 * dt);

    // Splash droplets.
    if (S.pendingSplash && C.splash > 0) {
      const { x, y } = S.pendingSplash;
      const sx = x - rect.left + R, sy = y - rect.top + R;
      S.drops = Array.from({ length: C.splash }, (_, i) => {
        const a = (i / C.splash) * Math.PI * 2 + Math.random() * 0.8;
        const v = 7 + Math.random() * 7;
        // Must stay above the blur radius or the goo threshold erases the droplet.
        const rr = Math.max(C.viscosity * 1.15, C.headSize * (0.6 + Math.random() * 0.45));
        return { x: sx, y: sy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rr, rTarget: rr, life: 0, max: 60 + Math.random() * 30 };
      });
      S.pendingSplash = null;
    }
    for (const d of S.drops) {
      d.life += dt;
      const pull = d.life > 12 ? 0.012 : 0;
      d.vx = (d.vx + (cx - d.x) * pull * dt) * Math.pow(0.9, dt);
      d.vy = (d.vy + (cy - d.y) * pull * dt) * Math.pow(0.9, dt);
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.r = d.rTarget * Math.max(0, 1 - Math.pow(d.life / d.max, 2));
    }
    S.drops = S.drops.filter((d) => d.life < d.max);

    // ---- WRITE (attributes only, no layout) ----
    const f = (v: number) => v.toFixed(1);
    headRef.current?.setAttribute("cx", f(head.x));
    headRef.current?.setAttribute("cy", f(head.y));
    headRef.current?.setAttribute("r", f(Math.max(0, head.r)));
    for (let i = 0; i < n; i++) {
      const el = tendrilRefs.current[i];
      const b = S.blobs[i];
      if (!el) continue;
      el.setAttribute("cx", f(b.x));
      el.setAttribute("cy", f(b.y));
      el.setAttribute("r", f(Math.max(0, b.r)));
    }
    dropRefs.current.forEach((el, i) => {
      if (!el) return;
      const d = S.drops[i];
      el.setAttribute("r", d && d.r > C.viscosity * 0.6 ? f(d.r) : "0");
      if (d) {
        el.setAttribute("cx", f(d.x));
        el.setAttribute("cy", f(d.y));
      }
    });
    bodyRef.current?.setAttribute(
      "transform",
      `translate(${f(cx + S.bodyOx)} ${f(cy + S.bodyOy)}) scale(${S.bodyScale.toFixed(4)}) translate(${f(-cx)} ${f(-cy)})`,
    );

    // ---- SLEEP when settled ----
    const settled =
      !engaged &&
      head.r < 0.05 &&
      S.drops.length === 0 &&
      S.blobs.every((b) => b.r < 0.05) &&
      Math.abs(S.bodyScale - 1) < 0.0005 &&
      Math.abs(S.bodyOx) + Math.abs(S.bodyOy) < 0.05;
    S.raf = settled ? 0 : requestAnimationFrame(frame);
    if (settled) S.last = 0;
  }, []);

  const wake = useCallback(() => {
    const S = sim.current;
    if (!S.raf && S.visible) S.raf = requestAnimationFrame(frame);
  }, [frame]);

  // Global listeners (the zone extends beyond the button, but must not steal clicks
  // from neighbours, so we listen on window instead of a big invisible overlay).
  useEffect(() => {
    if (reduced) return;
    const S = sim.current;
    const markDirty = () => (S.rectDirty = true);

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      S.px = e.clientX;
      S.py = e.clientY;
      const r = S.rect;
      // Cheap reject using the cached rect: stay asleep when far away.
      const R = cfg.current.reach * 1.2;
      const near = !r || (e.clientX > r.left - R && e.clientX < r.right + R && e.clientY > r.top - R && e.clientY < r.bottom + R);
      S.pointerIn = near;
      if (near || S.raf) wake();
    };
    const onLeave = () => {
      S.pointerIn = false;
      wake();
    };

    const io = new IntersectionObserver(([entry]) => {
      S.visible = entry.isIntersecting;
      S.rectDirty = true;
      if (!S.visible && S.raf) {
        cancelAnimationFrame(S.raf);
        S.raf = 0;
        S.last = 0;
      }
    }, { rootMargin: `${cfg.current.reach}px` });
    if (btnRef.current) io.observe(btnRef.current);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", markDirty, { passive: true, capture: true });
    window.addEventListener("resize", markDirty, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", markDirty, { capture: true });
      window.removeEventListener("resize", markDirty);
      cancelAnimationFrame(S.raf);
      S.raf = 0;
    };
  }, [reduced, wake]);

  // Keep rect fresh when the button resizes.
  useEffect(() => {
    sim.current.rectDirty = true;
  }, [size]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    onPointerDown?.(e);
    if (reduced) return;
    const S = sim.current;
    S.rectDirty = true;
    S.px = e.clientX;
    S.py = e.clientY;
    if (e.pointerType === "touch") S.touchUntil = performance.now() + 650;
    S.pendingSplash = { x: e.clientX, y: e.clientY };
    wake();
  };

  /* ------------------------------ render ------------------------------ */

  const R = reach;
  const w = size?.w ?? 0;
  const h = size?.h ?? 0;
  const rad = Math.min(radius ?? h / 2, h / 2, w / 2);

  return (
    <span
      className={cn("relative inline-flex isolate align-middle", wrapperClassName)}
      style={wrapperStyle}
      data-venom-ready={size ? "true" : "false"}
    >
      {size && (
        <svg
          aria-hidden
          focusable="false"
          width={w + R * 2}
          height={h + R * 2}
          viewBox={`0 0 ${w + R * 2} ${h + R * 2}`}
          className="pointer-events-none absolute -z-10 overflow-visible"
          style={{ left: -R, top: -R }}
        >
          <defs>
            <filter
              id={filterId}
              x="0"
              y="0"
              width={w + R * 2}
              height={h + R * 2}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation={viscosity} result="blur" />
              <feColorMatrix
                in="blur"
                mode="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10"
                result="goo"
              />
              <feComposite in="SourceGraphic" in2="goo" operator="atop" />
            </filter>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2={h + R * 2} gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: "var(--venom-color-2)" }} />
              <stop offset="0.55" style={{ stopColor: "var(--venom-color)" }} />
              <stop offset="1" style={{ stopColor: "var(--venom-color)" }} />
            </linearGradient>
          </defs>
          <g filter={reduced ? undefined : `url(#${filterId})`} fill={`url(#${gradId})`}>
            <rect ref={bodyRef} x={R} y={R} width={w} height={h} rx={rad} ry={rad} />
            {!reduced && (
              <>
                {Array.from({ length: tendrils }, (_, i) => (
                  <circle key={i} ref={(el) => void (tendrilRefs.current[i] = el)} r={0} />
                ))}
                {Array.from({ length: splash }, (_, i) => (
                  <circle key={`d${i}`} ref={(el) => void (dropRefs.current[i] = el)} r={0} />
                ))}
                <circle ref={headRef} r={0} />
              </>
            )}
          </g>
        </svg>
      )}

      <button
        ref={btnRef}
        type="button"
        {...rest}
        onPointerDown={handlePointerDown}
        style={{ borderRadius: radius ?? 9999, ...style }}
        className={cn(
          "venom-btn relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap",
          "h-12 px-7 text-[15px] font-semibold tracking-tight text-[var(--venom-fg)]",
          "outline-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
          // Until measured (SSR / first paint) the button paints its own background.
          !size && "bg-[var(--venom-color)]",
          hideCursor && "cursor-none",
          className,
        )}
      >
        {children}
      </button>
    </span>
  );
});
