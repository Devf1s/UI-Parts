"use client";

import { useEffect, useId, useRef } from "react";
import { createLoop } from "@/lib/loop";
import type { ActionProps } from "../action";
import { ToonButton, type ToonOwnProps } from "./toon-button";
import { lookOffset, springStep } from "./toon-math";
import "./neko.css";

export type NekoButtonProps = ActionProps & ToonOwnProps;

/** Test hook on the cat's SVG: whether the eye loop runs, and where the left eye looks. */
export type NekoHandle = { running(): boolean; look(): [number, number] };

const EYES = [
  { cx: 34, cy: 45 },
  { cx: 62, cy: 45 },
] as const;
// how far the iris may travel inside the eye white (SVG units = CSS px)
const REACH_X = 3.1;
const REACH_Y = 2.9;

/**
 * A cat peeking over the top of the button. Its anime eyes follow the pointer anywhere on the
 * page (with a springy lag) and blink now and then; pointing at the button makes it pop up and
 * blush, pressing makes it duck with its eyes squeezed shut (> <), and going there turns its eyes
 * into stars: ニャ!
 */
export function NekoButton(props: NekoButtonProps) {
  const cat = useRef<SVGSVGElement>(null);
  const uid = "nk" + useId().replace(/[^a-zA-Z0-9_-]/g, "");

  useEffect(() => {
    const svg = cat.current;
    if (!svg) return;
    const whites = [...svg.querySelectorAll<SVGEllipseElement>(".neko-white")];
    const irises = [...svg.querySelectorAll<SVGGElement>(".neko-iris")];
    const state = EYES.map(() => ({ x: 0, y: 0, vx: 0, vy: 0 }));
    let pointer: { x: number; y: number } | null = null;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");

    const loop = createLoop((dt) => {
      let moving = false;
      whites.forEach((w, i) => {
        const s = state[i];
        let tx = 0, ty = 1; // nobody around: look ahead, a touch down
        if (pointer) {
          const r = w.getBoundingClientRect();
          const o = lookOffset(pointer.x - (r.left + r.width / 2), pointer.y - (r.top + r.height / 2), REACH_X, REACH_Y);
          tx = o.x;
          ty = o.y;
        }
        if (reduce.matches) {
          s.x = tx;
          s.y = ty;
          s.vx = s.vy = 0;
        } else {
          const nx = springStep(s.x, s.vx, tx, dt), ny = springStep(s.y, s.vy, ty, dt);
          s.x = nx.pos;
          s.vx = nx.vel;
          s.y = ny.pos;
          s.vy = ny.vel;
        }
        irises[i]?.setAttribute("transform", `translate(${s.x.toFixed(2)} ${s.y.toFixed(2)})`);
        if (Math.abs(tx - s.x) + Math.abs(ty - s.y) > 0.01 || Math.abs(s.vx) + Math.abs(s.vy) > 0.02) moving = true;
      });
      return moving;
    });

    const onMove = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
      loop.wake();
    };
    const onLeave = () => {
      pointer = null;
      loop.wake();
    };
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerdown", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    addEventListener("blur", onLeave);

    // blinking: every few seconds while the cat is on screen and the tab is visible
    let timer = 0;
    let onScreen = false;
    const blink = () => {
      svg.dataset.blink = "";
      window.setTimeout(() => delete svg.dataset.blink, 120);
      if (Math.random() < 0.25) {
        window.setTimeout(() => (svg.dataset.blink = ""), 240);
        window.setTimeout(() => delete svg.dataset.blink, 350);
      }
      schedule();
    };
    const schedule = () => {
      clearTimeout(timer);
      if (onScreen && !document.hidden && !reduce.matches) timer = window.setTimeout(blink, 2200 + Math.random() * 3800);
    };
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      loop.visible(onScreen);
      if (onScreen) loop.wake();
      schedule();
    });
    io.observe(svg);
    document.addEventListener("visibilitychange", schedule);

    (svg as SVGSVGElement & { __toon?: NekoHandle }).__toon = {
      running: () => loop.running(),
      look: () => [state[0].x, state[0].y],
    };
    return () => {
      loop.stop();
      io.disconnect();
      clearTimeout(timer);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerdown", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      removeEventListener("blur", onLeave);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, []);

  return (
    <ToonButton
      variant="neko"
      sfx={{ hover: "pop", go: "mew" }}
      exitMs={440}
      back={
        <span className="neko-spot">
          <svg ref={cat} className="neko-cat" viewBox="0 0 96 80" data-testid="neko">
            <defs>
              <linearGradient id={`${uid}-iris`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2a1760" />
                <stop offset="0.55" stopColor="#5b3bd6" />
                <stop offset="1" stopColor="#a58bff" />
              </linearGradient>
              {EYES.map((e, i) => (
                <clipPath key={i} id={`${uid}-eye-${i}`}>
                  <ellipse cx={e.cx} cy={e.cy} rx="8.5" ry="10" />
                </clipPath>
              ))}
            </defs>
            <path className="neko-head" d="M10 80V52c0-11 3-19 8-24l1-23 18 14c3.5-1 7-1.4 11-1.4s7.5.4 11 1.4l18-14 1 23c5 5 8 13 8 24v28Z" />
            <path className="neko-patch" d="M19 5l18 14c-4 1-8 4-10 8-3 3-7 3-9 1Z" />
            <path className="neko-ear" d="M22.5 12l1 13 8.5-5.5Z M73.5 12l-1 13-8.5-5.5Z" />
            <path className="neko-line" d="M10 80V52c0-11 3-19 8-24l1-23 18 14c3.5-1 7-1.4 11-1.4s7.5.4 11 1.4l18-14 1 23c5 5 8 13 8 24v28" />
            <g className="neko-blush">
              <ellipse cx="24" cy="58" rx="6.5" ry="3.2" />
              <ellipse cx="72" cy="58" rx="6.5" ry="3.2" />
              <path d="M20 60l2.4-4M23.5 60l2.4-4M27 60l2.4-4M68 60l2.4-4M71.5 60l2.4-4M75 60l2.4-4" />
            </g>
            <path className="neko-whisker" d="M15 54L3 51.5M15 58.5L4 61.5M81 54l12-2.5M81 58.5l11 3" />
            <g className="neko-eyes">
              {EYES.map((e, i) => (
                <g key={i} className="neko-eye">
                  <ellipse className="neko-white" cx={e.cx} cy={e.cy} rx="8.5" ry="10" />
                  <g clipPath={`url(#${uid}-eye-${i})`}>
                    <g className="neko-iris">
                      <ellipse cx={e.cx} cy={e.cy + 0.6} rx="6.4" ry="8" fill={`url(#${uid}-iris)`} />
                      <ellipse cx={e.cx} cy={e.cy + 0.6} rx="2.9" ry="4.4" fill="#140b30" />
                      <circle cx={e.cx - 2.4} cy={e.cy - 3.2} r="2.7" fill="#fff" />
                      <circle cx={e.cx + 2.5} cy={e.cy + 3.6} r="1.2" fill="#fff" />
                    </g>
                  </g>
                  <ellipse className="neko-rim" cx={e.cx} cy={e.cy} rx="8.5" ry="10" />
                  <path className="neko-lash" d={i === 0 ? "M25.6 43.5Q34 31.4 42.6 43.5M26 41.3l-3.6-2.6" : "M53.4 43.5Q62 31.4 70.4 43.5M70 41.3l3.6-2.6"} />
                </g>
              ))}
            </g>
            <path className="neko-squint" d="M28.5 39.5l9 5.5-9 5.5M67.5 39.5l-9 5.5 9 5.5" />
            <path
              className="neko-stars"
              d="M34 35.5l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7Z M62 35.5l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7Z"
            />
            <path className="neko-nose" d="M46 53h4l-2 2.5Z" />
            <path className="neko-mouth" d="M42.5 57q2.7 3.5 5.5.3q2.8 3.2 5.5-.3" />
            <g className="neko-open">
              <path d="M43.2 57.4Q48 67 52.8 57.4Z" />
              <ellipse cx="48" cy="61.8" rx="2.5" ry="1.7" />
            </g>
          </svg>
        </span>
      }
      front={
        <span className="neko-spot">
          <svg className="neko-paws" viewBox="0 0 96 16">
            <path d="M13 15c0-8 4-11 9-11s9 3 9 11M65 15c0-8 4-11 9-11s9 3 9 11" />
            <path className="neko-toes" d="M19 15v-3.6M25 15v-3.6M71 15v-3.6M77 15v-3.6" />
          </svg>
          <span className="toon-sfx neko-nya">ニャ!</span>
        </span>
      }
      {...props}
    />
  );
}
