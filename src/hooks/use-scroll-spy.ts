"use client";

import { useEffect, useState } from "react";

/**
 * Returns the id of the section that currently crosses a line 30% down the viewport.
 * The last section is often too short to ever reach that line, so it also wins whenever it is
 * fully on screen (i.e. the page is scrolled to the bottom).
 */
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
    const last = els[els.length - 1];
    let middle = els[0].id;
    let atEnd = false;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) middle = hit.target.id;
        if (!atEnd) setActive(middle);
      },
      // a thin line 30% down the viewport: a section clicked in the nav (scrolled to the top)
      // always covers it, even when it is shorter than half a screen
      { rootMargin: "-30% 0px -69% 0px" },
    );
    const end = new IntersectionObserver(
      ([e]) => {
        atEnd = e.intersectionRatio > 0.98;
        setActive(atEnd ? last.id : middle);
      },
      { threshold: [0.98] },
    );
    els.forEach((el) => io.observe(el));
    end.observe(last);
    return () => {
      io.disconnect();
      end.disconnect();
    };
  }, [key]);

  return [active, setActive] as const;
}
