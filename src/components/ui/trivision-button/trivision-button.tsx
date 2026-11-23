"use client";

import { useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { Action, type ActionProps } from "@/components/ui/action";
import { cn } from "@/lib/cn";
import "./trivision-button.css";

export type TrivisionButtonProps = ActionProps & {
  /** Face shown while pointed at or focused. Defaults to the label on the accent colour. */
  hover?: ReactNode;
  /** Face shown while pressed. Defaults to an arrow. */
  press?: ReactNode;
  /** Small text on the right of the first face, e.g. the destination path. */
  meta?: ReactNode;
  /** Accessible name, when the faces are not plain text. Defaults to the first face's text. */
  label?: string;
  /** Number of prisms. */
  prisms?: number;
};

/**
 * A trivision billboard as a button: a row of triangular prisms, each carrying a slice of three
 * faces. Pointing at it turns the prisms to the second face, pressing to the third, in a wave that
 * starts where the pointer came in. Only CSS transitions run: no loop, no canvas.
 */
export function TrivisionButton({ children, hover, press, meta, label, prisms = 14, className, style, ...rest }: TrivisionButtonProps) {
  const [face, setFace] = useState(0);
  const [origin, setOrigin] = useState(0);
  const [pressed, setPressed] = useState(false);
  const shown = pressed ? 2 : face;

  const from = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin(Math.max(0, Math.min(prisms - 1, Math.floor(((e.clientX - r.left) / r.width) * prisms))));
  };
  const faces = [
    <>
      <span className="tv-btn__label">{children}</span>
      {meta != null && <span className="tv-btn__meta">{meta}</span>}
    </>,
    hover ?? <span className="tv-btn__label">{children}</span>,
    press ?? (
      <span className="tv-btn__label tv-btn__go" aria-hidden>
        →
      </span>
    ),
  ];

  return (
    <Action
      {...rest}
      className={cn("tv-btn", className)}
      data-face={shown}
      style={{ ...style, "--n": prisms, "--o": origin, "--face": shown } as CSSProperties}
      onPointerEnter={(e) => {
        from(e);
        setFace(1);
      }}
      onPointerLeave={(e) => {
        from(e);
        setFace(0);
        setPressed(false);
      }}
      onPointerDown={(e) => {
        from(e);
        setPressed(true);
      }}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onFocus={(e) => {
        if (!e.currentTarget.matches(":focus-visible")) return;
        setOrigin(0);
        setFace(1);
      }}
      onBlur={() => {
        setFace(0);
        setPressed(false);
      }}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setPressed(true)}
      onKeyUp={() => setPressed(false)}
    >
      {/* the faces are sliced copies: screen readers get the first face once, as text */}
      <span className="sr-only">
        {label ?? (
          <>
            {children}
            {meta != null && <> {meta}</>}
          </>
        )}
      </span>
      <span aria-hidden className="tv-btn__prisms">
        {Array.from({ length: prisms }, (_, i) => (
          <span key={i} className="tv-btn__prism" style={{ "--i": i } as CSSProperties}>
            {faces.map((content, k) => (
              <span key={k} className="tv-btn__face" data-k={k} style={{ "--k": k } as CSSProperties}>
                <span className="tv-btn__art">{content}</span>
              </span>
            ))}
          </span>
        ))}
      </span>
    </Action>
  );
}
