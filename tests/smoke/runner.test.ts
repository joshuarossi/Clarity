import { describe, it, expect } from "vitest";

/**
 * Smoke test: proves the test runner is wired up and can load.
 *
 * This file exists to prove `npm test` exits zero on a fresh clone
 * (post-scaffolding) with a working vitest + convex-test environment.
 * It does not assert any project-specific behavior — feature tickets
 * own that.
 */
describe("test-infrastructure smoke", () => {
  it("vitest loads and runs", () => {
    expect(1 + 1).toBe(2);
  });

  it("convex-test is importable", async () => {
    // Importing this module exercises the `server.deps.inline` chain in
    // vitest.config.ts. If that's missing or broken, this import will
    // throw "glob is not a function" at module-load time.
    const mod = await import("convex-test");
    expect(typeof mod.convexTest).toBe("function");
  });
});
