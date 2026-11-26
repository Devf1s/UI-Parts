import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Hands `next/font` families to a subtree without adding a box (`display: contents`). Fonts are
 * preloaded only on the routes that render them, so a family that only some pages use belongs in
 * the layout of those pages, scoped with this, rather than on <html>.
 */
export function FontScope({ fonts, className, children }: { fonts: { variable: string }[]; className?: string; children: ReactNode }) {
  return <div className={cn("contents", ...fonts.map((f) => f.variable), className)}>{children}</div>;
}
