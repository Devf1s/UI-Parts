import { describe, expect, it } from "vitest";
import snapshot from "./github-repos.json";
import {
  byCategory,
  FEATURED,
  hash01,
  hostOf,
  languageStats,
  monthYear,
  PALETTES,
  PROJECTS,
  stackStats,
  toProject,
  yearStats,
} from "./portfolio";

describe("portfolio data", () => {
  it("hashes names to a stable number in [0, 1)", () => {
    expect(hash01("ecobazar")).toBe(hash01("ecobazar"));
    expect(hash01("ecobazar")).not.toBe(hash01("ecobazar2"));
    for (const r of snapshot.repos) {
      const h = hash01(r.name);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it("lists every repository of the snapshot except the profile README", () => {
    expect(PROJECTS.map((p) => p.slug)).not.toContain(snapshot.user);
    expect(PROJECTS).toHaveLength(snapshot.repos.filter((r) => r.name !== snapshot.user).length);
    expect(new Set(PROJECTS.map((p) => p.slug)).size).toBe(PROJECTS.length);
  });

  it("puts featured projects first, in curated order, then newest first", () => {
    expect(FEATURED.length).toBeGreaterThanOrEqual(6);
    expect(PROJECTS.slice(0, FEATURED.length)).toEqual(FEATURED);
    expect(FEATURED[0].slug).toBe("UI-Parts");
    const rest = PROJECTS.slice(FEATURED.length);
    for (let i = 1; i < rest.length; i++) expect(rest[i - 1].created >= rest[i].created).toBe(true);
  });

  it("gives every project copy, links, a year and a palette", () => {
    for (const p of PROJECTS) {
      expect(p.title.length).toBeGreaterThan(1);
      expect(p.blurb).toMatch(/\.$/);
      expect(p.repo).toMatch(/^https:\/\/github\.com\//);
      if (p.demo) expect(() => new URL(p.demo!)).not.toThrow();
      expect(p.year).toBeGreaterThanOrEqual(2015);
      expect(PALETTES).toContainEqual(p.palette);
      expect(p.stack.length).toBeGreaterThan(0);
    }
  });

  it("derives sensible defaults for repositories without curated copy", () => {
    const p = toProject({ ...snapshot.repos[0], name: "some-landing", description: null, language: "HTML", homepage: "" })!;
    expect(p.title).toBe("Some Landing");
    expect(p.category).toBe("landing");
    expect(p.stack).toEqual(["HTML", "CSS"]);
    expect(p.blurb).toBe("Responsive landing page, hand-coded in HTML and CSS.");
    expect(p.demo).toBeNull();
    expect(toProject({ ...snapshot.repos[0], name: "x", language: "Python" })!.category).toBe("bot");
  });

  it("counts languages, years and stack without losing a project", () => {
    const langs = languageStats();
    expect(langs.reduce((n, l) => n + l.count, 0)).toBe(PROJECTS.length);
    expect(langs.reduce((n, l) => n + l.share, 0)).toBeCloseTo(1);
    for (let i = 1; i < langs.length; i++) expect(langs[i - 1].count).toBeGreaterThanOrEqual(langs[i].count);

    const years = yearStats();
    expect(years.reduce((n, y) => n + y.count, 0)).toBe(PROJECTS.length);
    for (let i = 1; i < years.length; i++) expect(years[i].year).toBe(years[i - 1].year + 1);

    const stack = stackStats(PROJECTS, 5);
    expect(stack).toHaveLength(5);
    for (let i = 1; i < stack.length; i++) expect(stack[i - 1].count).toBeGreaterThanOrEqual(stack[i].count);
    expect(yearStats([])).toEqual([]);
  });

  it("filters by category", () => {
    expect(byCategory("all")).toBe(PROJECTS);
    const sum = (["app", "game", "landing", "bot"] as const).reduce((n, c) => n + byCategory(c).length, 0);
    expect(sum).toBe(PROJECTS.length);
    expect(byCategory("game").every((p) => p.category === "game")).toBe(true);
  });

  it("formats dates in UTC and hosts without www", () => {
    expect(monthYear("2026-01-01T00:30:00Z")).toBe("Jan 2026");
    expect(monthYear("2025-12-31T23:30:00Z")).toBe("Dec 2025");
    expect(hostOf("https://www.example.com/a")).toBe("example.com");
    expect(hostOf("https://devf1s.github.io/hoobank/")).toBe("devf1s.github.io");
  });
});
