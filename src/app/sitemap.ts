import type { MetadataRoute } from "next";
import { SITE } from "@/site/config";
import { PAGES } from "@/site/pages";

/** /sitemap.xml: every page in the registry. */
export default function sitemap(): MetadataRoute.Sitemap {
  return Object.values(PAGES).map((p) => ({ url: new URL(p.href, SITE.url).href, changeFrequency: "monthly", priority: p.priority }));
}
