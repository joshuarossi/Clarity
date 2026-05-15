import { describe, it, expect } from "vitest";
import config from "../../playwright.config";

/**
 * WOR-107: Playwright config validation
 *
 * AC 1 — playwright.config.ts must define projects for Chromium, Firefox,
 * and WebKit with baseURL pointing to the localhost dev server.
 *
 * At red state: the existing config only has a "chromium" project, so the
 * tests asserting "firefox" and "webkit" will fail with assertion errors.
 * That is the correct red-state failure — behavioral, not structural.
 */

describe("WOR-107: playwright.config.ts — three-browser setup", () => {
  it("defines a chromium project", () => {
    const projectNames = (config.projects ?? []).map((p) => p.name);
    expect(projectNames).toContain("chromium");
  });

  it("defines a firefox project", () => {
    const projectNames = (config.projects ?? []).map((p) => p.name);
    expect(projectNames).toContain("firefox");
  });

  it("defines a webkit project", () => {
    const projectNames = (config.projects ?? []).map((p) => p.name);
    expect(projectNames).toContain("webkit");
  });

  it("has exactly three browser projects", () => {
    expect(config.projects).toHaveLength(3);
  });

  it("sets baseURL to the Vite dev server", () => {
    expect(config.use?.baseURL).toBe("http://localhost:5173");
  });

  it("enables CI-aware retries", () => {
    // retries is set via process.env.CI ternary — at test time without CI
    // env, it evaluates to 0, which is still a valid configuration
    expect(config).toHaveProperty("retries");
    expect(typeof config.retries).toBe("number");
  });

  it("enables CI-aware worker count", () => {
    // workers is process.env.CI ? 1 : undefined — both are valid values
    expect(config).toHaveProperty("workers");
  });
});
