"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Action, type ActionProps } from "../action";
import { focusLines } from "./toon-math";
import { sound, type Sfx } from "./toon-sound";
import "./toon.css";

export type ToonOwnProps = {
  /** Small text under the label, e.g. the destination path. */
  meta?: ReactNode;
  /** Fill colour of the button (any CSS colour). Defaults to the variant's colour. */
  tone?: string;
  /** Position in a list: staggers the entrance (0, 1, 2…). */
  index?: number;
};

type ToonButtonProps = ActionProps &
  ToonOwnProps & {
    /** Variant name, for styling (`data-toon`). */
    variant: string;
    /** Decorative art: behind the button, inside it (under the label) and in front of it. */
    back?: ReactNode;
    inside?: ReactNode;
    front?: ReactNode;
    /** How long the exit gag plays before a link navigates, ms. */
    exitMs?: number;
    sfx?: { hover?: Sfx | Sfx[]; press?: Sfx; go?: Sfx | Sfx[] };
  };

// two sets of manga focus lines, swapped every couple of frames so they flicker like a cel
const LINES_A = focusLines(7, 46, 560, 170);
const LINES_B = focusLines(19, 46, 560, 170);
const SPARKLE = "M0 -10C1 -3 3 -1 10 0C3 1 1 3 0 10C-1 3 -3 1 -10 0C-3 -1 -1 -3 0 -10Z";

const play = (s?: Sfx | Sfx[]) => (Array.isArray(s) ? s : s ? [s] : []).forEach((x, i) => sound.play(x, i * 0.07));
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The shared body of the toon buttons: a thick-outlined, hard-shadowed cartoon button that drops in
 * with squash and stretch, wobbles like jelly when pointed at, squashes when pressed and, when it is
 * a link, plays a short exit gag (focus lines, the character's own move) before navigating. The
 * characters are passed in as decorative art; their moves are CSS keyed off `data-hover`,
 * `data-press` and `data-go`. Reduced motion: no entrance, no wobble, links navigate at once.
 */
export function ToonButton(props: ToonButtonProps) {
  const {
    variant,
    meta,
    tone,
    index = 0,
    back,
    inside,
    front,
    exitMs = 420,
    sfx,
    className,
    style,
    children,
    onClick,
    onPointerEnter,
    onPointerLeave,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onFocus,
    onBlur,
    onKeyDown,
    onKeyUp,
    ...rest
  } = props;
  const router = useRouter();
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const [go, setGo] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const enter = () => {
    if (!hover) play(sfx?.hover);
    setHover(true);
  };

  const handleClick = (e: MouseEvent<HTMLElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || go) return;
    const href = rest.href;
    const plain = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
    const internal = href !== undefined && !/^(https?:|mailto:)/.test(href) && !("target" in rest && rest.target === "_blank");
    if (reducedMotion() || !plain) return;
    play(sfx?.go);
    setGo(true);
    if (internal) {
      // the gag plays, then the page changes (the route was prefetched on hover or focus)
      e.preventDefault();
      router.prefetch(href);
      later(() => router.push(href), exitMs);
    }
    later(() => setGo(false), internal ? exitMs + 1500 : exitMs + 200);
  };

  return (
    <Action
      {...(rest as ActionProps)}
      className={cn("toon", className)}
      data-toon={variant}
      data-hover={hover || undefined}
      data-press={press || undefined}
      data-go={go || undefined}
      style={{ ...style, ...(tone ? { "--toon-fill": tone } : null), "--i": index } as CSSProperties}
      onClick={handleClick}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") enter();
        onPointerEnter?.(e);
      }}
      onPointerLeave={(e) => {
        setHover(false);
        setPress(false);
        onPointerLeave?.(e);
      }}
      onPointerDown={(e) => {
        if (e.button === 0) {
          if (e.pointerType === "touch") enter();
          setPress(true);
          play(sfx?.press);
        }
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        setPress(false);
        onPointerUp?.(e);
      }}
      onPointerCancel={(e) => {
        setPress(false);
        setHover(false);
        onPointerCancel?.(e);
      }}
      onFocus={(e) => {
        if (e.currentTarget.matches(":focus-visible")) enter();
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setHover(false);
        setPress(false);
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setPress(true);
        onKeyDown?.(e);
      }}
      onKeyUp={(e) => {
        setPress(false);
        onKeyUp?.(e);
      }}
    >
      <span className="toon__lines" aria-hidden>
        <svg viewBox="0 0 560 170" preserveAspectRatio="none">
          <path className="toon__lines-a" d={LINES_A} />
          <path className="toon__lines-b" d={LINES_B} />
        </svg>
      </span>
      <span className="toon__back" aria-hidden>
        {back}
      </span>
      <span className="toon__body">
        {inside && (
          <span className="toon__inside" aria-hidden>
            {inside}
          </span>
        )}
        <span className="toon__text">
          <span className="toon__label">{children}</span>
          {meta != null && <span className="toon__meta"> {meta}</span>}
        </span>
      </span>
      <span className="toon__front" aria-hidden>
        {front}
      </span>
      <span className="toon__sparkles" aria-hidden>
        {[0, 1, 2].map((k) => (
          <svg key={k} className="toon__sparkle" data-k={k} viewBox="-11 -11 22 22">
            <path d={SPARKLE} />
          </svg>
        ))}
      </span>
    </Action>
  );
}
