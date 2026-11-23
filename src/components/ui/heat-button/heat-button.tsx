"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Action, type ActionProps } from "@/components/ui/action";
import { cn } from "@/lib/cn";
import { createLoop, exposeFx } from "@/lib/loop";
import { celsius, createHeatField, HEAT_DEFAULTS, ironbow, splat, stepHeat, type HeatField } from "./heat-field";
import "./heat-button.css";

export type HeatButtonProps = ActionProps & {
  /** Small text on the right, e.g. the destination path. */
  meta?: ReactNode;
  /** Size of one simulation cell in CSS px. Smaller is finer and costs more. */
  cell?: number;
  /** How fast rubbing warms it up. Moving faster rubs harder. */
  warmth?: number;
  /** Show the camera's spot-temperature readout and crosshair. */
  readout?: boolean;
};

const parseRGB = (css: string, fallback: [number, number, number]): [number, number, number] => {
  const m = css.match(/\d+(\.\d+)?/g);
  return m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : fallback;
};

/**
 * A button seen through a thermal camera. The pointer rubs heat into the surface (faster moves rub
 * harder), the heat spreads, drifts upwards like warm air and cools off; a click is a hot press.
 * The readout tracks the hottest spot. A small cell grid is simulated and stretched by the GPU,
 * and the loop stops as soon as the surface is back to room temperature.
 */
