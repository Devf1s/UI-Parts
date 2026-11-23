"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Action, type ActionProps } from "@/components/ui/action";
import { cn } from "@/lib/cn";
import { createLoop, exposeFx, fitCanvas } from "@/lib/loop";
import { createString, displacement, energy, pluck, silence, stepString, type StringState } from "./string-modes";
import { DEFAULT_NOTES, sound } from "./string-sound";
import "./strings-button.css";

export type StringsButtonProps = ActionProps & {
  /** Small text on the right, e.g. the destination path. */
  meta?: ReactNode;
  /** One string per note, top to bottom, in Hz. Heard only when sound is on (see SoundToggle). */
  notes?: readonly number[];
};

/**
 * A small harp as a button. Sweeping the pointer across the strings plucks each one where it
 * crosses (harder the faster you sweep); a click or a tap plucks the nearest. Each string vibrates
 * as a sum of its standing waves and, with sound on, rings with a Karplus–Strong voice panned to
 * where it was plucked. Nothing runs once the strings are still.
 */
export function StringsButton({ children, meta, className, notes = DEFAULT_NOTES, ...rest }: StringsButtonProps) {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<{ move(e: PointerEvent): void; enter(e: PointerEvent): void; press(e: PointerEvent): void; strum(): void } | null>(null);

  useEffect(() => {
    const el = root.current, c = canvas.current;
    if (!el || !c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const strings: StringState[] = notes.map((_, i) => createString(6.4 - i * 0.55));
    let w = 0, h = 0, dpr = 1;
    const pad = 16;
    let colors = { rest: "#888", live: "#6d28d9", peg: "#888" };
    let last: { x: number; y: number; t: number } | null = null;
    const ys = () => strings.map((_, i) => h * (0.2 + (0.6 * i) / Math.max(1, strings.length - 1)));

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const y0 = ys();
      const span = w - pad * 2;
      strings.forEach((s, i) => {
        const e = energy(s);
        ctx.lineWidth = 1 + i * 0.3;
        ctx.strokeStyle = e > 0.05 ? colors.live : colors.rest;
        ctx.globalAlpha = e > 0.05 ? Math.min(1, 0.55 + e / 6) : 0.55;
        ctx.beginPath();
        for (let k = 0; k <= 48; k++) {
          const x = k / 48;
          const y = y0[i] + displacement(s, x);
          if (k) ctx.lineTo(pad + x * span, y);
          else ctx.moveTo(pad + x * span, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = colors.peg;
        for (const x of [pad, w - pad]) {
          ctx.beginPath();
          ctx.arc(x, y0[i], 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;
    };

    const loop = createLoop((dt) => {
      let total = 0;
      for (const s of strings) {
        stepString(s, dt);
        total += energy(s);
      }
      if (total < 0.02) strings.forEach(silence);
      draw();
      return total >= 0.02;
    });

    const play = (i: number, x: number, amp: number) => {
      const p = (x - pad) / (w - pad * 2);
      if (p <= 0 || p >= 1) return;
      if (!still) pluck(strings[i], p, amp);
      sound.pluck(notes[i], Math.min(1, Math.abs(amp) / 7) * 0.7, (p * 2 - 1) * 0.6);
      loop.wake();
    };

    const read = () => {
      const cs = getComputedStyle(el);
      colors = {
        rest: cs.getPropertyValue("--st-string").trim() || colors.rest,
        live: cs.getPropertyValue("--st-live").trim() || colors.live,
        peg: cs.getPropertyValue("--st-peg").trim() || colors.peg,
      };
    };
    const resize = () => {
      ({ width: w, height: h, dpr } = fitCanvas(c));
      read();
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => loop.visible(e.isIntersecting));
    io.observe(el);
    const mo = new MutationObserver(() => {
      read();
      draw();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const at = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp };
    };
    api.current = {
      enter(e) {
        last = at(e);
      },
      move(e) {
        const p = at(e);
        if (last && p.t > last.t) {
          const vy = ((p.y - last.y) / (p.t - last.t)) * 1000;
          ys().forEach((y, i) => {
            // crossed this string between the last event and this one: pluck where it crossed
            if ((last!.y - y) * (p.y - y) < 0) {
              const u = (y - last!.y) / (p.y - last!.y);
              const amp = Math.sign(vy) * Math.min(7, Math.max(2, Math.abs(vy) * 0.006));
              play(i, last!.x + (p.x - last!.x) * u, amp);
            }
          });
        }
        last = p;
      },
      press(e) {
        const p = at(e);
        last = p;
        const y0 = ys();
        let best = -1, dist = 14;
        y0.forEach((y, i) => Math.abs(p.y - y) < dist && ((dist = Math.abs(p.y - y)), (best = i)));
        if (best >= 0) play(best, p.x, 4.5);
      },
      strum() {
        ys().forEach((_, i) => setTimeout(() => play(i, w * (0.62 + i * 0.04), 3), i * 60));
      },
    };
    exposeFx(c, { running: loop.running, energy: () => strings.reduce((s, x) => s + energy(x), 0) });

    return () => {
      loop.stop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      api.current = null;
    };
  }, [notes]);

  return (
    <Action
      {...rest}
      ref={root}
      className={cn("st-btn", className)}
      onPointerEnter={(e) => api.current?.enter(e.nativeEvent)}
      onPointerMove={(e) => api.current?.move(e.nativeEvent)}
      onPointerDown={(e) => api.current?.press(e.nativeEvent)}
      onFocus={(e) => e.currentTarget.matches(":focus-visible") && api.current?.strum()}
    >
      <canvas ref={canvas} aria-hidden className="st-btn__canvas" data-testid="strings-canvas" />
      <span className="st-btn__label">{children}</span>
      {meta != null && <span className="st-btn__meta">{meta}</span>}
    </Action>
  );
}
