import snapshot from "./github-repos.json";
import shots from "./previews.json";

/**
 * Portfolio data: public GitHub repositories (snapshot refreshed by `npm run sync:github`) plus
 * curated copy. Everything a sample page shows comes from here, so a refresh or an edit to
 * CURATED updates all three samples at once.
 */

export type Category = "app" | "game" | "landing" | "bot";

/** One repository as stored in github-repos.json (see scripts/sync-github.mjs). */
export type Repo = {
  name: string;
  description: string | null;
  language: string | null;
  topics: string[];
  homepage: string | null;
  url: string;
  created: string;
  pushed: string;
  size: number;
  stars: number;
  forks: number;
};

const REPOS: Repo[] = snapshot.repos;

/** A screenshot of a project's live site (scripts/capture-previews.mjs), 16:10, two WebP sizes. */
export type Preview = {
  /** Card size, `width` × `height` px. */
  src: string;
  /** Half size, for touch thumbnails. */
  thumb: string;
  width: number;
  height: number;
  /** Dominant colour: the placeholder while the image loads. */
  color: string;
};

const PREVIEWS: Record<string, Preview> = shots.previews;

export type Project = {
  /** Repository name, also the stable id. */
  slug: string;
  title: string;
  blurb: string;
  category: Category;
  /** Primary language as GitHub reports it. */
  language: string;
  stack: string[];
  repo: string;
  demo: string | null;
  /** ISO dates from GitHub. */
  created: string;
  pushed: string;
  year: number;
  /** Repository size in kB, as GitHub reports it. */
  size: number;
  stars: number;
  featured: boolean;
  /** 0 … 1, stable per project: drives its generative cover. */
  seed: number;
  /** Three colours of its cover, light → dark. */
  palette: readonly [string, string, string];
  /** Screenshot of the live site, when it has one. */
  preview: Preview | null;
};

export const PROFILE = {
  handle: snapshot.user,
  name: "Devf1s",
  role: "Frontend developer",
  github: `https://github.com/${snapshot.user}`,
  syncedAt: snapshot.syncedAt,
} as const;

export const CATEGORIES: Record<Category, { label: string; plural: string }> = {
  app: { label: "Web app", plural: "Web apps" },
  game: { label: "Game", plural: "Games" },
  landing: { label: "Landing page", plural: "Landing pages" },
  bot: { label: "Bot", plural: "Bots" },
};

/** GitHub linguist colours. */
export const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  SCSS: "#c6538c",
  HTML: "#e34c26",
  CSS: "#663399",
  Python: "#3572a5",
};
export const languageColor = (lang: string) => LANGUAGE_COLORS[lang] ?? "#8b8b9a";

type Curated = { title?: string; blurb?: string; category?: Category; stack?: string[]; featured?: number; hidden?: boolean };

const markup = (language: string) => (language === "SCSS" ? ["HTML", "SCSS"] : ["HTML", "CSS"]);

/**
 * Copy for each repository. `featured` is the order on "selected work" lists (lower first).
 * Blurbs only say what the repository itself shows (description, topics, language, demo host).
 */
const CURATED: Record<string, Curated> = {
  Devf1s: { hidden: true }, // profile README
  "UI-Parts": {
    title: "UI Parts",
    blurb: "Production-minded UI parts: a WebGL symbiote button that grabs the cursor and a curved glass sidebar.",
    category: "app",
    stack: ["Next.js", "TypeScript", "WebGL2", "Tailwind", "Motion"],
    featured: 1,
  },
  ecobazar: {
    title: "Ecobazar",
    blurb: "Online store front-end built with React and TypeScript.",
    category: "app",
    stack: ["React", "TypeScript"],
    featured: 2,
  },
  "react-online-store": {
    title: "Online Store",
    blurb: "Full-stack online store: React with Redux Toolkit in front, Express, Sequelize and PostgreSQL behind it.",
    category: "app",
    stack: ["React", "Redux Toolkit", "Express", "Sequelize", "PostgreSQL"],
    featured: 3,
  },
  "bine-games": {
    title: "BINE",
    blurb: "Landing for a Web3 gaming platform, with GSAP motion, Lenis smooth scroll and Swiper sliders.",
    category: "landing",
    stack: ["GSAP", "Lenis", "Swiper", "SCSS"],
    featured: 4,
  },
  "youtube-clone": {
    title: "YouTube Clone",
    blurb: "YouTube clone in React and Material UI, fed by the YouTube API through RapidAPI.",
    category: "app",
    stack: ["React", "Material UI", "RapidAPI", "Vite"],
    featured: 5,
  },
  "tg-web-app-react": {
    title: "Telegram Web App",
    blurb: "React web app that opens inside Telegram as a bot’s Web App.",
    category: "app",
    stack: ["React", "Telegram Web Apps"],
    featured: 6,
  },
  hoobank: {
    title: "HooBank",
    blurb: "Banking landing page in React and Tailwind, built with Vite.",
    category: "landing",
    stack: ["React", "Tailwind", "Vite"],
    featured: 7,
  },
  tenzies: {
    title: "Tenzies",
    blurb: "Dice game in React: roll until all ten dice show the same number.",
    category: "game",
    stack: ["React"],
    featured: 8,
  },
  futsal: { title: "Futsal", blurb: "TypeScript web app, deployed on Vercel.", category: "app", stack: ["TypeScript"] },
  "tg-web-app-bot": {
    title: "Telegram Web App Bot",
    blurb: "The bot behind @ReactWebAppBot that opens the React web app inside Telegram.",
    category: "bot",
    stack: ["JavaScript", "Telegram Bot API"],
  },
  portfolio: { title: "Portfolio ’22", blurb: "Previous portfolio site in React and Tailwind on Vite.", category: "app", stack: ["React", "Tailwind", "Vite"] },
  quizzical: { title: "Quizzical", blurb: "Quiz game in React.", category: "game", stack: ["React"] },
  "NFT-Crypter": { title: "NFT Crypter" },
  "NFT-Peeps": { title: "NFT Peeps" },
  "boosted-USA": { title: "Boosted USA" },
  guesthouse: { title: "Guest House" },
};

