"use client";

import { ArrowUpRight, Search } from "lucide-react";
import { useDeferredValue, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CATEGORIES, hostOf, languageColor, monthYear, type Project } from "@/data/portfolio";
import { cn } from "@/lib/cn";
import { ScrambleText } from "../scramble-text";

/** Bento grid whose tiles share one cursor-following light (CSS vars, one listener). */
export function Bento({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(hover: hover)").matches) return;
    let raf = 0;
    let x = 0, y = 0;
    const apply = () => {
      raf = 0;
      el.querySelectorAll<HTMLElement>(".orb-tile").forEach((t) => {
        const r = t.getBoundingClientRect();
        t.style.setProperty("--mx", `${x - r.left}px`);
        t.style.setProperty("--my", `${y - r.top}px`);
      });
    };
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    el.addEventListener("pointermove", move);
    return () => {
      el.removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div ref={ref} className={cn("orb-bento", className)}>
      {children}
    </div>
  );
}

export function Tile({ children, className, as: Tag = "div", ...rest }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cn("orb-tile p-6", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Searchable list of every repository, grouped by year like a timeline. */
export function RepoSearch({ projects }: { projects: Project[] }) {
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());
  const id = useId();
  const hits = projects.filter(
    (p) => !query || [p.title, p.slug, p.language, CATEGORIES[p.category].label, ...p.stack].some((s) => s.toLowerCase().includes(query)),
  );
  const years = [...new Set(hits.map((p) => p.year))].sort((a, b) => b - a);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <label htmlFor={id} className="text-lg font-semibold tracking-tight">
          Find a repository
        </label>
        <div className="relative w-full sm:w-72">
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--orb-muted)]" />
          <input
            id={id}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="react, game, scss…"
            autoComplete="off"
            className="h-11 w-full rounded-full bg-[var(--card-2)] pl-10 pr-4 text-sm outline-none placeholder:text-[var(--orb-muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
        </div>
      </div>
      <p role="status" className="mt-3 font-mono text-xs text-[var(--orb-muted)]">
        {hits.length === projects.length ? `${hits.length} repositories` : `${hits.length} of ${projects.length} match`}
      </p>
      <ol className="mt-6 space-y-8">
        {years.map((y) => (
          <li key={y} className="grid gap-3 sm:grid-cols-[5rem_1fr]">
            <span className="font-mono text-sm text-[var(--orb-muted)]">{y}</span>
            <ul className="grid gap-2 md:grid-cols-2">
              {hits
                .filter((p) => p.year === y)
                .map((p) => (
                  <li key={p.slug}>
                    <a
                      href={p.demo ?? p.repo}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex min-h-12 items-center justify-between gap-3 rounded-xl px-3 py-2 outline-none transition-colors hover:bg-[var(--card-2)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: languageColor(p.language) }} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{p.title}</span>
                          <span className="block truncate text-xs text-[var(--orb-muted)]">
                            {p.language} · {CATEGORIES[p.category].label} · {monthYear(p.created)}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-[var(--orb-muted)] group-hover:text-[var(--orb-fg)]">
                        {p.demo ? hostOf(p.demo) : "GitHub"}
                        <ArrowUpRight aria-hidden className="size-3" />
                      </span>
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Featured project tile: decoding title, stack, links. */
export function FeaturedTile({ p, index }: { p: Project; index: number }) {
  return (
    <Tile as="article" className="flex flex-col justify-between gap-6">
      <div>
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-[var(--orb-muted)]">
          <span>{String(index + 1).padStart(2, "0")}</span>
          <span>{monthYear(p.created)}</span>
        </div>
        <h3 className="mt-4 text-2xl font-semibold tracking-tight">
          <ScrambleText text={p.title} />
        </h3>
        <p className="mt-2 text-sm text-[var(--orb-muted)]">{p.blurb}</p>
      </div>
      <div>
        <ul className="flex flex-wrap gap-1.5" aria-label="Built with">
          {p.stack.slice(0, 4).map((s) => (
            <li key={s} className="rounded-full bg-[var(--card-2)] px-2.5 py-1 text-[11px]">
              {s}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {p.demo && (
            <a href={p.demo} target="_blank" rel="noreferrer" className="orb-btn">
              Live<span className="sr-only"> demo of {p.title} on {hostOf(p.demo)}</span> <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          )}
          <a href={p.repo} target="_blank" rel="noreferrer" className="orb-btn">
            Source<span className="sr-only"> of {p.title} on GitHub</span> <ArrowUpRight aria-hidden className="size-3.5" />
          </a>
        </div>
      </div>
    </Tile>
  );
}
