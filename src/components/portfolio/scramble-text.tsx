"use client";

import { useEffect, useRef, type ElementType } from "react";
import { cn } from "@/lib/cn";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/\\";

/**
 * Text that "decodes" from random glyphs: once when it scrolls into view and again on hover of
 * its parent (or `hostSelector`). The real text stays in the DOM for layout, selection and screen
 * readers; the scrambled copy is an aria-hidden overlay, so nothing shifts. No rAF while idle.
 */
export function ScrambleText({
  text,
  as: Tag = "span",
  className,
  duration = 700,
  hover = true,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  hover?: boolean;
}) {
  const overlay = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = overlay.current, host = root.current?.parentElement;
    if (!el || !root.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let start = 0;
    const chars = [...text];
    const play = () => {
      cancelAnimationFrame(raf);
      start = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - start) / duration);
        // letters lock in left to right; spaces never scramble
        el.textContent = chars
          .map((c, i) => (c === " " || i / chars.length < k * 1.15 - 0.15 ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
          .join("");
        if (k < 1) raf = requestAnimationFrame(tick);
        else el.textContent = text;
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        play();
        io.disconnect();
      }
    });
    io.observe(root.current);
    const fine = window.matchMedia("(hover: hover)").matches;
    if (hover && fine && host) host.addEventListener("pointerenter", play);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      host?.removeEventListener("pointerenter", play);
    };
  }, [text, duration, hover]);

  return (
    <Tag ref={root} className={cn("relative inline-block whitespace-nowrap", className)}>
      <span className="invisible">{text}</span>
      <span ref={overlay} aria-hidden className="absolute inset-0">
        {text}
      </span>
      {/* the invisible copy is not read by screen readers, this one is */}
      <span className="sr-only">{text}</span>
    </Tag>
  );
}
