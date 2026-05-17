import { defineConfig } from "vitest/config";

// `server.deps.inline: ["convex-test"]` is required because convex-test uses
// `import.meta.glob` internally (a Vite compile-time transform). Without
// inlining, vitest treats convex-test as a node_modules external and skips
// Vite's transform pipeline, leaving `import.meta.glob` undefined at runtime
// → all convex-test invocations crash with "glob is not a function".
//
// This is the documented requirement in the convex-test README. The v2.x
// config path is `test.server.deps.inline` (nested), not the legacy v1.x
// top-level `deps.inline`.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // `e2e/` holds Playwright specs (`*.spec.ts` using `test.describe()` from
    // @playwright/test). They are run by the separate `test:e2e` script
    // (`playwright test`), not vitest. Without this exclude, vitest's default
    // glob picks them up and every e2e file errors with "Playwright Test did
    // not expect test.describe() to be called here." `node_modules`/`dist`
    // are vitest defaults, restated here because specifying `exclude`
    // replaces the default list rather than extending it.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
  },
});
