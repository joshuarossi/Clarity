import { describe, it, expect } from "vitest";
import { loadConfigFromFile } from "vite";
import path from "node:path";

/**
 * WOR-102: Vite config includes VITE_CONVEX_URL environment variable
 *
 * Verifies that vite.config.ts is parseable and includes the react plugin.
 * The VITE_ env prefix is Vite's default behavior, so VITE_CONVEX_URL is
 * automatically exposed to the client. We verify the config loads without
 * error and includes the react() plugin.
 */

const configPath = path.resolve(__dirname, "../../vite.config.ts");

describe("AC: Vite config includes VITE_CONVEX_URL environment variable", () => {
  it("vite.config.ts loads without error", async () => {
    const result = await loadConfigFromFile(
      { command: "serve", mode: "development" },
      configPath,
    );

    expect(result).not.toBeNull();
    expect(result?.config).toBeDefined();
  });

  it("includes the react plugin", async () => {
    const result = await loadConfigFromFile(
      { command: "serve", mode: "development" },
      configPath,
    );

    // The react plugin registers with name "vite:react-babel" (or similar)
    const plugins = result?.config.plugins?.flat() ?? [];
    const pluginNames = plugins
      .filter(
        (p): p is { name: string } =>
          p !== null && typeof p === "object" && "name" in p,
      )
      .map((p) => p.name);

    expect(pluginNames.some((name) => name.includes("react"))).toBe(true);
  });

  it("does not override envPrefix to exclude VITE_ vars", async () => {
    const result = await loadConfigFromFile(
      { command: "serve", mode: "development" },
      configPath,
    );

    // If envPrefix is set, it must include "VITE_" (the default).
    // If envPrefix is not set, Vite defaults to "VITE_" which is correct.
    const envPrefix = result?.config.envPrefix;
    if (envPrefix !== undefined) {
      const prefixes = Array.isArray(envPrefix) ? envPrefix : [envPrefix];
      expect(prefixes).toContain("VITE_");
    }
    // If undefined, the default "VITE_" applies — test passes
  });
});
