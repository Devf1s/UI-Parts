import type { Metadata } from "next";
import { Showcase } from "../showcase";

export const metadata: Metadata = {
  title: "UI parts — sidebar & venom button",
  description: "Animated sidebar and a liquid “venom” cursor button. Next.js + TypeScript + Tailwind + Motion.",
};

/** The component showcase: curved glass sidebar and venom button on a neutral landing page. */
export default function TestPage() {
  return <Showcase />;
}
