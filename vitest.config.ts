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
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
  },
});
