"use client";

import { useEffect, useRef } from "react";
import { cssVarColor } from "@/lib/gl/gl";
import { useGLScene } from "@/lib/gl/use-gl-scene";
import { createPosterScene, type PosterArt, type PosterScene } from "./poster-scene";

export type PosterData = {
  handle: string;
  years: string;
  count: number;
  languages: { language: string; count: number }[];
  categories: { label: string; count: number }[];
  url: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Swiss-style poster artwork, drawn with the page's own fonts and colours. */
function posterArt(host: HTMLElement, d: PosterData): PosterArt {
  return {
    draw(ctx, W, H) {
      const cs = getComputedStyle(host);
      const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
      const bg = v("--poster-bg", "#fbfaf6"), fg = v("--poster-fg", "#141414");
      const accent = v("--poster-accent", "#e8402a"), muted = v("--poster-muted", "#6b675f");
      const serif = v("--font-serif", "Georgia, serif"), sans = v("--font-geist-sans", "system-ui, sans-serif");
      const mono = v("--font-geist-mono", "ui-monospace, monospace");
      const m = 64;

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      // paper fibre: a few thousand faint specks, seeded so every repaint matches, filled as one
      // path per shade (a fill per speck costs ~10× more)
      let s = 7;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const shades = Array.from({ length: 6 }, () => new Path2D());
      for (let i = 0; i < 3500; i++) {
        const shade = shades[Math.floor(rnd() * shades.length)];
        shade.rect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2);
      }
      shades.forEach((path, i) => {
        ctx.fillStyle = `rgba(0,0,0,${0.015 + ((i + 0.5) / shades.length) * 0.03})`;
        ctx.fill(path);
      });

      // the sun
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(W * 0.7, H * 0.4, 290, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = fg;
      ctx.textBaseline = "alphabetic";
      ctx.font = `500 26px ${mono}`;
      ctx.fillText(d.handle.toUpperCase(), m, m + 20);
      ctx.textAlign = "right";
      ctx.fillText(`PORTFOLIO ${d.years}`, W - m, m + 20);
      ctx.textAlign = "left";
      ctx.fillRect(m, m + 48, W - m * 2, 3);

      ctx.font = `italic 400 620px ${serif}`;
      ctx.fillText(String(d.count), m - 24, H * 0.6);
      ctx.font = `400 104px ${serif}`;
      ctx.fillText("public projects", m, H * 0.6 + 120);

      ctx.fillRect(m, H * 0.74, W - m * 2, 2);
      const colW = (W - m * 2) / 2;
      ctx.font = `500 24px ${mono}`;
      ctx.fillStyle = muted;
      ctx.fillText("LANGUAGES", m, H * 0.74 + 54);
      ctx.fillText("KINDS", m + colW, H * 0.74 + 54);
      ctx.fillStyle = fg;
      ctx.font = `400 34px ${sans}`;
      d.languages.slice(0, 5).forEach((l, i) => {
        const y = H * 0.74 + 104 + i * 46;
        ctx.fillText(l.language, m, y);
        ctx.textAlign = "right";
        ctx.fillText(pad2(l.count), m + colW - 40, y);
        ctx.textAlign = "left";
      });
      d.categories.forEach((c, i) => {
        const y = H * 0.74 + 104 + i * 46;
        ctx.fillText(c.label, m + colW, y);
        ctx.textAlign = "right";
        ctx.fillText(pad2(c.count), W - m, y);
        ctx.textAlign = "left";
      });

      ctx.font = `500 24px ${mono}`;
      ctx.fillText(d.url.replace(/^https?:\/\//, ""), m, H - m + 8);
      ctx.textAlign = "right";
      ctx.fillText("↗", W - m, H - m + 8);
      ctx.textAlign = "left";

      // two strips of tape holding it to the wall
      const tape = (x: number, rot: number) => {
        ctx.save();
        ctx.translate(x, 18);
        ctx.rotate(rot);
        ctx.fillStyle = "rgba(226, 214, 184, 0.78)";
        ctx.fillRect(-90, -26, 180, 52);
        ctx.restore();
      };
      tape(120, -0.12);
      tape(W - 120, 0.1);
    },
  };
}

/**
 * Hero poster. WebGL draws it as hanging cloth; without WebGL the same artwork is painted flat on
 * a 2D canvas, so the hero never ends up empty.
 */
export function ClothPoster({ data, className }: { data: PosterData; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const flat = useRef<HTMLCanvasElement>(null);
  const host = () => wrap.current?.closest<HTMLElement>(".pf-gallery") ?? document.documentElement;

  const [status, ctl] = useGLScene<PosterScene>(
    canvas,
    (env) =>
      createPosterScene(env, posterArt(host(), data), () => {
        const dark = document.documentElement.classList.contains("dark");
        return { color: cssVarColor("--poster-shadow", host(), [0, 0, 0]), alpha: dark ? 0.55 : 0.28 };
      }),
    { ambient: true, maxDpr: 2, stillTime: 1.3 },
  );

  // the artwork uses web fonts: repaint once they are in
  useEffect(() => {
    let alive = true;
    const el = host();
    const cs = getComputedStyle(el);
    const fams = ["--font-serif", "--font-geist-sans", "--font-geist-mono"].map((n) => cs.getPropertyValue(n).trim()).filter(Boolean);
    Promise.all(fams.flatMap((f) => [document.fonts.load(`400 100px ${f}`), document.fonts.load(`italic 400 100px ${f}`)]))
      .catch(() => undefined)
      .then(() => {
        if (!alive) return;
        ctl.scene.current?.repaint();
        ctl.invalidate();
      });
    return () => {
      alive = false;
    };
  }, [ctl, status]);

  // no WebGL: paint the artwork flat
  useEffect(() => {
    if (status !== "off" || !flat.current) return;
    const c = flat.current;
    c.width = 1024;
    c.height = 1365;
    const paint = () => {
      const ctx = c.getContext("2d");
      if (ctx) posterArt(host(), data).draw(ctx, c.width, c.height);
    };
    paint();
    document.fonts.ready.then(paint);
    const mo = new MutationObserver(paint);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [status, data]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ctl.scene.current?.pointer(e.clientX - r.left, e.clientY - r.top);
      ctl.wake(1600);
    };
    const leave = () => {
      ctl.scene.current?.pointer(null);
      ctl.wake(1600);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [ctl]);

  return (
    <div ref={wrap} aria-hidden className={className} style={{ touchAction: "pan-y" }}>
      <canvas ref={canvas} data-status={status} data-testid="poster-canvas" className="pf-gl absolute inset-0 size-full" />
      {status === "off" && (
        <canvas
          ref={flat}
          data-testid="poster-flat"
          className="absolute left-1/2 top-1/2 h-[80%] w-auto -translate-x-1/2 -translate-y-1/2 shadow-[18px_24px_40px_-18px_var(--poster-shadow)]"
        />
      )}
    </div>
  );
}
