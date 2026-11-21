"use client";

import { useEffect, useRef } from "react";
import { useGLScene } from "@/lib/gl/use-gl-scene";
import { createInkScene, type InkScene } from "./ink-scene";

/**
 * The hero's living ink. Sits behind the hero content; the section itself paints a CSS stand-in
 * (`.sym-ink-fallback`) until the first WebGL frame, and keeps it if WebGL2 is unavailable.
 */
export function InkCanvas({ hostId }: { hostId: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, ctl] = useGLScene<InkScene>(
    canvas,
    (env) => createInkScene(env, () => document.getElementById(hostId)),
    { ambient: true, maxDpr: 1.5, scale: 0.75, stillTime: 6 },
  );

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let rect = el.getBoundingClientRect();
    const refresh = () => (rect = el.getBoundingClientRect());
    const onMove = (e: PointerEvent) => {
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const inside = x >= -40 && y >= -40 && x <= rect.width + 40 && y <= rect.height + 40;
      ctl.scene.current?.pointer(inside ? x : null, y);
      if (inside) ctl.wake(1500);
    };
    const onLeave = () => ctl.scene.current?.pointer(null);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", refresh, { passive: true });
    window.addEventListener("resize", refresh);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", refresh);
      window.removeEventListener("resize", refresh);
    };
  }, [ctl]);

  return (
    <canvas
      ref={canvas}
      aria-hidden
      data-status={status}
      data-testid="ink-canvas"
      className="pf-gl pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
