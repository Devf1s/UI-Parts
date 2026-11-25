import type { CSSProperties } from "react";
import type { Project } from "@/data/portfolio";

/**
 * CSS version of a project's generative cover: shown before WebGL draws, without WebGL, and in
 * places too small to be worth a GL context. Same palette and the same motif per category.
 */
export function coverStyle(p: Pick<Project, "palette" | "category" | "seed">): CSSProperties {
  const [c0, c1, c2] = p.palette;
  const a = Math.round(p.seed * 360);
  const x = 20 + Math.round(p.seed * 60);
  switch (p.category) {
    case "game":
      return {
        backgroundColor: c2,
        backgroundImage: `radial-gradient(circle at 50% 50%, ${c0} 0 30%, transparent 32%), radial-gradient(120% 90% at ${x}% 30%, ${c1}, ${c2})`,
        backgroundSize: "18px 18px, 100% 100%",
      };
    case "landing":
      return {
        backgroundColor: c2,
        backgroundImage: `repeating-linear-gradient(${a % 40 - 20}deg, ${c1} 0 18px, ${c0} 18px 26px, ${c2} 26px 46px)`,
      };
    case "bot":
      return {
        backgroundColor: c2,
        backgroundImage: `repeating-radial-gradient(circle at ${x}% 60%, ${c1} 0 6px, ${c2} 6px 16px), radial-gradient(circle at ${x}% 60%, ${c0}, transparent 60%)`,
        backgroundBlendMode: "screen",
      };
    default:
      return {
        backgroundColor: c2,
        backgroundImage: `radial-gradient(60% 50% at ${x}% 25%, ${c0}, transparent 70%), radial-gradient(70% 70% at ${100 - x}% 85%, ${c1}, transparent 72%), linear-gradient(${a}deg, ${c2}, ${c1} 55%, ${c2})`,
      };
  }
}
