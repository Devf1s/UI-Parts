"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import type { ActionProps } from "../action";
import { ToonButton, type ToonOwnProps } from "./toon-button";
import "./popup.css";

export type PopupButtonProps = ActionProps & ToonOwnProps;

const PETAL = "M5 1.6 6.3 0C9.6 2 10.2 6 5 8.4-.2 6 .4 2 3.7 0Z";
// where each petal starts (px from the left of the cards) and how far it drifts
const PETALS = [
  { x: 6, dx: -16, d: 0 },
  { x: 30, dx: 12, d: 0.25 },
  { x: 52, dx: -8, d: 0.5 },
  { x: 76, dx: 14, d: 0.15 },
  { x: 96, dx: -12, d: 0.4 },
  { x: 64, dx: 6, d: 0.7 },
];

/** One little polaroid: a white frame, a picture, a caption strip. */
function Card({ uid, k, children, bg }: { uid: string; k: number; children: ReactNode; bg: string }) {
  const clip = `${uid}-pic-${k}`;
  return (
    <svg className="pop-card" data-k={k} viewBox="0 0 50 46" style={{ "--k": k } as CSSProperties}>
      <defs>
        <clipPath id={clip}>
          <rect x="6" y="6" width="38" height="27" rx="3" />
        </clipPath>
      </defs>
      <rect className="pop-frame" x="1.5" y="1.5" width="47" height="43" rx="6" />
      <g clipPath={`url(#${clip})`}>
        <rect x="6" y="6" width="38" height="27" fill={bg} />
        {children}
      </g>
      <rect className="pop-pic" x="6" y="6" width="38" height="27" rx="3" />
      <path className="pop-caption" d="M12 39.5h16" />
    </svg>
  );
}

/**
 * Three framed pictures tucked behind the button. Pointing at it makes them spring up and fan out
 * one after another (overshoot and follow-through) while sakura petals drift down over the button;
 * pressing pushes them back; going there throws them up into the air.
 */
export function PopupButton(props: PopupButtonProps) {
  const uid = "pp" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <ToonButton
      variant="popup"
      sfx={{ hover: ["fwip", "fwip", "fwip"], go: "pop" }}
      exitMs={420}
      back={
        <span className="pop-spot" data-testid="popup">
          <Card uid={uid} k={0} bg="#9ad8ff">
            <circle cx="35" cy="14" r="5" fill="#ffd447" stroke="#1b1530" strokeWidth="1.6" />
            <path d="M10 15.5a3.5 3.5 0 0 1 6.5-1.5 3 3 0 0 1 4.5 2.6H10Z" fill="#fff" />
            <path d="M4 34Q14 20 25 28T46 27V36H4Z" fill="#7fd36b" stroke="#1b1530" strokeWidth="1.6" />
          </Card>
          <Card uid={uid} k={1} bg="#3a2f86">
            <circle cx="14" cy="13" r="4.5" fill="#fff3b0" />
            <circle cx="16.4" cy="11.6" r="4" fill="#3a2f86" />
            <path d="M33 10.5h.1M38 16h.1M27 13h.1" stroke="#fff3b0" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M6 34 25 14l19 20Z" fill="#7d8cf0" stroke="#1b1530" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M20.3 19 25 14l4.7 5-2.3-1-2.4 2-2.4-2Z" fill="#fff" stroke="#1b1530" strokeWidth="1.2" strokeLinejoin="round" />
          </Card>
          <Card uid={uid} k={2} bg="#ffe3ef">
            <g transform="translate(25 19.5)" stroke="#1b1530" strokeWidth="1.3" strokeLinejoin="round">
              {[0, 72, 144, 216, 288].map((a) => (
                <path key={a} d="M0 0C-4-3-4-8-1.2-9.6L0-8.2 1.2-9.6C4-8 4-3 0 0Z" fill="#ff8fc7" transform={`rotate(${a})`} />
              ))}
              <circle r="2.4" fill="#ffd447" />
            </g>
          </Card>
        </span>
      }
      front={
        <span className="pop-spot">
          {PETALS.map((p, i) => (
            <svg
              key={i}
              className="pop-petal"
              viewBox="-1 -1 12 11"
              style={{ "--x": `${p.x}px`, "--dx": `${p.dx}px`, "--d": `${p.d}s` } as CSSProperties}
            >
              <path d={PETAL} />
            </svg>
          ))}
        </span>
      }
      {...props}
    />
  );
}
