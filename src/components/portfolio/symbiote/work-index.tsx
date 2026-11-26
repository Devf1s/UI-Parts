"use client";

import { ArrowUpRight, GitBranch, Lock, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CATEGORIES, hostOf, languageColor, PROFILE, siteAddress, type Project } from "@/data/portfolio";
import { hexToRgb } from "@/lib/gl/gl";
import { useGLScene } from "@/lib/gl/use-gl-scene";
import { whenIdle } from "@/lib/idle";
import { cn } from "@/lib/cn";
import { coverStyle } from "../cover";
import { screenshot, sourceCard } from "./pictures";
import { createPreviewScene, type PreviewScene } from "./preview-scene";

/** Between the card and the cursor, or the row's text. */
const GAP = 32;
/** Keep-out margin from the viewport edges; more at the bottom, where the samples dock floats. */
const EDGE = 16;
const EDGE_BOTTOM = 84;

/** Right edge of the text a row shows (title, blurb, stack), in viewport px. */
function textEdge(row: HTMLElement) {
  const range = document.createRange();
  let right = 0;
  for (const el of row.querySelectorAll("[data-text]")) {
    range.selectNodeContents(el);
    right = Math.max(right, range.getBoundingClientRect().right);
  }
  return right;
}

/**
 * "Selected work" as a big typographic index. With a mouse, a card with a screenshot of the hovered
 * project's live site follows the cursor beside the row's text (never over it), tilted and colour-
 * split by its speed, and dissolves into the next one. Keyboard focus parks it beside the focused
 * row. Touch screens get the screenshot inside each row instead.
 */