/** Stable 32-bit FNV-1a hash → 0 … 1. */
export function hash01(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

/** Cover palettes, light → dark. Picked per project by its seed; all read on paper and on black. */
export const PALETTES = [
  ["#f4d8ff", "#8b5cf6", "#1e1240"],
  ["#d9f99d", "#22c55e", "#0b2a1a"],
  ["#fde68a", "#f97316", "#3b0d0d"],
  ["#bae6fd", "#3b82f6", "#0b1b3f"],
  ["#fecdd3", "#e11d48", "#2a0a14"],
  ["#e7e5e4", "#78716c", "#1c1917"],
  ["#a7f3d0", "#14b8a6", "#062925"],
  ["#fbcfe8", "#c026d3", "#2b0a33"],
] as const;

const titleCase = (s: string) =>
  s
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

export function toProject(r: Repo): Project | null {
  const c = CURATED[r.name] ?? {};
  if (c.hidden) return null;
  const seed = hash01(r.name);
  const language = r.language ?? "Other";
  const category = c.category ?? (language === "Python" ? "bot" : "landing");
  return {
    slug: r.name,
    title: c.title ?? titleCase(r.description?.trim() || r.name),
    blurb:
      c.blurb ??
      (category === "landing"
        ? `Responsive landing page, hand-coded in ${markup(language).join(" and ")}.`
        : r.description?.trim() || `${language} project.`),
    category,
    language,
    stack: c.stack ?? (language === "HTML" || language === "SCSS" ? markup(language) : [language]),
    repo: r.url,
    demo: r.homepage || null,
    created: r.created,
    pushed: r.pushed,
    year: Number(r.created.slice(0, 4)),
    size: r.size,
    stars: r.stars,
    featured: c.featured !== undefined,
    seed,
    palette: PALETTES[Math.floor(seed * PALETTES.length) % PALETTES.length],
    preview: (r.homepage && PREVIEWS[r.name]) || null,
  };
}

const order = (p: Project) => CURATED[p.slug]?.featured ?? Infinity;

/** All public projects, featured first (in curated order), then newest first. */
export const PROJECTS: Project[] = REPOS.map(toProject)
  .filter((p): p is Project => !!p)
  .sort((a, b) => order(a) - order(b) || b.created.localeCompare(a.created));

export const FEATURED = PROJECTS.filter((p) => p.featured);

/** Languages by number of repositories, most used first. */
export function languageStats(projects: Project[] = PROJECTS) {
  const counts = new Map<string, number>();
  for (const p of projects) counts.set(p.language, (counts.get(p.language) ?? 0) + 1);
  return [...counts.entries()]
    .map(([language, count]) => ({ language, count, share: count / projects.length, color: languageColor(language) }))
    .sort((a, b) => b.count - a.count || a.language.localeCompare(b.language));
}

/** Repositories created per year, every year from the first to the last included. */
export function yearStats(projects: Project[] = PROJECTS) {
  if (!projects.length) return [];
  const years = projects.map((p) => p.year);
  const from = Math.min(...years), to = Math.max(...years);
  return Array.from({ length: to - from + 1 }, (_, i) => ({
    year: from + i,
    count: projects.filter((p) => p.year === from + i).length,
  }));
}

/** Most common tags across stacks, most used first. */
export function stackStats(projects: Project[] = PROJECTS, limit = 12) {
  const counts = new Map<string, number>();
  for (const p of projects) for (const s of p.stack) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

export const byCategory = (category: Category | "all", projects: Project[] = PROJECTS) =>
  category === "all" ? projects : projects.filter((p) => p.category === category);

/** "Jan 2026" from an ISO date, in UTC so server and client agree. */
export function monthYear(iso: string) {
  const d = new Date(iso);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Host of a demo URL without "www.", for compact link labels. */
export const hostOf = (url: string) => new URL(url).host.replace(/^www\./, "");

/** Where a project lives, as an address bar shows it: "devf1s.github.io/hoobank", or its repository. */
export function siteAddress(p: Pick<Project, "demo" | "slug">) {
  if (!p.demo) return `github.com/${PROFILE.handle}/${p.slug}`;
  return `${hostOf(p.demo)}${new URL(p.demo).pathname.replace(/\/$/, "")}`;
}
