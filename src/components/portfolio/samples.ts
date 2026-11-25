/** The portfolio samples, in dock order. Symbiote is the portfolio itself (/portfolio), the others are alternatives under it. */
export const SAMPLES = [
  {
    slug: "symbiote",
    href: "/portfolio",
    title: "Symbiote",
    tagline: "Living ink that reaches for the cursor, a project index with liquid previews.",
    webgl: "Full-screen metaball ink shader, cursor-following cover preview with velocity RGB split",
  },
  {
    slug: "gallery",
    href: "/portfolio/gallery",
    title: "Gallery",
    tagline: "Editorial grid: a cloth poster and covers that bend with the scroll.",
    webgl: "Cloth-simulated poster, DOM-synced cover planes bent by scroll velocity with hover ripples",
  },
  {
    slug: "orbit",
    href: "/portfolio/orbit",
    title: "Orbit",
    tagline: "Every repository as a star in a galaxy you can spin, plus live GitHub stats.",
    webgl: "Point-sprite galaxy: repos by date, colour by language, picking and drag to rotate",
  },
] as const;

export type SampleSlug = (typeof SAMPLES)[number]["slug"];
