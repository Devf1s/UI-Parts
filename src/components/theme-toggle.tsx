"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useIndicator } from "@/hooks/use-indicator";
import { useMounted } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";

const OPTIONS = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "system", icon: Monitor, label: "System" },
  { value: "dark", icon: Moon, label: "Dark" },
] as const;

/** Light / system / dark switch. The pill slides between the options without an animation library. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const pill = useIndicator<HTMLSpanElement>();

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={cn("relative flex items-center gap-0.5 rounded-full bg-card-2 p-1", className)}
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "relative grid size-7 place-items-center rounded-full outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              active ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {active && (
              <span ref={pill} aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-card shadow-sm" />
            )}
            <Icon className="relative size-3.5" strokeWidth={2.2} />
          </button>
        );
      })}
    </div>
  );
}
