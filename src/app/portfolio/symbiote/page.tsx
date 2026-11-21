import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { HeroActions } from "@/components/portfolio/symbiote/hero-actions";
import { InkCanvas } from "@/components/portfolio/symbiote/ink-hero";
import { WorkIndex } from "@/components/portfolio/symbiote/work-index";
import { ScrambleText } from "@/components/portfolio/scramble-text";
import { SharePanel } from "@/components/portfolio/share-panel";
import {
  CATEGORIES,
  FEATURED,
  hostOf,
  languageColor,
  languageStats,
  monthYear,
  PROFILE,
  PROJECTS,
  stackStats,
  yearStats,
} from "@/data/portfolio";
import "@/components/portfolio/symbiote/symbiote.css";

export const metadata: Metadata = {
  title: "Symbiote",
  description: "Portfolio sample: living WebGL ink that reaches for the cursor and an index of Devf1s’ GitHub projects.",
};

export default function SymbiotePage() {
  const years = yearStats();
  const languages = languageStats();
  const archive = PROJECTS.filter((p) => !p.featured);
  const stack = stackStats(PROJECTS, 14).map((s) => s.name);

  return (
    <div id="symbiote" className="pf-symbiote pf-grain relative min-h-dvh overflow-x-clip bg-[var(--sym-bg)] text-[var(--sym-fg)]">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-10">
          <a href="#top" className="font-mono text-sm font-semibold tracking-tight outline-none focus-visible:underline">
            {PROFILE.handle.toLowerCase()}
            <span className="text-[var(--ink-rim)]">/</span>
          </a>
          <nav aria-label="Sections">
            <ul className="flex gap-5 text-sm font-medium sm:gap-8">
              {[
                ["Work", "#work"],
                ["Archive", "#archive"],
                ["Contact", "#contact"],
              ].map(([label, href]) => (
                <li key={href}>
                  <a href={href} className="inline-flex min-h-6 items-center outline-none hover:underline focus-visible:underline">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main>
        <section id="top" aria-labelledby="sym-h1" className="relative isolate overflow-hidden bg-[var(--sym-bg)] lg:min-h-[100svh]">
          {/* phones and tablets: the ink gets its own stage above the copy; desktop: full bleed */}
          <div className="relative h-[44svh] min-h-72 lg:absolute lg:inset-0 lg:h-auto">
            <div aria-hidden className="sym-ink-fallback absolute inset-0" />
            <InkCanvas hostId="symbiote" />
          </div>
          {/* no z-index here: the name has to blend with the canvas in the same stacking context */}
          <div className="relative mx-auto flex max-w-7xl flex-col justify-between gap-12 px-5 pb-28 pt-2 sm:px-10 md:pb-16 lg:min-h-[100svh] lg:pt-24">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--sym-muted)]">
              Portfolio · {years[0]?.year}–{years.at(-1)?.year}
            </p>
            <div className="max-w-3xl">
              <h1 id="sym-h1" className="sym-name">
                {PROFILE.name}
              </h1>
              <p className="mt-8 max-w-md text-lg leading-snug sm:text-xl">
                {PROFILE.role}. {PROJECTS.length} public projects on GitHub, from hand-coded landing pages to React apps and WebGL.
              </p>
              <div className="mt-10">
                <HeroActions github={PROFILE.github} />
              </div>
            </div>
            <dl className="grid max-w-md grid-cols-3 gap-6 font-mono text-xs">
              <div>
                <dt className="text-[var(--sym-muted)]">Repositories</dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight">{PROJECTS.length}</dd>
              </div>
              <div>
                <dt className="text-[var(--sym-muted)]">Languages</dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight">{languages.length}</dd>
              </div>
              <div>
                <dt className="text-[var(--sym-muted)]">Latest</dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight">{years.at(-1)?.year}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section id="work" tabIndex={-1} aria-labelledby="work-h" className="mx-auto max-w-7xl scroll-mt-6 px-5 py-24 outline-none sm:px-10 md:py-32">
          <div className="mb-10 flex items-end justify-between gap-6">
            <h2 id="work-h" className="text-3xl font-semibold tracking-tight sm:text-5xl">
              <ScrambleText text="Selected work" />
            </h2>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--sym-muted)]">{String(FEATURED.length).padStart(2, "0")} projects</p>
          </div>
          <WorkIndex projects={FEATURED} />
        </section>

        <section aria-label="Tools I build with" className="pf-marquee-host overflow-hidden border-y border-[var(--sym-line)] py-6">
          <div className="pf-marquee" style={{ "--marquee-duration": "45s" } as React.CSSProperties}>
            {[0, 1].map((copy) => (
              <ul key={copy} aria-hidden={copy === 1} className="flex shrink-0 items-center">
                {stack.map((s) => (
                  <li key={s} className="flex items-center whitespace-nowrap text-3xl font-semibold tracking-tight sm:text-5xl">
                    <span className="px-6 sm:px-10">{s}</span>
                    <span aria-hidden className="size-2.5 rounded-full bg-[var(--ink-rim)]" />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>

        <section id="archive" aria-labelledby="archive-h" className="mx-auto max-w-7xl scroll-mt-6 px-5 py-24 sm:px-10 md:py-32">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
            <h2 id="archive-h" className="text-3xl font-semibold tracking-tight sm:text-5xl">
              <ScrambleText text="Archive" />
            </h2>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Languages">
              {languages.map((l) => (
                <li key={l.language} className="flex items-center gap-2">
                  <span aria-hidden className="size-2.5 rounded-full" style={{ background: l.color }} />
                  {l.language} <span className="text-[var(--sym-muted)]">{l.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <caption className="sr-only">All other public repositories</caption>
              <thead className="font-mono text-xs uppercase tracking-wider text-[var(--sym-muted)]">
                <tr className="border-b border-[var(--sym-line)]">
                  <th scope="col" className="py-3 pr-4 font-normal">Year</th>
                  <th scope="col" className="py-3 pr-4 font-normal">Project</th>
                  <th scope="col" className="hidden py-3 pr-4 font-normal md:table-cell">Type</th>
                  <th scope="col" className="py-3 pr-4 font-normal">Language</th>
                  <th scope="col" className="py-3 text-right font-normal">Links</th>
                </tr>
              </thead>
              <tbody>
                {archive.map((p) => (
                  <tr key={p.slug} className="border-b border-[var(--sym-line)] transition-colors hover:bg-[var(--card-2)]">
                    <td className="py-3 pr-4 font-mono tabular-nums text-[var(--sym-muted)]">{p.year}</td>
                    <th scope="row" className="py-3 pr-4 font-medium">{p.title}</th>
                    <td className="hidden py-3 pr-4 text-[var(--sym-muted)] md:table-cell">{CATEGORIES[p.category].label}</td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden className="size-2 rounded-full" style={{ background: languageColor(p.language) }} />
                        {p.language}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">
                      <span className="inline-flex gap-1">
                        {p.demo && (
                          <a
                            href={p.demo}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-9 items-center rounded-full px-3 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                          >
                            Demo<span className="sr-only"> of {p.title} on {hostOf(p.demo)}</span>
                          </a>
                        )}
                        <a
                          href={p.repo}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        >
                          Code<span className="sr-only"> of {p.title} on GitHub</span>
                          <ArrowUpRight aria-hidden className="size-3" />
                        </a>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="contact" aria-labelledby="contact-h" className="mx-auto max-w-7xl scroll-mt-6 px-5 pb-36 pt-16 text-center sm:px-10 md:pb-40">
          <h2 id="contact-h" className="mx-auto max-w-4xl text-[clamp(2.5rem,8vw,6.5rem)] font-semibold leading-[0.9] tracking-[-0.05em]">
            Let’s build something that reaches back.
          </h2>
          <p className="mx-auto mt-6 max-w-md text-[var(--sym-muted)]">
            Every project here lives on{" "}
            <a href={PROFILE.github} target="_blank" rel="noreferrer" className="font-medium text-[var(--sym-fg)] underline underline-offset-4">
              GitHub<span className="sr-only"> (opens in a new tab)</span>
            </a>
            . Know someone who should see it?
          </p>
          <SharePanel className="mt-14" title={`${PROFILE.name} · portfolio`} text={`${PROFILE.name}, ${PROFILE.role.toLowerCase()}: projects and experiments.`} />
        </section>
      </main>

      <footer className="border-t border-[var(--sym-line)]">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-3 px-5 py-6 pb-24 font-mono text-xs text-[var(--sym-muted)] sm:px-10 md:pb-6">
          <span>Projects synced from GitHub · {monthYear(PROFILE.syncedAt)}</span>
          <span>Next.js · raw WebGL2 · no 3D library</span>
        </div>
      </footer>
    </div>
  );
}
