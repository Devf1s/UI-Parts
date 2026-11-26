"use client";

import { Home } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { useIndicator } from "@/hooks/use-indicator";
import { cn } from "@/lib/cn";
import { PAGES } from "@/site/pages";
import { SAMPLES } from "./samples";

/** Floating dock to hop between portfolio samples, switch theme and get back to the list of all pages. */
export function SampleDock() {
  const path = usePathname();
  const router = useRouter();
  const pill = useIndicator<HTMLSpanElement>();
  // The dock is on screen on every page, so viewport prefetching would download the code of every
  // other page on first load. Prefetch a page once the visitor points at or focuses its link.
  const intent = (href: string) => {
    const warm = () => router.prefetch(href);
    return { prefetch: false, onPointerEnter: warm, onFocus: warm };
  };
  return (
    <nav
      aria-label="Portfolio samples"
      className="pf-dock fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full p-1 text-[13px] max-[359px]:gap-0.5 max-[359px]:text-xs"
    >
      <Link
        href={PAGES.home.href}
        {...intent(PAGES.home.href)}
        aria-label="All pages"
        title="All pages"
        className="grid size-9 shrink-0 place-items-center rounded-full max-[359px]:size-8 text-[var(--dock-muted)] outline-none transition-colors hover:text-[var(--dock-fg)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <Home className="size-4" />
      </Link>
      <ul className="flex items-center">
        {SAMPLES.map((s) => {
          const href = s.href;
          const active = path === href;
          return (
            <li key={s.slug}>
              <Link
                href={href}
                {...intent(href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-9 items-center rounded-full px-3 font-medium max-[359px]:px-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  active ? "text-[var(--dock-active-fg)]" : "text-[var(--dock-muted)] hover:text-[var(--dock-fg)]",
                )}
              >
                {active && (
                  <span ref={pill} aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-[var(--dock-active)]" />
                )}
                <span className="relative">{s.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {/* the smallest phones (320 px) get a tighter dock so that all of it stays on screen */}
      <ThemeToggle className="ml-0.5 bg-[var(--dock-well)] max-[359px]:[&_button]:size-6" />
    </nav>
  );
}
