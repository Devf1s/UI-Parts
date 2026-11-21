#!/usr/bin/env node
/**
 * Refreshes src/data/github-repos.json from the public GitHub API.
 *
 *   node scripts/sync-github.mjs            # user from package.json "portfolio.github" or Devf1s
 *   GITHUB_TOKEN=… node scripts/sync-github.mjs Devf1s
 *
 * Only public, non-fork repositories are kept, with the fields the portfolio pages use. Curated
 * copy (names, blurbs, categories) lives in src/data/portfolio.ts and survives a refresh.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const user = process.argv[2] ?? "Devf1s";
const out = fileURLToPath(new URL("../src/data/github-repos.json", import.meta.url));
const headers = { accept: "application/vnd.github+json", "user-agent": "ui-parts-portfolio-sync" };
if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const repos = [];
for (let page = 1; page < 10; page++) {
  const res = await fetch(`https://api.github.com/users/${user}/repos?type=owner&per_page=100&page=${page}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const batch = await res.json();
  repos.push(...batch);
  if (batch.length < 100) break;
}

const keep = repos
  .filter((r) => !r.fork && !r.private && !r.archived)
  .map((r) => ({
    name: r.name,
    description: r.description,
    language: r.language,
    topics: r.topics ?? [],
    homepage: r.homepage || null,
    url: r.html_url,
    created: r.created_at,
    pushed: r.pushed_at,
    size: r.size,
    stars: r.stargazers_count,
    forks: r.forks_count,
  }))
  .sort((a, b) => b.created.localeCompare(a.created));

await writeFile(out, `${JSON.stringify({ user, syncedAt: new Date().toISOString(), repos: keep }, null, 2)}\n`);
console.log(`wrote ${keep.length} repositories of ${user} to ${out}`);
