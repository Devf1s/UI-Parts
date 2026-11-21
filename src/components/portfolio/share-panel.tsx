"use client";

import { Share2 } from "lucide-react";
import type { ComponentProps } from "react";
import { VenomButton } from "@/components/ui/venom-button";
import { cn } from "@/lib/cn";
import { shareMessage, useShare } from "./use-share";

/** Venom button that shares the page (native sheet, or copies the link), with a live status line. */
export function SharePanel({
  title,
  text,
  label = "share this portfolio",
  className,
  venom,
}: {
  title: string;
  text?: string;
  label?: string;
  className?: string;
  venom?: Partial<ComponentProps<typeof VenomButton>>;
}) {
  const { share, status } = useShare({ title, text });
  return (
    <div className={cn("flex flex-col items-center gap-5", className)}>
      <VenomButton className="h-14 gap-2.5 px-8 text-base sm:h-16 sm:px-10 sm:text-lg" reach={150} onClick={share} {...venom}>
        <Share2 className="size-4" aria-hidden />
        {label}
      </VenomButton>
      <p role="status" className="min-h-5 text-sm text-[var(--muted)]">
        {shareMessage[status]}
      </p>
    </div>
  );
}
