"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { sound } from "./string-sound";

/** Turns the strings' sound on and off (it starts off). Plays a strum when switched on. */
export function SoundToggle({ className }: { className?: string }) {
  const on = useSyncExternalStore(sound.subscribe, () => sound.on, () => false);
  const Icon = on ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        sound.set(!on);
        if (!on) sound.strum();
      }}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full bg-card-2 px-3 text-xs font-medium text-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-[var(--ring)] aria-pressed:text-fg",
        className,
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.2} aria-hidden />
      Sound
    </button>
  );
}
