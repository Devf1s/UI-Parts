import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SampleDock } from "@/components/portfolio/sample-dock";
import "./portfolio.css";

export const metadata: Metadata = {
  title: { template: "%s · Devf1s portfolio sample", default: "Portfolio samples · Devf1s" },
  description: "Three portfolio samples built from Devf1s’ public GitHub projects, each with its own WebGL centrepiece.",
};

/** The portfolio (Symbiote) and its two alternative samples share the dock and its styles. */
export default function PortfolioLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SampleDock />
    </>
  );
}