export function HeatButton({ children, meta, className, cell = 8, warmth = 1, readout = true, ...rest }: HeatButtonProps) {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const spot = useRef<HTMLSpanElement>(null);
  const temp = useRef<HTMLSpanElement>(null);
  const api = useRef<{ move(e: PointerEvent): void; leave(): void; press(e: PointerEvent): void; focus(on: boolean): void } | null>(null);

  useEffect(() => {
    const el = root.current, c = canvas.current;
    if (!el || !c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let field: HeatField = createHeatField(1, 1);
    // what the camera sees before anyone touches it: a faint glow from the "electronics" in one
    // corner and from the label, so it reads as a thermal image at rest (and costs nothing)
    let ambient = new Float32Array(1);
    let img: ImageData | null = null;
    let px: Uint32Array | null = null;
    let lut = ironbow();
    let w = 0, h = 0;
    const pointer = { x: 0, y: 0, in: false, speed: 0, t: 0 };
    let focused = false;
    let shownTemp = "";

    const paint = () => {
      if (!img || !px) return;
      const t = field.t;
      let max = 0, at = 0;
      for (let i = 0; i < t.length; i++) {
        const v = t[i] + ambient[i];
        px[i] = lut[Math.min(255, (v * 230) | 0)];
        if (v > max) [max, at] = [v, i];
      }
      ctx.putImageData(img, 0, 0);
      const v = celsius(max).toFixed(1) + "°";
      if (temp.current && v !== shownTemp) temp.current.textContent = shownTemp = v;
      if (spot.current) {
        const x = ((at % field.cols) + 0.5) / field.cols, y = (Math.floor(at / field.cols) + 0.5) / field.rows;
        spot.current.style.transform = `translate(${(x * w).toFixed(1)}px, ${(y * h).toFixed(1)}px)`;
        spot.current.style.opacity = field.max > 0.05 ? "1" : "0";
      }
      el.style.setProperty("--heat", Math.min(1, field.max).toFixed(2));
    };

    const loop = createLoop((dt) => {
      if (pointer.in) {
        // friction: a still hand warms slowly, rubbing warms fast
        const rub = 4 + Math.min(pointer.speed, 2400) / 200;
        splat(field, pointer.x, pointer.y, 1.6, dt * rub * warmth);
        pointer.speed *= Math.exp(-dt * 8);
      }
      if (focused) splat(field, field.cols * 0.5, field.rows * 0.75, 2.2, dt * 1.1 * warmth);
      stepHeat(field, dt, HEAT_DEFAULTS);
      paint();
      return pointer.in || focused || field.max > 0.004;
    });

    const resize = () => {
      const r = el.getBoundingClientRect();
      w = r.width;
      h = r.height;
      const cols = Math.max(8, Math.round(w / cell)), rows = Math.max(4, Math.round(h / cell));
      if (cols === field.cols && rows === field.rows) return;
      field = createHeatField(cols, rows);
      ambient = new Float32Array(cols * rows);
      const r0 = el.getBoundingClientRect();
      const lr = el.querySelector(".heat-btn__label")?.getBoundingClientRect();
      const box = lr
        ? [(lr.left - r0.left) / cell, (lr.top - r0.top) / cell, (lr.right - r0.left) / cell, (lr.bottom - r0.top) / cell]
        : [0, 0, 0, 0];
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const x = (i + 0.5) / cols, y = (j + 0.5) / rows;
          const corner = Math.exp(-((x - 0.86) ** 2) / 0.03 - ((y - 1) ** 2) / 0.25);
          const dx = Math.max(box[0] - i - 0.5, 0, i + 0.5 - box[2]), dy = Math.max(box[1] - j - 0.5, 0, j + 0.5 - box[3]);
          const label = Math.exp(-(dx * dx + dy * dy) / 6) * (0.6 + 0.4 * Math.sin(i * 0.9) ** 2);
          ambient[j * cols + i] = 0.05 + 0.2 * corner + 0.07 * label + 0.03 * y;
        }
      }
      c.width = cols;
      c.height = rows;
      img = ctx.createImageData(cols, rows);
      px = new Uint32Array(img.data.buffer);
      lut = ironbow(parseRGB(getComputedStyle(el).getPropertyValue("--heat-cold"), [12, 10, 34]));
      if (still) {
        // reduced motion: one warm print, no loop
        splat(field, cols * 0.7, rows * 0.7, rows * 0.35, 0.8);
        stepHeat(field, 1 / 60);
      }
      paint();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const io = new IntersectionObserver(([e]) => loop.visible(e.isIntersecting));
    io.observe(el);
    const mo = new MutationObserver(() => {
      lut = ironbow(parseRGB(getComputedStyle(el).getPropertyValue("--heat-cold"), [12, 10, 34]));
      paint();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const toCells = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * field.cols, ((e.clientY - r.top) / r.height) * field.rows];
    };
    api.current = still
      ? null
      : {
          move(e) {
            const [x, y] = toCells(e);
            const now = e.timeStamp;
            if (pointer.in && now > pointer.t) {
              const d = Math.hypot((x - pointer.x) * cell, (y - pointer.y) * cell);
              pointer.speed = Math.max(pointer.speed, (d / (now - pointer.t)) * 1000);
            }
            Object.assign(pointer, { x, y, in: true, t: now });
            loop.wake();
          },
          leave() {
            pointer.in = false;
            loop.wake();
          },
          press(e) {
            const [x, y] = toCells(e);
            splat(field, x, y, 2.4, 1.3 * warmth);
            Object.assign(pointer, { x, y, in: e.pointerType === "mouse" || pointer.in, t: e.timeStamp });
            loop.wake();
          },
          focus(on) {
            focused = on;
            loop.wake();
          },
        };
    exposeFx(c, { running: loop.running, energy: () => field.max });

    return () => {
      loop.stop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      api.current = null;
    };
  }, [cell, warmth]);

  return (
    <Action
      {...rest}
      ref={root}
      className={cn("heat-btn", className)}
      onPointerMove={(e) => api.current?.move(e.nativeEvent)}
      onPointerLeave={() => api.current?.leave()}
      onPointerDown={(e) => api.current?.press(e.nativeEvent)}
      onFocus={(e) => e.currentTarget.matches(":focus-visible") && api.current?.focus(true)}
      onBlur={() => api.current?.focus(false)}
    >
      <canvas ref={canvas} aria-hidden className="heat-btn__img" data-testid="heat-canvas" />
      <span aria-hidden className="heat-btn__scan" />
      {readout && (
        <>
          <span aria-hidden className="heat-btn__spot" ref={spot} />
          <span aria-hidden className="heat-btn__temp" ref={temp}>
            22.0°
          </span>
        </>
      )}
      <span className="heat-btn__label">{children}</span>
      {meta != null && <span className="heat-btn__meta">{meta}</span>}
    </Action>
  );
}