export function WorkIndex({ projects }: { projects: Project[] }) {
  const list = useRef<HTMLOListElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const url = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  // `shown` stays on the last project while the card fades out
  const [shown, setShown] = useState<Project | null>(null);
  const [visible, setVisible] = useState(false);
  const current = useRef<Project | null>(null);
  const edge = useRef(0);
  // the WebGL preview is created once the list comes near, on devices that can hover
  const [armed, setArmed] = useState(false);
  const [status, ctl] = useGLScene<PreviewScene>(canvas, createPreviewScene, {
    maxDpr: 2,
    enabled: armed,
    // a few texture reads per pixel: always sharp, small print in the screenshots included
    adaptive: false,
  });

  useEffect(() => {
    const el = list.current;
    if (!el || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let cancel = () => {};
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        setArmed(true);
        // the screenshots load while nobody is waiting for them, so the first hover is instant
        cancel = whenIdle(() => projects.forEach((p) => p.preview && screenshot(p.preview.src).catch(() => {})));
      },
      { rootMargin: "50% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancel();
    };
  }, [projects]);

  /** Shows a project on the canvas, fetching or drawing its picture if the GPU doesn't have it yet. */
  const present = useCallback(
    (p: Project) => {
      const scene = ctl.scene.current;
      if (!scene) return;
      scene.show({ key: p.slug, color: hexToRgb(p.preview?.color ?? p.palette[2]) });
      ctl.wake(900);
      if (scene.has(p.slug)) return;
      const style = getComputedStyle(url.current ?? document.body);
      const pending = p.preview
        ? screenshot(p.preview.src)
        : sourceCard(p, { sans: getComputedStyle(card.current ?? document.body).fontFamily, mono: style.fontFamily });
      pending.then(
        (image) => ctl.scene.current === scene && scene.picture(p.slug, image) && ctl.wake(900),
        () => {}, // stays on its colour
      );
    },
    [ctl],
  );

  // a scene that is (re)created while a project is shown picks it up
  useEffect(() => {
    if (status === "on" && current.current) present(current.current);
  }, [status, present]);

  // the card's position eases toward its target on its own small rAF loop; its velocity tilts it
  const motion = useRef({ x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, raf: 0, last: 0, placed: false });

  const run = useCallback(() => {
    const m = motion.current;
    if (m.raf) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = (now: number) => {
      const dt = m.last ? Math.min((now - m.last) / 1000, 0.05) : 1 / 60;
      m.last = now;
      const k = still ? 1 : 1 - Math.exp(-dt * 11);
      const px = m.x, py = m.y;
      m.x += (m.tx - m.x) * k;
      m.y += (m.ty - m.y) * k;
      const vk = 1 - Math.exp(-dt * 12);
      m.vx += ((m.x - px) / dt - m.vx) * vk;
      m.vy += ((m.y - py) / dt - m.vy) * vk;
      if (still) m.vx = m.vy = 0;
      const speed = Math.hypot(m.vx, m.vy);
      const cap = speed > 2400 ? 2400 / speed : 1;
      const el = card.current;
      if (el) {
        const tilt = Math.max(-10, Math.min(10, m.vx * 0.005));
        el.style.transform = `translate3d(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px, 0) rotate(${tilt.toFixed(2)}deg)`;
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

  /** Aims the card at a pointer position: right of the row's text, beside the cursor, on screen. */
  const moveTo = (cx: number, cy: number) => {
    const m = motion.current;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    // its size comes from CSS (narrower on small laptops)
    const w = card.current?.offsetWidth || 336, h = card.current?.offsetHeight || 300;
    const max = vw - w - EDGE;
    let left = Math.max(cx, edge.current) + GAP;
    // no room on the right: left of the cursor if that still clears the text, else as far right as it goes
    if (left > max) left = cx - GAP - w > edge.current ? cx - GAP - w : max;
    m.tx = Math.max(EDGE, left);
    m.ty = Math.max(EDGE, Math.min(cy - h / 2, vh - h - EDGE_BOTTOM));
    if (!m.placed) {
      m.x = m.tx;
      m.y = m.ty;
      m.placed = true;
    }
    run();
  };

  const show = (p: Project | null, row?: HTMLElement) => {
    current.current = p;
    setVisible(!!p);
    if (!p) {
      motion.current.placed = false;
      return;
    }
    setShown(p);
    setArmed(true);
    edge.current = row ? textEdge(row) : 0;
    present(p);
  };

  return (
    <div className="relative">
      <ol
        ref={list}
        className="border-t border-[var(--sym-line)]"
        // delegated "over" rather than an enter per row: React's synthetic enter can miss the first row
        // when the pointer arrives from outside the list, the native over event always bubbles here
        onPointerOver={(e) => {
          if (e.pointerType !== "mouse") return;
          const row = (e.target as Element).closest<HTMLElement>("li[data-slug]");
          const p = row && projects.find((x) => x.slug === row.dataset.slug);
          if (p && p.slug !== current.current?.slug) show(p, row);
        }}
        onPointerMove={(e) => e.pointerType === "mouse" && moveTo(e.clientX, e.clientY)}
        onPointerLeave={() => show(null)}
      >
        {projects.map((p, i) => (
          <li
            key={p.slug}
            data-slug={p.slug}
            className={cn(
              "sym-row group relative border-b border-[var(--sym-line)] transition-colors duration-300",
              visible && shown && shown.slug !== p.slug && "sym-row--dim",
            )}
            onFocus={(e) => {
              if (!e.currentTarget.matches(":focus-within")) return;
              const r = e.currentTarget.getBoundingClientRect();
              show(p, e.currentTarget);
              moveTo(edge.current, r.top + r.height / 2);
            }}
            onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && show(null)}
          >
            <div className="sym-row__grid grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-3 py-6 sm:grid-cols-[3rem_1fr_auto] sm:gap-x-6 md:py-8">
              <span className="font-mono text-xs tabular-nums text-[var(--sym-muted)] sm:text-sm">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <h3 className="text-[clamp(1.75rem,5.2vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.04em]">
                  <a
                    href={p.demo ?? p.repo}
                    target="_blank"
                    rel="noreferrer"
                    className="sym-title outline-none after:absolute after:inset-0 focus-visible:underline"
                  >
                    <span data-text>{p.title}</span>
                    <span className="sr-only"> ({p.demo ? `live demo on ${hostOf(p.demo)}` : "source on GitHub"}, opens in a new tab)</span>
                  </a>
                </h3>
                <p data-text className="mt-2 max-w-xl text-sm text-[var(--sym-muted)] sm:text-[15px]">
                  {p.blurb}
                </p>
                <ul data-text className="mt-3 flex flex-wrap gap-1.5" aria-label="Built with">
                  {p.stack.map((s) => (
                    <li key={s} className="rounded-full border border-[var(--sym-line)] px-2.5 py-0.5 text-xs text-[var(--sym-muted)]">
                      {s}
                    </li>
                  ))}
                </ul>
                {/* touch screens, where nothing hovers: the screenshot sits in the row */}
                <Thumb project={p} />
              </div>
              <div className="col-span-2 flex items-center gap-3 sm:col-span-1 sm:flex-col sm:items-end">
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
        data-on={visible || undefined}
        className="sym-preview pointer-events-none fixed left-0 top-0 z-30 hidden"
      >
        <div className="sym-card">
          <div className="sym-card__bar">
            <span className="sym-card__dots">
              <i />
              <i />
              <i />
            </span>
            <span ref={url} className="sym-card__url">
              {shown?.demo ? <Lock aria-hidden /> : <GitBranch aria-hidden />}
              <span key={shown?.slug} className="sym-swap truncate">
                {shown && siteAddress(shown)}
              </span>
            </span>
            {shown && (
              <span key={shown.slug} className="sym-swap sym-card__state" data-live={!!shown.demo || undefined}>
                {shown.demo ? "Live" : "Code"}
              </span>
            )}
          </div>
          <div className="sym-card__shot" style={{ background: shown?.preview?.color ?? shown?.palette[2] }}>
            {shown &&
              status !== "on" &&
              (shown.preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP (scripts/capture-previews.mjs), cached forever
                <img src={shown.preview.src} alt="" decoding="async" />
              ) : (
                <SourcePoster project={shown} />
              ))}
            <canvas ref={canvas} data-status={status} data-testid="preview-canvas" className="pf-gl" />
          </div>
          {shown && (
            <div key={shown.slug} className="sym-swap sym-card__info">
              <p className="sym-card__title">
                <span className="truncate">{shown.title}</span>
                <span className="sym-card__year">{shown.year}</span>
              </p>
              <p className="sym-card__meta">
                <span>
                  <i style={{ background: languageColor(shown.language) }} />
                  {shown.language}
                </span>
                <span>{CATEGORIES[shown.category].label}</span>
                {shown.stars > 0 && (
                  <span>
                    <Star aria-hidden />
                    {shown.stars}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A small browser window with the project's screenshot, for touch screens. */
function Thumb({ project: p }: { project: Project }) {
  return (
    <div aria-hidden className="sym-thumb mt-5 hidden w-full max-w-sm overflow-hidden rounded-xl border border-[var(--sym-line)] bg-[var(--card)]">
      <div className="flex h-6 items-center gap-2 border-b border-[var(--sym-line)] px-2.5">
        <span className="sym-card__dots">
          <i />
          <i />
          <i />
        </span>
        <span className="truncate font-mono text-[10px] text-[var(--sym-muted)]">{siteAddress(p)}</span>
      </div>
      <div className="relative aspect-[16/10]" style={{ background: p.preview?.color ?? p.palette[2] }}>
        {p.preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP (scripts/capture-previews.mjs), cached forever
          <img
            src={p.preview.thumb}
            srcSet={`${p.preview.thumb} ${p.preview.width / 2}w, ${p.preview.src} ${p.preview.width}w`}
            sizes="(min-width: 640px) 24rem, calc(100vw - 6rem)"
            width={p.preview.width}
            height={p.preview.height}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full object-cover object-top"
          />
        ) : (
          <SourcePoster project={p} />
        )}
      </div>
    </div>
  );
}

/** Stand-in picture for a project with no live site: its repository, title and stack. */
function SourcePoster({ project: p }: { project: Project }) {
  return (
    <div className="absolute inset-0 overflow-hidden text-white" style={coverStyle(p)}>
      <div className="absolute inset-0 bg-[linear-gradient(160deg,rgb(0_0_0/0.25),rgb(0_0_0/0.7))]" />
      <div className="relative flex h-full flex-col justify-between p-[6%]">
        <p className="truncate font-mono text-[11px] opacity-80">
          {PROFILE.handle} / {p.slug}
        </p>
        <div>
          <p className="text-2xl font-semibold leading-none tracking-tight">{p.title}</p>
          <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] opacity-85">
            <GitBranch aria-hidden className="size-3" /> source on GitHub
          </p>
        </div>
      </div>
    </div>
  );
}
