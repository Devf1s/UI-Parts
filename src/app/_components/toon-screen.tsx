import type { ReactNode } from "react";

/**
 * Full-screen message in the cartoon look of the index (paper, chunky lettering, sticker buttons),
 * for the 404 and error pages. Those boundaries are part of every route, so this is built from
 * Tailwind utilities only: whatever a boundary imports (a font, a stylesheet, component code) every
 * page would download. The lettering uses the index's font where it is loaded, else system rounded.
 */
export function ToonScreen({ code, title, art, children, actions }: { code: string; title: string; art?: ReactNode; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-x-clip bg-[radial-gradient(circle,rgb(27_21_48/0.075)_1.2px,transparent_1.6px)] bg-[length:16px_16px] bg-[#fff6e6] px-5 py-12 text-[#1b1530] [font-family:var(--font-toon,ui-rounded),ui-rounded,system-ui,sans-serif] dark:bg-[radial-gradient(circle,rgb(255_255_255/0.06)_1.2px,transparent_1.6px)] dark:bg-[#1b1633] dark:text-[#fff4e0]">
      <main className="w-full max-w-[30rem] text-center">
        {art}
        <p aria-hidden className="text-[clamp(4.5rem,24vw,7.5rem)] font-bold leading-none tracking-tight [text-shadow:0.06em_0.07em_0_#ff8fc7] dark:[text-shadow:0.06em_0.07em_0_#7c5cff]">
          {code}
        </p>
        <h1 className="mt-3 text-[clamp(1.75rem,7vw,2.25rem)] font-bold leading-tight">{title}</h1>
        <p className="mx-auto mt-3 max-w-[22rem] text-[1.05rem] font-medium leading-relaxed text-[#5f5675] dark:text-[#c4bbdf]">{children}</p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">{actions}</div>
      </main>
    </div>
  );
}

/** A chunky sticker button (pressed in on tap), as a class list for <a> and <button>. */
export const toonButton = (fill: string) =>
  `inline-flex h-14 items-center justify-center rounded-[20px] border-[3px] border-[#1b1530] px-6 text-lg font-bold text-[#1b1530] shadow-[0_6px_0_#1b1530] outline-none transition-[translate,box-shadow] duration-100 active:translate-y-[5px] active:shadow-[0_1px_0_#1b1530] focus-visible:ring-[3px] focus-visible:ring-[#7c5cff] focus-visible:ring-offset-4 focus-visible:ring-offset-[#fff6e6] dark:focus-visible:ring-offset-[#1b1633] ${fill}`;

/** The site's cat (the one from the icon), peeking. Static markup, no script. */
export function PeekingCat() {
  return (
    <svg aria-hidden viewBox="0 0 96 64" className="mx-auto -mb-1 w-32 motion-safe:animate-[peek_2.4s_ease-in-out_infinite]">
      <path d="M10 64V52c0-11 3-19 8-24l1-23 18 14c3.5-1 7-1.4 11-1.4s7.5.4 11 1.4l18-14 1 23c5 5 8 13 8 24v12Z" fill="#fffaf0" />
      <path d="M19 5l18 14c-4 1-8 4-10 8-3 3-7 3-9 1Z" fill="#ffad4d" />
      <path d="M22.5 12l1 13 8.5-5.5Z M73.5 12l-1 13-8.5-5.5Z" fill="#ffb3c8" />
      <path d="M10 64V52c0-11 3-19 8-24l1-23 18 14c3.5-1 7-1.4 11-1.4s7.5.4 11 1.4l18-14 1 23c5 5 8 13 8 24v12" fill="none" stroke="#1b1530" strokeWidth="3.2" strokeLinejoin="round" />
      <ellipse cx="34" cy="46" rx="7.5" ry="9" fill="#5b3bd6" stroke="#1b1530" strokeWidth="2.6" />
      <ellipse cx="62" cy="46" rx="7.5" ry="9" fill="#5b3bd6" stroke="#1b1530" strokeWidth="2.6" />
      <circle cx="31.5" cy="42.5" r="2.6" fill="#fff" />
      <circle cx="59.5" cy="42.5" r="2.6" fill="#fff" />
      <path d="M44 58q4 3 8 0" fill="none" stroke="#1b1530" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
