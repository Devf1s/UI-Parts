import type { MetadataRoute } from "next";
import { SITE } from "@/site/config";
import { PAGES } from "@/site/pages";

/** /manifest.webmanifest: name, colours and icons for "Add to Home Screen". */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.title,
    short_name: SITE.name,
    description: SITE.description,
    start_url: PAGES.home.href,
    display: "standalone",
    background_color: "#fff6e6",
    theme_color: SITE.themeColor.light,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
