"use client";

import { ArrowUpRight, GitBranch } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CATEGORIES, hostOf, type Project } from "@/data/portfolio";
import { useGLScene } from "@/lib/gl/use-gl-scene";
import { cn } from "@/lib/cn";
import { coverStyle } from "../cover";
import { createPreviewScene, type PreviewScene } from "./preview-scene";

const W = 340, H = 230;

/**
 * "Selected work" as a big typographic index. With a mouse, a WebGL cover of the hovered project
 * follows the cursor (spring-smoothed, tilted and colour-split by its velocity) and dissolves into
 * the next one; keyboard focus pins it beside the focused row. Touch screens get CSS thumbnails.
 */
export function WorkIndex({ projects }: { projects: Project[] }) {
  const list = useRef<HTMLOListElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState<Project | null>(null);
  // the WebGL preview is created on first hover or focus: touch screens never need it
  const [armed, setArmed] = useState(false);
  const [status, ctl] = useGLScene<PreviewScene>(canvas, createPreviewScene, { maxDpr: 2, enabled: armed });
  const first = useRef<Project | null>(null);
  useEffect(() => {
    if (!armed || !first.current) return;
    ctl.scene.current?.show(first.current);
    ctl.wake(900);
  }, [armed, ctl]);

  // position + velocity of the floating card, driven by its own small rAF loop
  const motion = useRef({ x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, raf: 0, last: 0, placed: false });

  const run = useCallback(() => {
    const m = motion.current;
    if (m.raf) return;
    const tick = (now: number) => {
      const dt = m.last ? Math.min((now - m.last) / 1000, 0.05) : 1 / 60;
      m.last = now;
      const k = 1 - Math.exp(-dt * 11);
      const px = m.x, py = m.y;
      m.x += (m.tx - m.x) * k;
      m.y += (m.ty - m.y) * k;
      const vk = 1 - Math.exp(-dt * 12);
      m.vx += ((m.x - px) / dt - m.vx) * vk;
      m.vy += ((m.y - py) / dt - m.vy) * vk;
      const speed = Math.hypot(m.vx, m.vy);
      const cap = speed > 2400 ? 2400 / speed : 1;
      const el = card.current;
      if (el) {
        const tilt = Math.max(-12, Math.min(12, m.vx * 0.006));
        // beside the cursor, not under it, so the row stays readable; flips near the right edge
        const left = m.x + 36 + W > window.innerWidth - 12 ? m.x - 36 - W : m.x + 36;
        el.style.transform = `translate3d(${left.toFixed(1)}px, ${(m.y - H / 2).toFixed(1)}px, 0) rotate(${tilt.toFixed(2)}deg)`;
      }
      ctl.scene.current?.velocity(m.vx * cap, m.vy * cap);
      ctl.invalidate();
      if (Math.abs(m.tx - m.x) + Math.abs(m.ty - m.y) > 0.3 || speed > 5) m.raf = requestAnimationFrame(tick);
      else {
        m.raf = 0;
        m.last = 0;
        m.vx = m.vy = 0;
        ctl.scene.current?.velocity(0, 0);
        ctl.invalidate();
      }
    };
    m.raf = requestAnimationFrame(tick);
  }, [ctl]);

  useEffect(() => () => cancelAnimationFrame(motion.current.raf), []);

  const moveTo = (x: number, y: number) => {
    const m = motion.current;
    m.tx = x;
    m.ty = y;
    if (!m.placed) {
      m.x = x;
      m.y = y;
      m.placed = true;
    }
    run();
  };

  const show = (p: Project | null) => {
    setActive(p);
    if (p && !armed) {
      first.current = p;
      setArmed(true);
    }
    if (p) {
      ctl.scene.current?.show(p);
      ctl.wake(900);
    } else motion.current.placed = false;
  };

  return (
    <div className="relative">
      <ol
        ref={list}
        className="border-t border-[var(--sym-line)]"
        onPointerMove={(e) => e.pointerType === "mouse" && moveTo(e.clientX, e.clientY)}
        onPointerLeave={() => show(null)}
      >
        {projects.map((p, i) => (
          <li
            key={p.slug}
            className={cn(
              "sym-row group relative border-b border-[var(--sym-line)] transition-colors duration-300",
              active && active.slug !== p.slug && "sym-row--dim",
            )}
            onPointerEnter={(e) => e.pointerType === "mouse" && show(p)}
            onFocus={(e) => {
              if (!e.currentTarget.matches(":focus-within")) return;
              const r = e.currentTarget.getBoundingClientRect();
              show(p);
              // keyboard: park the card in the free space right of the title, clear of the links
              moveTo(Math.max(16, r.right - W - 200), r.top + r.height / 2);
            }}
            onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && show(null)}
          >
            <div className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-3 py-6 sm:grid-cols-[3rem_1fr_auto] sm:items-center sm:gap-x-6 md:py-8">
              <span className="font-mono text-xs tabular-nums text-[var(--sym-muted)] sm:text-sm">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <h3 className="text-[clamp(1.75rem,5.2vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.04em]">
                  <a
                    href={p.demo ?? p.repo}
                    target="_blank"
                    rel="noreferrer"
                    className="sym-title outline-none after:absolute after:inset-0 focus-visible:underline"
                  >
                    {p.title}
                    <span className="sr-only"> ({p.demo ? `live demo on ${hostOf(p.demo)}` : "source on GitHub"}, opens in a new tab)</span>
                  </a>
                </h3>
                <p className="mt-2 max-w-xl text-sm text-[var(--sym-muted)] sm:text-[15px]">{p.blurb}</p>
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Built with">
                  {p.stack.map((s) => (
                    <li key={s} className="rounded-full border border-[var(--sym-line)] px-2.5 py-0.5 text-xs text-[var(--sym-muted)]">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="col-span-2 flex items-center gap-3 sm:col-span-1 sm:flex-col sm:items-end">
                {/* thumbnail for touch screens, where nothing hovers */}
                <span aria-hidden className="sym-thumb hidden aspect-[3/2] w-28 rounded-xl" style={coverStyle(p)} />
                <span className="font-mono text-xs text-[var(--sym-muted)]">
                  {CATEGORIES[p.category].label} · {p.year}
                </span>
                <a
                  href={p.repo}
                  target="_blank"
                  rel="noreferrer"
                  className="relative z-10 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--sym-line)] px-3 text-xs font-medium outline-none transition-colors hover:bg-[var(--sym-fg)] hover:text-[var(--sym-bg)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <GitBranch className="size-3.5" aria-hidden /> Source<span className="sr-only"> of {p.title} on GitHub</span>
                  <ArrowUpRight className="size-3" />
                </a>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {/* floating preview (mouse and keyboard only, never on touch) */}
      <div
        ref={card}
        aria-hidden
        className={cn(
          "sym-preview pointer-events-none fixed left-0 top-0 z-30 hidden transition-opacity duration-200",
          active ? "opacity-100" : "opacity-0",
        )}
        style={{ width: W, height: H }}
      >
        <div className="relative size-full overflow-hidden rounded-[14px] shadow-[0_30px_60px_-20px_rgb(0_0_0/0.55)]">
          {active && <div className="absolute inset-0 transition-opacity" style={{ ...coverStyle(active), opacity: status === "on" ? 0 : 1 }} />}
          <canvas ref={canvas} data-status={status} data-testid="preview-canvas" className="pf-gl absolute inset-0 size-full" />
          {active && (
            <span className="absolute bottom-2.5 left-3 rounded-full bg-black/55 px-2.5 py-1 font-mono text-[11px] text-white backdrop-blur-sm">
              {active.demo ? hostOf(active.demo) : "github.com"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
