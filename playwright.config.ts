import { defineConfig, devices } from "@playwright/test";

// E2E config for Clarity. Per TechSpec §10: tests run against the Vite dev
// server (or `vite preview` after build). Future tickets will fill in
// individual specs under `e2e/`; this baseline just makes the runner
// loadable so the test-infrastructure smoke gate passes.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
