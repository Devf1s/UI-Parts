"use client";

import { ArrowUpRight } from "lucide-react";
import { m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { MotionProvider } from "@/components/motion-provider";
import { useMounted } from "@/hooks/use-media-query";
import { byCategory, CATEGORIES, hostOf, languageColor, type Category, type Project } from "@/data/portfolio";
import { cn } from "@/lib/cn";
import { useGLScene } from "@/lib/gl/use-gl-scene";
import { coverStyle } from "../cover";
import { createPlanesScene, type PlanesScene } from "./planes-scene";

type Filter = Category | "all";

/**
 * Filterable editorial grid. Covers are drawn by one fixed WebGL canvas that tracks the DOM boxes
 * (so filtering animates with Motion's layout animations and WebGL follows); the CSS covers stay
 * underneath as the fallback. A "View" cursor follows the mouse over the cards.
 */
export function ProjectGrid(props: { projects: Project[] }) {
  return (
    <MotionProvider>
      <Grid {...props} />
    </MotionProvider>
  );
}

function Grid({ projects }: { projects: Project[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  // server HTML and the first paint show every card as is; only later changes animate in
  const mounted = useMounted();
  const shown = byCategory(filter, projects);
  const section = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const boxes = useRef(new Map<string, HTMLElement>());
  const [status, ctl] = useGLScene<PlanesScene>(canvas, createPlanesScene, {
    ambient: true,
    maxDpr: 2,
    observe: section,
    stillTime: 3,
  });

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: projects.length },
    ...(Object.keys(CATEGORIES) as Category[])
      .map((c) => ({ id: c, label: CATEGORIES[c].plural, count: byCategory(c, projects).length }))
      .filter((f) => f.count > 0),
  ];

  // hand the boxes of the visible cards to the scene whenever the set changes
  const key = shown.map((p) => p.slug).join(",");
  useEffect(() => {
    const scene = ctl.scene.current;
    if (!scene || status !== "on") return;
    scene.setPlanes(
      key
        .split(",")
        .map((slug) => ({ el: boxes.current.get(slug), project: projects.find((p) => p.slug === slug) }))
        .filter((x): x is { el: HTMLElement; project: Project } => !!x.el && !!x.project),
    );
    ctl.wake(1100); // follow the layout animation
  }, [key, status, ctl, projects]);

  // first frame: the scene exists before its planes, so hand them over as soon as it is created
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const scene = ctl.scene.current;
      if (!scene) return;
      scene.setPlanes(
        [...boxes.current.entries()].map(([slug, el]) => ({ el, project: projects.find((p) => p.slug === slug)! })).filter((x) => x.project),
      );
      ctl.invalidate();
    });
    return () => cancelAnimationFrame(id);
  }, [ctl, projects]);

  useEffect(() => {
    const onScroll = () => ctl.wake(350);
    const onResize = () => ctl.invalidate();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [ctl]);

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    ctl.scene.current?.pointer(e.clientX, e.clientY);
    ctl.wake(700);
    const c = cursor.current;
    if (c) {
      const card = (e.target as HTMLElement).closest("[data-card]");
      c.dataset.on = card ? "true" : "false";
      c.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    }
  };

  return (
    <div ref={section} data-gl={status} className="gal-grid relative">
      <div role="group" aria-label="Filter projects" className="mb-10 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              filter === f.id
                ? "border-[var(--gal-fg)] bg-[var(--gal-fg)] text-[var(--gal-bg)]"
                : "border-[var(--gal-line)] text-[var(--gal-fg)] hover:border-[var(--gal-fg)]",
            )}
          >
            {f.label}
            <span className="font-mono text-xs opacity-70">{f.count}</span>
          </button>
        ))}
      </div>
      <p role="status" className="sr-only">
        {`Showing ${shown.length} ${shown.length === 1 ? "project" : "projects"}`}
      </p>

      <ul
        className="grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3"
        onPointerMove={onMove}
        onPointerLeave={() => {
          ctl.scene.current?.pointer(null);
          ctl.wake(700);
          if (cursor.current) cursor.current.dataset.on = "false";
        }}
      >
        {shown.map((p, i) => {
          // every fifth card spans two columns on desktop: rows of [wide, 1] and [1, 1, 1] tile with no holes
          const wide = p.featured && filter === "all" && i % 5 === 0;
          return (
            <m.li
              key={p.slug}
              layout
              initial={mounted ? { opacity: 0, y: 24 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 32 }}
              className={cn(wide && "lg:col-span-2")}
            >
              <a
                href={p.demo ?? p.repo}
                target="_blank"
                rel="noreferrer"
                data-card
                className="group block rounded-[20px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--gal-bg)]"
              >
                <div
                  ref={(el) => {
                    if (el) boxes.current.set(p.slug, el);
                    else boxes.current.delete(p.slug);
                  }}
                  className={cn("gal-cover relative overflow-hidden rounded-2xl", wide ? "aspect-[4/3] lg:aspect-[16/7.6]" : "aspect-[4/3]")}
                >
                  <span aria-hidden className="gal-cover-fallback absolute inset-0 transition-transform duration-700 group-hover:scale-[1.04]" style={coverStyle(p)} />
                </div>
                <div className="mt-4 flex items-baseline justify-between gap-4">
                  <h3 className="font-serif text-[1.75rem] leading-none tracking-tight">{p.title}</h3>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--gal-muted)]">{p.year}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--gal-muted)]">{p.blurb}</p>
                <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-[var(--gal-muted)]">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: languageColor(p.language) }} />
                    {p.language}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{CATEGORIES[p.category].label}</span>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-0.5 text-[var(--gal-fg)]">
                    {p.demo ? hostOf(p.demo) : "GitHub"}
                    <ArrowUpRight aria-hidden className="size-3" />
                  </span>
                  <span className="sr-only">(opens in a new tab)</span>
                </p>
              </a>
            </m.li>
          );
        })}
      </ul>

      <canvas
        ref={canvas}
        aria-hidden
        data-status={status}
        data-testid="planes-canvas"
        className="pf-gl pointer-events-none fixed inset-0 z-10 size-full"
      />
      <div ref={cursor} aria-hidden data-on="false" className="gal-cursor pointer-events-none fixed left-0 top-0 z-30">
        <span>View</span>
      </div>
    </div>
  );
}
