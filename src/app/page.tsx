import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Fredoka } from "next/font/google";
import { ThemeToggle } from "@/components/theme-toggle";
import { BoxerButton, NekoButton, PopupButton, RocketButton, SoundToggle } from "@/components/ui/toon-button";
import "./home.css";

const toon = Fredoka({ subsets: ["latin"], variable: "--font-toon", display: "swap" });

export const metadata: Metadata = {
  title: { absolute: "Devf1s · UI parts" },
  description: "Every page of the site: the portfolio, two alternative portfolio designs and the UI parts lab, each behind a cartoon button with a character on it.",
};

const TITLE = "Where to?";

/** Every page of the site, in the middle of the screen, each behind a cartoon button. */
export default function Home() {
  return (
    <div className={`home ${toon.variable} relative flex min-h-dvh flex-col`}>
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
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
          <p className="home-lede">Four pages, four buttons, and somebody lives on each of them. Go on, say hi.</p>

          <nav aria-label="Pages" className="mt-14">
            <ol className="grid gap-11">
              <li>
                <NekoButton href="/portfolio" meta="/portfolio" index={0} aria-describedby="hint-portfolio">
                  Portfolio
                </NekoButton>
                <p id="hint-portfolio" className="home-hint">
                  neko · watches your cursor, ducks when you press
                </p>
              </li>
              <li>
                <PopupButton href="/portfolio/gallery" meta="/portfolio/gallery" index={1} aria-describedby="hint-gallery">
                  Gallery
                </PopupButton>
                <p id="hint-gallery" className="home-hint">
                  pop-up · the pictures jump out, petals fall
                </p>
              </li>
              <li>
                <RocketButton href="/portfolio/orbit" meta="/portfolio/orbit" index={2} aria-describedby="hint-orbit">
                  Orbit
                </RocketButton>
                <p id="hint-orbit" className="home-hint">
                  rocket · it rumbles, smokes, then lifts off
                </p>
              </li>
              <li>
                <BoxerButton href="/test" meta="/test" index={3} aria-describedby="hint-test">
                  UI parts
                </BoxerButton>
                <p id="hint-test" className="home-hint">
                  jack-in-the-box · mind the glove
                </p>
              </li>
            </ol>
          </nav>
        </div>
      </main>
    </div>
  );
}
