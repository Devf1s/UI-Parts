import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { coverStyle } from "@/components/portfolio/cover";
import { SAMPLES } from "@/components/portfolio/samples";
import { FEATURED, PROFILE, PROJECTS } from "@/data/portfolio";

export const metadata: Metadata = {
  title: { absolute: "Portfolio samples · Devf1s" },
};

/** Index of the samples: what each one does and which WebGL piece it is built around. */
export default function PortfolioIndex() {
  return (
    <main className="mx-auto min-h-dvh max-w-6xl px-5 pb-32 pt-16 sm:px-10 sm:pt-24">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted">Portfolio samples</p>
      <h1 className="mt-4 max-w-3xl text-[clamp(2.4rem,6vw,4.5rem)] font-semibold leading-[0.95] tracking-[-0.04em]">
        One set of projects, three ways to show them.
      </h1>
      <p className="mt-6 max-w-xl text-muted">
        Each sample is built from the same {PROJECTS.length} public repositories of{" "}
        <a href={PROFILE.github} target="_blank" rel="noreferrer" className="font-medium text-fg underline underline-offset-4">
          @{PROFILE.handle}<span className="sr-only"> on GitHub (opens in a new tab)</span>
        </a>{" "}
        and has its own WebGL centrepiece, written in raw WebGL2 with no 3D library.
      </p>
      <ol className="mt-14 grid gap-5 md:grid-cols-3">
        {SAMPLES.map((s, i) => (
          <li key={s.slug}>
            <Link
              href={`/portfolio/${s.slug}`}
              className="group flex h-full flex-col rounded-3xl bg-card p-3 shadow-[inset_0_0_0_1px_var(--border)] outline-none transition-transform duration-300 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <span aria-hidden className="block aspect-[4/3] rounded-2xl" style={coverStyle(FEATURED[i * 2 % FEATURED.length])} />
              <span className="flex items-center justify-between px-2 pt-4">
                <span className="text-xl font-semibold tracking-tight">
                  {String(i + 1).padStart(2, "0")} · {s.title}
                </span>
                <ArrowUpRight className="size-5 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </span>
              <span className="px-2 pt-2 text-sm text-muted">{s.tagline}</span>
              <span className="mt-auto px-2 pb-2 pt-4 font-mono text-[11px] leading-relaxed text-muted">WebGL: {s.webgl}</span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
