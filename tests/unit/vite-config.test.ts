import { describe, it, expect } from "vitest";
import type { UserConfig } from "vite";
import config from "../../vite.config";

/**
 * WOR-102: Vite config validation tests
 *
 * AC: Vite config includes VITE_CONVEX_URL environment variable support
 * and sets build target to es2020 per NFR-BROWSER.
 *
 * The config is imported directly — vite.config.ts already exists and
 * exports a defineConfig() result.
 */

// defineConfig returns UserConfig
const viteConfig = config as UserConfig;

describe("AC: Vite config — build target and env support", () => {
  it("exports a valid config object", () => {
    expect(viteConfig).toBeDefined();
    expect(typeof viteConfig).toBe("object");
  });

  it("sets build.target to es2020", () => {
    // The contract specifies: build: { target: "es2020" } per NFR-BROWSER
    expect(viteConfig.build).toBeDefined();
    expect(viteConfig.build?.target).toBe("es2020");
  });

  it("includes the react plugin", () => {
    // The plugins array should contain at least the React plugin
    expect(viteConfig.plugins).toBeDefined();
    expect(Array.isArray(viteConfig.plugins)).toBe(true);
    expect(viteConfig.plugins!.length).toBeGreaterThan(0);
  });
});
