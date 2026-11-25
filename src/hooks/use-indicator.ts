"use client";

import { useLayoutEffect, useRef } from "react";

// a damped spring (ζ = 0.7, about 5 % overshoot) sampled into linear(); older engines ease out
const SPRING =
  "linear(0, 0.071, 0.231, 0.42, 0.6, 0.753, 0.87, 0.952, 1.004, 1.033, 1.045, 1.045, 1.04, 1.032, 1.023, 1.015, 1.009, 1.004, 1.001, 0.999, 0.998, 0.998, 1)";
let easing: string | undefined;
const springEasing = () =>
  (easing ??= typeof CSS !== "undefined" && CSS.supports("transition-timing-function", "linear(0, 1)") ? SPRING : "cubic-bezier(0.22, 1, 0.36, 1)");

/**
 * The "active" indicator of a segmented control or a nav (a pill behind the selected item) that
 * slides from the item it was in to the one it is in now: a shared-layout move with no animation
 * library.
 *
 * Render the indicator inside the active item, absolutely positioned to fill it (`absolute
 * inset-0`, and `pointer-events-none`: while it slides it overlaps the other items), and give it
 * the returned ref. When the active item changes, the indicator animates its
 * `inset` from the old item's box to its own. Both boxes are read in the same frame, so scrolling
 * or a moving container can't skew it, and the rounded ends are never scaled.
 */
export function useIndicator<T extends HTMLElement>(duration = 450) {
  const ref = useRef<T>(null);
  const host = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const item = el?.parentElement ?? null;
    const from = host.current;
    host.current = item;
    if (!el || !item || !from || from === item || !from.isConnected) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = from.getBoundingClientRect();
    const b = item.getBoundingClientRect();
    const start = `${a.top - b.top}px ${b.right - a.right}px ${b.bottom - a.bottom}px ${a.left - b.left}px`;
    el.animate([{ inset: start }, { inset: "0px" }], { duration, easing: springEasing() });
  });

  return ref;
}
