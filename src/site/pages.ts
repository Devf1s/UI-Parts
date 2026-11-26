import type { Metadata } from "next";
import { SITE } from "./config";

/**
 * Every page of the site, in one place. The index, the sitemap and page metadata read it, so a new
 * page is one entry here plus its route folder. Keep it free of data imports: client components
 * (the dock) read it too.
 */
export type SitePage = {
  href: `/${string}`;
  /** Short name for buttons and navigation. */
  label: string;
  /** Document title, filled into the title template of its layout. */
  title: string;
  description: string;
  /** Relative weight for search engines, 0…1. */
  priority: number;
};

export const PAGES = {
  home: {
    href: "/",
    label: "Index",
    title: SITE.title,
    description: "Every page of the site: the portfolio, two alternative portfolio designs and the UI parts lab, each behind a cartoon button with a character on it.",
    priority: 1,
  },
  portfolio: {
    href: "/portfolio",
    label: "Portfolio",
    title: "Portfolio",
    description: "Devf1s’ public GitHub projects, from hand-coded landing pages to React apps and WebGL, around living ink that follows the cursor.",
    priority: 0.9,
  },
  gallery: {
    href: "/portfolio/gallery",
    label: "Gallery",
    title: "Gallery",
    description: "Portfolio sample: an editorial gallery of Devf1s’ GitHub projects with a WebGL cloth poster and covers that bend with the scroll.",
    priority: 0.6,
  },
  orbit: {
    href: "/portfolio/orbit",
    label: "Orbit",
    title: "Orbit",
    description: "Portfolio sample: Devf1s’ GitHub repositories as a WebGL galaxy, placed by age and coloured by language, with live stats.",
    priority: 0.6,
  },
  lab: {
    href: "/test",
    label: "UI parts",
    title: "UI parts lab",
    description: "Animated glass sidebar and a liquid “venom” cursor button. Next.js, TypeScript, Tailwind and Motion.",
    priority: 0.5,
  },
} as const satisfies Record<string, SitePage>;

export type PageKey = keyof typeof PAGES;

/**
 * Metadata of a registered page: title, description, canonical URL and the Open Graph / X cards
 * (Next replaces `openGraph` as a whole per segment, so each page gets the full object, card
 * image included).
 */
export function pageMetadata(key: PageKey, override: { title?: Metadata["title"]; description?: string } = {}): Metadata {
  const page: SitePage = PAGES[key];
  const description = override.description ?? page.description;
  const title = override.title ?? page.title;
  const social = typeof title === "string" ? title : page.title;
  return {
    title,
    description,
    alternates: { canonical: page.href },
    openGraph: { type: "website", siteName: SITE.name, locale: SITE.locale, url: page.href, title: social, description, images: [SITE.image] },
    twitter: { card: "summary_large_image", title: social, description, images: [SITE.image] },
  };
}
