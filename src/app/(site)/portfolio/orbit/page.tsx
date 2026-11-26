import { GalaxyHero } from "@/components/portfolio/orbit/galaxy-hero";
import { Bento, FeaturedTile, RepoSearch, Tile } from "@/components/portfolio/orbit/orbit-bento";
import { SharePanel } from "@/components/portfolio/share-panel";
import { FEATURED, languageStats, monthYear, PROFILE, PROJECTS, stackStats, yearStats } from "@/data/portfolio";
import { pageMetadata } from "@/site/pages";
import "@/components/portfolio/orbit/orbit.css";

export const metadata = pageMetadata("orbit");

export default function OrbitPage() {
  const years = yearStats();
  const languages = languageStats();
  const stack = stackStats(PROJECTS, 12);
  const peak = Math.max(...years.map((y) => y.count));
  const latest = [...PROJECTS].sort((a, b) => b.pushed.localeCompare(a.pushed))[0];
  const donut = languages
    .map((l, i) => {
      const from = languages.slice(0, i).reduce((sum, x) => sum + x.share, 0) * 360;
      return `${l.color} ${from}deg ${from + l.share * 360}deg`;
    })
    .join(", ");

  return (
    <div className="pf-orbit relative min-h-dvh overflow-x-clip bg-[var(--orb-bg)] text-[var(--orb-fg)]">
      <main>
        <section aria-labelledby="orb-h1" className="orb-sky relative isolate h-[100svh] min-h-[36rem] overflow-hidden">
          <GalaxyHero projects={PROJECTS} languages={languages.map(({ language, count }) => ({ language, count }))} />
          <div className="pointer-events-none relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-between px-5 pb-44 pt-8 sm:px-10 md:pb-10">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-[var(--orb-muted)]">
              github.com/{PROFILE.handle} · {PROJECTS.length} public repositories
            </p>
            <div className="max-w-xl">
              <h1 id="orb-h1" className="text-[clamp(2.75rem,7vw,5.5rem)] font-semibold leading-[0.9] tracking-[-0.045em]">
                @{PROFILE.handle}
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-[var(--orb-muted)] sm:text-base">
                Every star is a public repository: newest near the core, oldest at the rim, coloured by language. Drag to spin, pick a star to open it.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="stats-h" className="mx-auto max-w-7xl px-5 py-20 sm:px-10">
          <h2 id="stats-h" className="sr-only">
            GitHub in numbers
          </h2>
          <Bento className="grid gap-4 md:grid-cols-6 lg:grid-cols-12">
            <Tile className="md:col-span-3 lg:col-span-4">
              <p className="font-mono text-xs uppercase tracking-wider text-[var(--orb-muted)]">Repositories by year</p>
              <p className="mt-3 text-6xl font-semibold tracking-tight">{PROJECTS.length}</p>
              <ol className="mt-6 flex h-28 items-end gap-2" aria-label="Repositories created per year">
                {years.map((y) => (
                  <li key={y.year} className="flex flex-1 flex-col items-center gap-2">
                    <span className="font-mono text-[11px] tabular-nums">{y.count}</span>
                    <span aria-hidden className="w-full rounded-md bg-[var(--orb-accent)]" style={{ height: `${Math.max(4, (y.count / peak) * 72)}px` }} />
                    <span className="font-mono text-[11px] text-[var(--orb-muted)]">’{String(y.year).slice(2)}</span>
                  </li>
                ))}
              </ol>
            </Tile>
            <Tile className="md:col-span-3 lg:col-span-4">
              <p className="font-mono text-xs uppercase tracking-wider text-[var(--orb-muted)]">Languages</p>
              <div className="mt-5 flex items-center gap-6">
                <div aria-hidden className="relative size-28 shrink-0 rounded-full" style={{ background: `conic-gradient(${donut})` }}>
                  <div className="absolute inset-[14px] grid place-items-center rounded-full bg-[var(--card)] text-2xl font-semibold">{languages.length}</div>
                </div>
                <ul className="grid gap-1.5 text-sm">
                  {languages.map((l) => (
                    <li key={l.language} className="flex items-center gap-2">
                      <span aria-hidden className="size-2.5 rounded-full" style={{ background: l.color }} />
                      {l.language}
                      <span className="font-mono text-xs text-[var(--orb-muted)]">{Math.round(l.share * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Tile>
            <Tile className="md:col-span-6 lg:col-span-4">
              <p className="font-mono text-xs uppercase tracking-wider text-[var(--orb-muted)]">Latest activity</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{latest.title}</p>
              <p className="mt-1 text-sm text-[var(--orb-muted)]">Pushed {monthYear(latest.pushed)}</p>
              <p className="mt-6 font-mono text-xs uppercase tracking-wider text-[var(--orb-muted)]">Most used</p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {stack.map((s) => (
                  <li key={s.name} className="rounded-full bg-[var(--card-2)] px-2.5 py-1 text-xs">
                    {s.name} <span className="font-mono text-[var(--orb-muted)]">{s.count}</span>
                  </li>
                ))}
              </ul>
            </Tile>

            <div className="md:col-span-6 lg:col-span-12">
              <h2 className="mb-4 mt-12 text-3xl font-semibold tracking-tight sm:text-4xl">Featured</h2>
            </div>
            {FEATURED.map((p, i) => (
              <div key={p.slug} className="grid md:col-span-3 lg:col-span-3">
                <FeaturedTile p={p} index={i} />
              </div>
            ))}

            <Tile as="section" aria-labelledby="all-h" className="mt-12 md:col-span-6 lg:col-span-8">
              <h2 id="all-h" className="sr-only">
                All repositories
              </h2>
              <RepoSearch projects={PROJECTS} />
            </Tile>
            <Tile className="flex flex-col items-center justify-center gap-4 text-center md:col-span-6 lg:col-span-4 lg:mt-12 lg:self-start lg:sticky lg:top-6">
              <h2 className="text-3xl font-semibold tracking-tight">Pass it on</h2>
              <p className="max-w-xs text-sm text-[var(--orb-muted)]">A galaxy is better with visitors. Share this page, or follow along on GitHub.</p>
              <SharePanel className="mt-6 pb-2" title={`${PROFILE.name} · orbit`} text={`${PROJECTS.length} repositories as a galaxy.`} label="share the galaxy" venom={{ sheen: 0.8 }} />
            </Tile>
          </Bento>
        </section>
      </main>

      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-3 px-5 py-6 pb-24 font-mono text-xs text-[var(--orb-muted)] sm:px-10 md:pb-6">
          <span>Synced from GitHub · {monthYear(PROFILE.syncedAt)}</span>
          <span>{6000 + PROJECTS.length} points, one draw call each pass</span>
        </div>
      </footer>
    </div>
  );
}
