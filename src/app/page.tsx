import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
import { FilingsButton } from "@/components/ui/filings-button";
import { HeatButton } from "@/components/ui/heat-button";
import { SoundToggle, StringsButton } from "@/components/ui/strings-button";
import { TrivisionButton } from "@/components/ui/trivision-button";
import "./home.css";

export const metadata: Metadata = {
  title: { absolute: "Devf1s · UI parts" },
  description: "Every page of the site: the portfolio, two alternative portfolio designs and the UI parts lab, each behind a new kind of button.",
};

/** Every page of the site, in the middle of the screen, each behind a new kind of button. */
export default function Home() {
  return (
    <div className="home relative flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <p className="whitespace-nowrap font-mono text-xs uppercase tracking-[0.12em] text-muted sm:tracking-[0.25em]">
          devf1s<span className="max-sm:hidden"> · ui parts</span>
        </p>
        <div className="flex items-center gap-2">
          <SoundToggle />
          <ThemeToggle />
        </div>
      </header>

      <main className="grid flex-1 place-items-center px-5 pb-16 pt-2 sm:pt-6">
        <div className="w-full max-w-[30rem]">
          <h1 className="text-center text-[clamp(2.25rem,7vw,3.25rem)] font-semibold leading-none tracking-[-0.045em]">Where to?</h1>
          <p className="mx-auto mt-4 max-w-sm text-center text-sm leading-relaxed text-muted">
            Four pages, four new buttons. Each is a little piece of physics: heat, light, magnetism and sound.
          </p>

          <nav aria-label="Pages" className="mt-10">
            <ol className="grid gap-5">
              <li>
                <HeatButton href="/portfolio" meta="/portfolio" aria-describedby="hint-portfolio">
                  Portfolio
                </HeatButton>
                <p id="hint-portfolio" className="home-hint">
                  thermal · rub it and it warms up
                </p>
              </li>
              <li>
                <TrivisionButton
                  href="/portfolio/gallery"
                  meta="/portfolio/gallery"
                  aria-describedby="hint-gallery"
                  hover={
                    <>
                      <span className="tv-btn__label">Cloth &amp; paper</span>
                      <span className="tv-btn__meta">editorial portfolio</span>
                    </>
                  }
                >
                  Gallery
                </TrivisionButton>
                <p id="hint-gallery" className="home-hint">
                  trivision · the panels turn to face you
                </p>
              </li>
              <li>
                <FilingsButton href="/portfolio/orbit" meta="/portfolio/orbit" aria-describedby="hint-orbit">
                  Orbit
                </FilingsButton>
                <p id="hint-orbit" className="home-hint">
                  magnetism · you are the second magnet
                </p>
              </li>
              <li>
                <StringsButton href="/test" meta="/test" aria-describedby="hint-test">
                  UI parts
                </StringsButton>
                <p id="hint-test" className="home-hint">
                  acoustics · strum the strings, sound on for the harp
                </p>
              </li>
            </ol>
          </nav>
        </div>
      </main>
    </div>
  );
}
