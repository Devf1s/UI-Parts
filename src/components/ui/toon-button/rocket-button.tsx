"use client";

import type { CSSProperties } from "react";
import type { ActionProps } from "../action";
import { ToonButton, type ToonOwnProps } from "./toon-button";
import "./rocket.css";

export type RocketButtonProps = ActionProps & ToonOwnProps;

const STAR = "M0-5C.5-1.5 1.5-.5 5 0 1.5.5.5 1.5 0 5-.5 1.5-1.5.5-5 0-1.5-.5-.5-1.5 0-5Z";
const STARS = [
  { x: "58%", y: "22%", s: 0.9, d: 0 },
  { x: "70%", y: "70%", s: 0.7, d: 0.3 },
  { x: "49%", y: "64%", s: 0.6, d: 0.6 },
  { x: "88%", y: "16%", s: 0.75, d: 0.45 },
  { x: "64%", y: "44%", s: 0.5, d: 0.15 },
];
// smoke puffs: where each one drifts (px) and when it starts in the loop
const PUFFS = [
  { dx: -34, dy: -4, s: 1, d: 0 },
  { dx: 30, dy: -2, s: 0.9, d: 0.18 },
  { dx: -18, dy: 2, s: 0.75, d: 0.36 },
  { dx: 20, dy: 4, s: 0.8, d: 0.54 },
  { dx: -46, dy: 0, s: 0.65, d: 0.72 },
];
// anime speed lines (x %, length %, offset %) streaming past while it lifts off
const SPEED = [
  [8, 30, 0],
  [17, 46, 40],
  [27, 24, 70],
  [36, 38, 15],
  [45, 28, 55],
  [54, 44, 30],
  [63, 22, 80],
  [72, 36, 5],
  [81, 26, 60],
  [90, 40, 25],
] as const;

/**
 * A little rocket standing on the button. Pointing at it starts the countdown: it rumbles
 * (ゴゴゴ), the flame flickers and smoke puffs roll out of its base; going there squashes it for a
 * beat (anticipation) and launches it out of frame while speed lines stream past the button.
 */
export function RocketButton(props: RocketButtonProps) {
  return (
    <ToonButton
      variant="rocket"
      sfx={{ hover: "rumble", go: "whoosh" }}
      exitMs={480}
      inside={
        <>
          {STARS.map((s, i) => (
            <svg
              key={i}
              className="rk-star"
              viewBox="-6 -6 12 12"
              style={{ left: s.x, top: s.y, "--s": s.s, "--d": `${s.d}s` } as CSSProperties}
            >
              <path d={STAR} />
            </svg>
          ))}
          <svg className="rk-speed" viewBox="0 0 100 100" preserveAspectRatio="none">
            {[0, 100].map((o) => (
              <g key={o} transform={`translate(0 ${-o})`}>
                {SPEED.map(([x, len, off], i) => (
                  <path key={i} d={`M${x} ${off}v${len}`} />
                ))}
              </g>
            ))}
          </svg>
        </>
      }
      front={
        <span className="rk-spot" data-testid="rocket">
          {PUFFS.map((p, i) => (
            <span
              key={i}
              className="rk-puff"
              style={{ "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, "--s": p.s, "--d": `${p.d}s` } as CSSProperties}
            />
          ))}
          <svg className="rk-rocket" viewBox="0 0 44 92">
            <g className="rk-flame">
              <path d="M22 68c-7 8-6.5 16 0 24 6.5-8 7-16 0-24Z" fill="#ff7a3d" />
              <path d="M22 72c-3.6 5-3.4 10 0 15 3.4-5 3.6-10 0-15Z" fill="#ffd447" />
            </g>
            <path className="rk-fin" d="M11 50 2 64v8l10-5ZM33 50l9 14v8l-10-5Z" />
            <path className="rk-body" d="M22 4c10 8 13 24 12 42l-1 21H11l-1-21C9 28 12 12 22 4Z" />
            <path className="rk-nose" d="M22 4c6.5 5 9.6 11 10.6 18H11.4C12.4 15 15.5 9 22 4Z" />
            <circle className="rk-window" cx="22" cy="36" r="6.5" />
            <path d="M18.6 33.4a4.4 4.4 0 0 1 4-2" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
            <path className="rk-fin" d="M19.6 54h4.8v15h-4.8Z" />
            <rect className="rk-nozzle" x="14" y="66" width="16" height="4.5" rx="1.6" />
          </svg>
          <span className="toon-sfx rk-go" data-k="0">
            ゴ
          </span>
          <span className="toon-sfx rk-go" data-k="1">
            ゴ
          </span>
          <span className="toon-sfx rk-go" data-k="2">
            ゴ
          </span>
        </span>
      }
      {...props}
    />
  );
}
