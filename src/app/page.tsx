import type { CSSProperties } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { BoxerButton, NekoButton, PopupButton, RocketButton, SoundToggle } from "@/components/ui/toon-button";
import { fredoka } from "@/fonts/fredoka";
import { PAGES, pageMetadata, type PageKey } from "@/site/pages";
import "./home.css";

export const metadata = pageMetadata("home", { title: { absolute: PAGES.home.title } });

/** The pages behind the buttons, in order. A new page gets an entry in the registry and a door here. */
const DOORS: { page: Exclude<PageKey, "home">; Button: typeof NekoButton; hint: string }[] = [
  { page: "portfolio", Button: NekoButton, hint: "neko · watches your cursor, ducks when you press" },
  { page: "gallery", Button: PopupButton, hint: "pop-up · the pictures jump out, petals fall" },
  { page: "orbit", Button: RocketButton, hint: "rocket · it rumbles, smokes, then lifts off" },
  { page: "lab", Button: BoxerButton, hint: "jack-in-the-box · mind the glove" },
];
const COUNT = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"][DOORS.length - 1] ?? String(DOORS.length);

const TITLE = "Where to?";

/** Every page of the site, in the middle of the screen, each behind a cartoon button. */
export default function Home() {
  return (
    <div className={`home ${fredoka.variable} relative flex min-h-dvh flex-col`}>
      {/* above main: the title's letters drop in from above it and must never cover the switches */}
      <header className="z-10 flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <p className="home-logo">devf1s</p>
        <div className="flex items-center gap-2">
          <SoundToggle />
          <ThemeToggle className="home-theme" />
        </div>
      </header>

      <main className="grid flex-1 place-items-center px-5 pb-12 pt-2">
        <div className="w-full max-w-[30rem]">
          <h1 className="home-title">
            <span className="sr-only">{TITLE}</span>
            <span aria-hidden>
              {[...TITLE].map((ch, i) => (
                <span key={i} className="home-title__ch" style={{ "--i": i } as CSSProperties}>
                  {ch === " " ? " " : ch}
                </span>
              ))}
            </span>
          </h1>
          <p className="home-lede">
            {COUNT} pages, {COUNT.toLowerCase()} buttons, and somebody lives on each of them. Go on, say hi.
          </p>

          <nav aria-label="Pages" className="mt-14">
            <ol className="grid gap-11">
              {DOORS.map(({ page, Button, hint }, i) => (
                <li key={page}>
                  <Button href={PAGES[page].href} meta={PAGES[page].href} index={i} aria-describedby={`hint-${page}`}>
                    {PAGES[page].label}
                  </Button>
                  <p id={`hint-${page}`} className="home-hint">
                    {hint}
                  </p>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </main>
    </div>
  );
}
