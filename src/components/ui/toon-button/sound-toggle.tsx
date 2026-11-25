"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { sound } from "./toon-sound";

/** Turns the cartoon sound effects on and off (they start off). Says "pop" when switched on. */
export function SoundToggle({ className }: { className?: string }) {
  const on = useSyncExternalStore(sound.subscribe, () => sound.on, () => false);
  const Icon = on ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        sound.set(!on);
        if (!on) sound.play("pop");
      }}
      className={cn("toon-chip", className)}
    >
      <Icon className="size-4" strokeWidth={2.4} aria-hidden />
      Sound
    </button>
  );
}
