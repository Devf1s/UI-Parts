"use client";

import type { ActionProps } from "../action";
import { ToonButton, type ToonOwnProps } from "./toon-button";
import { burst } from "./toon-math";
import "./boxer.css";

export type BoxerButtonProps = ActionProps & ToonOwnProps;

const POW = burst(5, 13, 30, 52);
const STAR5 = "M0-7 2 -2.2 7.2-2.2 3-.9 4.4 5.2 0 2.4-4.4 5.2-3-.9-7.2-2.2-2-2.2Z";

/**
 * A jack-in-the-box on the button. Pointing at it flips the lid and a boxing glove on a spring
 * boings out and wobbles; pressing squashes it back down; going there throws a punch with a
 * manga impact burst (POW! ドン!) and shakes the whole button.
 */
export function BoxerButton(props: BoxerButtonProps) {
  return (
    <ToonButton
      variant="boxer"
      sfx={{ hover: "boing", go: "pow" }}
      exitMs={460}
      front={
        <span className="bx-spot" data-testid="boxer">
          <span className="bx-well">
            <svg className="bx-jack" viewBox="0 0 44 92">
              <g className="bx-spring">
                <path d="M22 44 14 49l16 6-16 6 16 6-16 6 16 6-16 6 8 3" />
                <path className="bx-shine" d="M22 44 14 49l16 6-16 6 16 6-16 6 16 6-16 6 8 3" />
              </g>
              <g className="bx-glove">
                <path className="bx-red" d="M8.5 31C3 23 4 9.5 15 5.5c9-3 20 0 23 9 3 8 1 17-5 20.5H12Z" />
                <path className="bx-red" d="M9 27.5c-6-2-7-10-1-13 3-1 5 2 4.6 5Z" />
                <path className="bx-crease" d="M20.5 10.5c3 3 3 9 .8 13M27 12c1.8 2.4 2 6 .4 9" />
                <ellipse cx="25.5" cy="10" rx="5" ry="2.2" fill="#fff" opacity="0.85" transform="rotate(-18 25.5 10)" />
                <rect className="bx-cuff" x="12" y="32" width="22" height="11" rx="2.6" />
                <path d="M12.6 37.5h20.8" stroke="#ff4d5e" strokeWidth="2.2" />
              </g>
            </svg>
          </span>
          <svg className="bx-box" viewBox="0 0 62 50">
            <path className="bx-crank" d="M53 30h5v-9" />
            <circle className="bx-knob" cx="58" cy="18.5" r="3.4" />
            <rect className="bx-front" x="3" y="13" width="50" height="35" rx="4" />
            <path className="bx-stripe" d="M3 21h50" />
            <path className="bx-star" d={STAR5} transform="translate(28 34) scale(1.3)" />
            <circle cx="12" cy="40" r="2" fill="#ffd447" />
            <circle cx="44" cy="28" r="2" fill="#ffd447" />
            <g className="bx-lid">
              <rect x="1" y="6" width="54" height="10" rx="3.5" />
              <path d="M10 11h36" stroke="#ffd447" strokeWidth="2" strokeLinecap="round" strokeDasharray="0.1 6" />
            </g>
          </svg>
          <span className="bx-pow">
            <svg viewBox="-64 -48 128 96">
              <path d={POW} />
              <text x="0" y="9" textAnchor="middle">
                POW!
              </text>
            </svg>
            <span className="toon-sfx bx-don">ドン!</span>
          </span>
        </span>
      }
      {...props}
    />
  );
}
