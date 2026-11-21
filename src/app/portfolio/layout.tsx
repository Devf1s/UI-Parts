import type { Metadata } from "next";
import { SampleDock } from "@/components/portfolio/sample-dock";
import "./portfolio.css";

export const metadata: Metadata = {
  title: { template: "%s · Devf1s portfolio sample", default: "Portfolio samples · Devf1s" },
  description: "Three portfolio samples built from Devf1s’ public GitHub projects, each with its own WebGL centrepiece.",
};

export default function PortfolioLayout({ children }: LayoutProps<"/portfolio">) {
  return (
    <>
      {children}
      <SampleDock />
    </>
  );
}
