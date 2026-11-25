/**
 * Site-wide facts: name, canonical origin, theme colours. No data imports, so client code may read it
 * too (but `url` is only meaningful on the server: the Vercel variables are not sent to the browser).
 *
 * The origin comes from NEXT_PUBLIC_SITE_URL when set (a custom domain), else from the URL Vercel
 * gives the build (production or branch preview), else localhost.
 */
function origin() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit;
  const host =
    process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : (process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL);
  return host ? `https://${host}` : `http://localhost:${process.env.PORT ?? 3000}`;
}

export const SITE = {
  name: "Devf1s",
  title: "Devf1s · UI parts",
  description: "Devf1s’ portfolio and UI parts lab: WebGL portfolio designs built from public GitHub projects, cartoon buttons, a glass sidebar and a liquid venom button.",
  url: new URL(origin()),
  locale: "en_US",
  /** The social card every page shares (public/og.jpg, 1200×630). */
  image: {
    url: "/og.jpg",
    width: 1200,
    height: 630,
    alt: "Devf1s: portfolio and UI parts. A cartoon cat next to the words “Portfolio & UI parts” and four page buttons: Portfolio, Gallery, Orbit, UI parts.",
  },
  /** Browser UI colour (address bar, PWA splash), per colour scheme. */
  themeColor: { light: "#f6f6f8", dark: "#08080b" },
} as const;
