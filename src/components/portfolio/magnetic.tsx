"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Pulls its child toward the pointer while the pointer is within `radius` px of it, then springs
 * back. Only on devices with a fine pointer and without reduced motion; transform-only.
 */
export function Magnetic({
  children,
  strength = 0.35,
  radius = 80,
  className,
}: {
  children: ReactNode;
  strength?: number;
  radius?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ok = window.matchMedia("(hover: hover) and (pointer: fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!ok) return;
    let raf = 0;
    let x = 0, y = 0, tx = 0, ty = 0;
    let rect: DOMRect | null = null;
    const tick = () => {
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.1 ? requestAnimationFrame(tick) : 0;
      if (!raf) el.style.transform = tx || ty ? el.style.transform : "";
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      rect ??= el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2 - x, cy = rect.top + rect.height / 2 - y;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      const reach = Math.max(rect.width, rect.height) / 2 + radius;
      const inside = Math.hypot(dx, dy) < reach;
      const nx = inside ? dx * strength : 0, ny = inside ? dy * strength : 0;
      if (nx !== tx || ny !== ty) {
        tx = nx;
        ty = ny;
        kick();
      }
    };
    const invalidate = () => (rect = null);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", invalidate, { passive: true });
    window.addEventListener("resize", invalidate);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", invalidate);
      window.removeEventListener("resize", invalidate);
    };
  }, [strength, radius]);

  return (
    <span ref={ref} className={cn("inline-block will-change-transform", className)}>
      {children}
    </span>
  );
}
