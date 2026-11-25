"use client";

import { ArrowUpRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CATEGORIES, hostOf, languageColor, monthYear, type Project } from "@/data/portfolio";
import { cn } from "@/lib/cn";
import { useGLScene } from "@/lib/gl/use-gl-scene";
import { createGalaxyScene, type GalaxyScene } from "./galaxy-scene";

/**
 * The galaxy canvas with its DOM overlay: year labels pinned to the rings, a tooltip on the
 * hovered star, a card for the selected one, and language toggles that dim the other stars.
 * Drag (or swipe sideways) to spin it; vertical swipes still scroll the page.
 */
export function GalaxyHero({ projects, languages }: { projects: Project[]; languages: { language: string; count: number }[] }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const [hover, setHover] = useState(-1);
  const [selected, setSelected] = useState(-1);
  const [langs, setLangs] = useState<Set<string>>(new Set());
  const [status, ctl] = useGLScene<GalaxyScene>(canvas, (env) => createGalaxyScene(env, projects), {
    ambient: true,
    maxDpr: 2,
    stillTime: 4,
  });

  // per-frame DOM overlay (no React renders unless the hovered star changes)
  useEffect(() => {
    const scene = ctl.scene.current;
    if (!scene || status !== "on") return;
    let last = -2;
    scene.onFrame((f) => {
      f.rings.forEach((r, i) => {
        const el = labels.current[i];
        if (!el) return;
        if (el.textContent !== String(r.year)) el.textContent = String(r.year);
        el.style.transform = `translate3d(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px, 0)`;
      });
      const s = f.hover >= 0 ? f.stars[f.hover] : null;
      if (tip.current && s) tip.current.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`;
      if (f.hover !== last) {
        last = f.hover;
        setHover(f.hover);
      }
    });
    return () => scene.onFrame(null);
  }, [ctl, status]);

  useEffect(() => {
    ctl.scene.current?.highlight(langs);
    ctl.invalidate();
  }, [langs, ctl, status]);

  useEffect(() => {
    ctl.scene.current?.select(selected);
    ctl.invalidate();
  }, [selected, ctl, status]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let down: { x: number; y: number; id: number; moved: number } | null = null;
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("button, a")) return;
      down = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 };
      ctl.scene.current?.pointer(...local(e));
      ctl.wake(800);
    };
    const onMove = (e: PointerEvent) => {
      const scene = ctl.scene.current;
      if (!scene) return;
      if (down && e.pointerId === down.id) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        down.moved += Math.abs(dx) + Math.abs(dy);
        down.x = e.clientX;
        down.y = e.clientY;
        // touch: only sideways drags spin, vertical ones belong to the page scroll
        scene.drag(dx, e.pointerType === "touch" ? 0 : dy);
      }
      if (e.pointerType === "mouse") scene.pointer(...local(e));
      ctl.wake(e.pointerType === "mouse" ? 600 : 1500);
    };
    const onUp = (e: PointerEvent) => {
      const scene = ctl.scene.current;
      if (!down || !scene) return;
      // a tap or click without dragging picks the star under it
      if (down.moved < 6) {
        scene.pointer(...local(e));
        ctl.scene.current?.frame(0, 0);
        const i = scene.hovered();
        setSelected(i);
      }
      if (e.pointerType !== "mouse") scene.pointer(null);
      down = null;
      scene.release();
      ctl.wake(2000);
    };
    const onLeave = () => {
      ctl.scene.current?.pointer(null);
      ctl.wake(300);
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [ctl]);

  const hp = hover >= 0 ? projects[hover] : null;
  const sp = selected >= 0 ? projects[selected] : null;

  return (
    <div ref={stage} className="orb-stage absolute inset-0 select-none" style={{ touchAction: "pan-y" }}>
      <canvas ref={canvas} aria-hidden data-status={status} data-testid="galaxy-canvas" className={cn("pf-gl absolute inset-0 size-full", hp ? "cursor-pointer" : "cursor-grab active:cursor-grabbing")} />

      {status === "on" && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 8 }, (_, i) => (
            <span
              key={i}
              ref={(el) => {
                labels.current[i] = el;
              }}
              className="orb-ring-label absolute left-0 top-0 font-mono text-[10px] text-[var(--orb-muted)]"
              style={{ transform: "translate3d(-999px,-999px,0)" }}
            />
          ))}
          <div ref={tip} className={cn("absolute left-0 top-0 transition-opacity duration-150", hp ? "opacity-100" : "opacity-0")}>
            {hp && (
              <div className="orb-tip ml-4 -mt-4 w-56 rounded-xl px-3 py-2.5 text-xs">
                <p className="text-sm font-semibold">{hp.title}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[var(--orb-muted)]">
                  <span className="size-2 rounded-full" style={{ background: languageColor(hp.language) }} />
                  {hp.language} · {monthYear(hp.created)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {sp && (
        <div className="orb-card absolute bottom-24 right-4 z-10 w-[min(22rem,calc(100%-2rem))] rounded-2xl p-5 md:bottom-8 md:right-8" role="region" aria-label={`Selected star: ${sp.title}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--orb-muted)]">
                {CATEGORIES[sp.category].label} · {monthYear(sp.created)}
              </p>
              <p className="mt-1 text-xl font-semibold tracking-tight">{sp.title}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(-1)}
              aria-label="Close"
              className="grid size-9 shrink-0 place-items-center rounded-full outline-none hover:bg-[var(--orb-chip)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-sm text-[var(--orb-muted)]">{sp.blurb}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {sp.demo && (
              <a href={sp.demo} target="_blank" rel="noreferrer" className="orb-btn">
                {hostOf(sp.demo)} <ArrowUpRight className="size-3.5" />
              </a>
            )}
            <a href={sp.repo} target="_blank" rel="noreferrer" className="orb-btn">
              Source <ArrowUpRight className="size-3.5" />
            </a>
          </div>
        </div>
      )}

      <div className="absolute bottom-24 left-4 right-4 z-10 flex flex-wrap gap-1.5 md:bottom-8 md:left-auto md:right-8 md:max-w-md md:justify-end" role="group" aria-label="Highlight stars by language">
        {!sp &&
          languages.map((l) => {
            const on = langs.has(l.language);
            return (
              <button
                key={l.language}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setLangs((prev) => {
                    const next = new Set(prev);
                    if (on) next.delete(l.language);
                    else next.add(l.language);
                    return next;
                  })
                }
                className={cn(
                  "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium outline-none backdrop-blur-md transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  on ? "border-[var(--orb-fg)] bg-[var(--orb-fg)] text-[var(--orb-bg)]" : "border-[var(--orb-line-ui)] bg-[var(--orb-chip)] text-[var(--orb-fg)]",
                )}
              >
                <span aria-hidden className="size-2 rounded-full" style={{ background: languageColor(l.language) }} />
                {l.language} <span className="font-mono opacity-70">{l.count}</span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
