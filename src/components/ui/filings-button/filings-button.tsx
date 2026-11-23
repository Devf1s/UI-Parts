"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Action, type ActionProps } from "@/components/ui/action";
import { cn } from "@/lib/cn";
import { createLoop, exposeFx, fitCanvas } from "@/lib/loop";
import { align, scatter, strength, type Filings, type Pole } from "./filings-field";
import "./filings-button.css";

export type FilingsButtonProps = ActionProps & {
  /** Small text on the right, e.g. the destination path. */
  meta?: ReactNode;
  /** Distance between filings, CSS px. */
  spacing?: number;
  /** Strength of the pointer's pole relative to the magnet's. */
  pull?: number;
};

/**
 * A bar magnet under a sheet of paper sprinkled with iron filings. The filings settle along the
 * magnet's field lines when the button first shows up; the pointer is a second magnet that bends
 * them as it moves, and pressing flips its pole. Needles only turn, so it settles fast, and the
 * loop stops once every filing has lined up.
 */
export function FilingsButton({ children, meta, className, spacing = 8, pull = 1.6, ...rest }: FilingsButtonProps) {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<{ move(e: PointerEvent): void; leave(): void; press(e: PointerEvent): void; focus(on: boolean): void } | null>(null);

  useEffect(() => {
    const el = root.current, c = canvas.current;
    if (!el || !c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let filings: Filings = new Float32Array(0);
    let mask = new Float32Array(0);
    let poles: Pole[] = [];
    let magnet: Pole[] = [];
    let w = 0, h = 0, dpr = 1;
    let ink = "#111";
    let cursor: Pole | null = null;
    let sign = 1;
    let worst = Math.PI;

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = ink;
      ctx.lineCap = "round";
      ctx.lineWidth = 1.15;
      // three shades in three paths: strong field reads darker, like filings piling up at the poles
      for (const [lo, hi, alpha] of [
        [0, 0.33, 0.32],
        [0.33, 0.66, 0.55],
        [0.66, 1.01, 0.85],
      ] as const) {
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        for (let k = 0, f = 0; k < filings.length; k += 4, f++) {
          const m = mask[f];
          if (m <= 0) continue;
          const s = strength(filings[k], filings[k + 1], poles) * m;
          if (s < lo || s >= hi) continue;
          const l = filings[k + 2] * (0.6 + 0.4 * s) * 0.5;
          const dx = Math.cos(filings[k + 3]) * l, dy = Math.sin(filings[k + 3]) * l;
          ctx.moveTo(filings[k] - dx, filings[k + 1] - dy);
          ctx.lineTo(filings[k] + dx, filings[k + 1] + dy);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const setPoles = () => (poles = cursor ? [...magnet, cursor] : magnet);
    const loop = createLoop((dt) => {
      worst = align(filings, poles, dt);
      draw();
      return worst > 0.0015;
    });
    const settle = () => {
      if (!still) return loop.wake();
      for (let i = 0; i < 400 && align(filings, poles, 1 / 30) > 1e-3; i++);
      draw();
    };

    const resize = () => {
      ({ width: w, height: h, dpr } = fitCanvas(c));
      if (!w || !h) return;
      const cap = parseFloat(getComputedStyle(el).getPropertyValue("--fl-cap")) || 22;
      const q = h * 0.55;
      magnet = [
        { x: cap / 2, y: h / 2, q: -q },
        { x: w - cap / 2, y: h / 2, q },
      ];
      setPoles();
      filings = scatter(w, h, spacing, 7);
      // keep the label readable: no filings on the text, fewer right around it
      const r0 = el.getBoundingClientRect();
      const boxes = [...el.querySelectorAll<HTMLElement>("[data-fl-text]")].map((t) => {
        const r = t.getBoundingClientRect();
        return [r.left - r0.left, r.top - r0.top, r.right - r0.left, r.bottom - r0.top];
      });
      mask = new Float32Array(filings.length / 4);
      for (let k = 0, f = 0; k < filings.length; k += 4, f++) {
        let m = 1;
        for (const [x0, y0, x1, y1] of boxes) {
          const dx = Math.max(x0 - filings[k], 0, filings[k] - x1), dy = Math.max(y0 - filings[k + 1], 0, filings[k + 1] - y1);
          m = Math.min(m, Math.max(0, Math.min(1, (Math.hypot(dx, dy) - 3) / 10)));
        }
        // and none under the end caps
        if (filings[k] < cap + 2 || filings[k] > w - cap - 2) m = 0;
        mask[f] = m;
      }
      ink = getComputedStyle(el).getPropertyValue("--fl-ink").trim() || ink;
      settle();
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const io = new IntersectionObserver(([e]) => {
      loop.visible(e.isIntersecting);
      if (e.isIntersecting && worst > 0.0015) loop.wake();
    });
    io.observe(el);
    const mo = new MutationObserver(() => {
      ink = getComputedStyle(el).getPropertyValue("--fl-ink").trim() || ink;
      draw();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const at = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    api.current = {
      move(e) {
        cursor = { ...at(e), q: magnet[1].q * pull * sign };
        setPoles();
        settle();
      },
      leave() {
        cursor = null;
        setPoles();
        settle();
      },
      press(e) {
        sign = -sign;
        el.dataset.pole = sign > 0 ? "n" : "s";
        cursor = { ...at(e), q: magnet[1].q * pull * sign };
        setPoles();
        settle();
      },
      focus(on) {
        cursor = on ? { x: w * 0.5, y: h * 0.5, q: magnet[1].q * pull * sign } : null;
        setPoles();
        settle();
      },
    };
    exposeFx(c, { running: loop.running, energy: () => worst });

    return () => {
      loop.stop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      api.current = null;
    };
  }, [spacing, pull]);

  return (
    <Action
      {...rest}
      ref={root}
      data-pole="n"
      className={cn("fl-btn", className)}
      onPointerMove={(e) => api.current?.move(e.nativeEvent)}
      onPointerLeave={() => api.current?.leave()}
      onPointerDown={(e) => api.current?.press(e.nativeEvent)}
      onFocus={(e) => e.currentTarget.matches(":focus-visible") && api.current?.focus(true)}
      onBlur={() => api.current?.focus(false)}
    >
      <canvas ref={canvas} aria-hidden className="fl-btn__canvas" data-testid="filings-canvas" />
      <span aria-hidden className="fl-btn__cap fl-btn__cap--s">S</span>
      <span aria-hidden className="fl-btn__cap fl-btn__cap--n">N</span>
      <span className="fl-btn__label" data-fl-text>
        {children}
      </span>
      {meta != null && (
        <span className="fl-btn__meta" data-fl-text>
          {meta}
        </span>
      )}
    </Action>
  );
}
