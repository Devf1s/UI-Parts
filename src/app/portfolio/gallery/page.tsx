import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import { ClothPoster } from "@/components/portfolio/gallery/cloth-poster";
import { ProjectGrid } from "@/components/portfolio/gallery/project-grid";
import { SharePanel } from "@/components/portfolio/share-panel";
import { byCategory, CATEGORIES, languageStats, monthYear, PROFILE, PROJECTS, stackStats, yearStats, type Category } from "@/data/portfolio";
import "@/components/portfolio/gallery/gallery.css";

const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: "Gallery",
  description: "Portfolio sample: an editorial gallery of Devf1s’ GitHub projects with a WebGL cloth poster and covers that bend with the scroll.",
};

export default function GalleryPage() {
  const years = yearStats();
  const span = `${years[0]?.year}–${years.at(-1)?.year}`;
  const languages = languageStats();
  const stack = stackStats(PROJECTS, 8);
  const kinds = (Object.keys(CATEGORIES) as Category[])
    .map((c) => ({ label: CATEGORIES[c].plural, count: byCategory(c).length }))
    .filter((k) => k.count > 0);

  return (
    <div className={`pf-gallery ${serif.variable} relative min-h-dvh overflow-x-clip bg-[var(--gal-bg)] text-[var(--gal-fg)]`}>
      <header className="sticky top-0 z-20 border-b border-[var(--gal-line)] bg-[var(--gal-bg)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-10">
          <a href="#top" className="text-lg font-semibold tracking-tight outline-none focus-visible:underline">
            {PROFILE.name}
          </a>
          <nav aria-label="Sections">
            <ul className="flex items-center gap-5 text-sm">
              <li>
                <a href="#index" className="inline-flex min-h-6 items-center outline-none hover:underline focus-visible:underline">
                  Index <span className="ml-1 font-mono text-xs text-[var(--gal-muted)]">({PROJECTS.length})</span>
                </a>
              </li>
              <li>
                <a href="#contact" className="inline-flex min-h-6 items-center outline-none hover:underline focus-visible:underline">
                  Contact
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main>
        <section id="top" aria-labelledby="gal-h1" className="mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-10 sm:px-10 md:grid-cols-12 md:gap-8 md:pb-24 md:pt-16">
          <div className="flex flex-col justify-between gap-12 md:col-span-7">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-[var(--gal-muted)]">Portfolio · {span}</p>
              <h1 id="gal-h1" className="mt-6 font-serif text-[clamp(3.25rem,8.5vw,7.75rem)] leading-[0.9] tracking-[-0.02em]">
                <span className="gal-line-mask"><span className="pf-unmask block">Interfaces,</span></span>
                <span className="gal-line-mask"><span className="pf-unmask block italic text-[var(--gal-accent)]">hand-built</span></span>
                <span className="gal-line-mask"><span className="pf-unmask block">since {years[0]?.year}.</span></span>
              </h1>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-8 border-t border-[var(--gal-line)] pt-6 text-sm sm:grid-cols-3">
              <div>
                <dt className="font-mono text-xs uppercase tracking-wider text-[var(--gal-muted)]">Role</dt>
                <dd className="mt-2">{PROFILE.role}</dd>
              </div>
              <div>
                <dt className="font-mono text-xs uppercase tracking-wider text-[var(--gal-muted)]">Most used</dt>
                <dd className="mt-2">{stack.slice(0, 4).map((s) => s.name).join(", ")}</dd>
              </div>
              <div>
                <dt className="font-mono text-xs uppercase tracking-wider text-[var(--gal-muted)]">Elsewhere</dt>
                <dd className="mt-2">
                  <a href={PROFILE.github} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center underline underline-offset-4">
                    github.com/{PROFILE.handle}<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </dd>
              </div>
            </dl>
          </div>
          <ClothPoster
            className="relative aspect-[4/5] w-full md:col-span-5 md:aspect-auto md:min-h-[34rem]"
            data={{
              handle: PROFILE.handle,
              years: span.replace("–", "—"),
              count: PROJECTS.length,
              languages: languages.map(({ language, count }) => ({ language, count })),
              categories: kinds,
              url: PROFILE.github,
            }}
          />
        </section>

        <section id="index" aria-labelledby="index-h" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-16 sm:px-10 md:py-24">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-t border-[var(--gal-line)] pt-6">
            <h2 id="index-h" className="font-serif text-5xl leading-none sm:text-6xl">
              Index
            </h2>
            <p className="max-w-sm text-sm text-[var(--gal-muted)]">
              Every public repository, newest first after the selected ones. Covers are generated from each project, so no two match.
            </p>
          </div>
          <ProjectGrid projects={PROJECTS} />
        </section>

        <section aria-labelledby="lang-h" className="mx-auto max-w-7xl px-5 py-16 sm:px-10">
          <div className="grid gap-8 border-t border-[var(--gal-line)] pt-6 md:grid-cols-12">
            <h2 id="lang-h" className="font-serif text-4xl leading-none md:col-span-4">
              By language
            </h2>
            <div className="md:col-span-8">
              <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={languages.map((l) => `${l.language} ${l.count}`).join(", ")}>
                {languages.map((l) => (
                  <span key={l.language} style={{ width: `${l.share * 100}%`, background: l.color }} />
                ))}
              </div>
              <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {languages.map((l) => (
                  <li key={l.language} className="border-t border-[var(--gal-line)] pt-3">
                    <span className="flex items-center gap-2 text-sm">
                      <span aria-hidden className="size-2.5 rounded-full" style={{ background: l.color }} />
                      {l.language}
                    </span>
                    <span className="mt-1 block font-serif text-4xl leading-none">{Math.round(l.share * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="contact" aria-labelledby="contact-h" className="mx-auto max-w-7xl scroll-mt-20 px-5 pb-36 pt-20 sm:px-10">
          <div className="border-t border-[var(--gal-line)] pt-10 text-center">
            <h2 id="contact-h" className="font-serif text-[clamp(3rem,9vw,8rem)] leading-[0.9]">
              Say <span className="italic text-[var(--gal-accent)]">hello</span>, or pass it on.
            </h2>
            <SharePanel className="mt-14" title={`${PROFILE.name} · gallery`} text={`${PROFILE.name}: ${PROJECTS.length} projects, ${span}.`} venom={{ radius: 18 }} />
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--gal-line)]">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-3 px-5 py-6 pb-24 font-mono text-xs text-[var(--gal-muted)] sm:px-10 md:pb-6">
          <span>Synced from GitHub · {monthYear(PROFILE.syncedAt)}</span>
          <span>Covers and poster: raw WebGL2</span>
        </div>
      </footer>
    </div>
  );
}
