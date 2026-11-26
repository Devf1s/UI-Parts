"use client";

import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

const loadFeatures = () => import("@/lib/motion-features").then((m) => m.default);

/**
 * Motion for the subtree that animates with it (the lab's sidebar, the Gallery's reflowing grid).
 * Scoped instead of app-wide so that pages without it don't download Motion at all. `strict` makes
 * a stray `motion.*` (which would bundle every feature eagerly) fail loudly: use `m.*`.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    // reducedMotion="user" turns transform animations off when the OS asks for less motion
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
