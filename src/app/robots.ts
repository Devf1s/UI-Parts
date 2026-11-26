import type { MetadataRoute } from "next";
import { SITE } from "@/site/config";

/** /robots.txt. Vercel marks preview deployments noindex on its own. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: new URL("/sitemap.xml", SITE.url).href, host: SITE.url.origin };
}
