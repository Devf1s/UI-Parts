"use client";

import { ArrowUpRight } from "lucide-react";
import { VenomButton } from "@/components/ui/venom-button";
import { Magnetic } from "../magnetic";

export function HeroActions({ github }: { github: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
      <VenomButton
        className="h-14 px-8 text-base sm:h-16 sm:px-10 sm:text-lg"
        reach={150}
        sheen={0.6}
        onClick={() => {
          const work = document.getElementById("work");
          work?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
          work?.focus({ preventScroll: true });
        }}
      >
        see the work
      </VenomButton>
      <Magnetic>
        <a
          href={github}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:underline"
        >
          GitHub profile <ArrowUpRight className="size-4" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </Magnetic>
    </div>
  );
}
