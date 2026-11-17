"use client";

import { useEffect, useState } from "react";

/** Returns the id of the section that currently sits in the middle band of the viewport. */
export function useScrollSpy(ids: string[], initial = ids[0]) {
  const [active, setActive] = useState(initial);
  const key = ids.join("|");

  useEffect(() => {
    const els = key
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length) return;

    // IntersectionObserver: no scroll listeners, no layout reads on the main thread.
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);

  return [active, setActive] as const;
}
