import { test, expect } from "./fixtures";

// ── AC: Dashboard load — < 1s to first meaningful paint ─────────────────
// This AC requires a real browser to measure rendering performance.
// The test navigates to /dashboard and asserts that meaningful content
// appears within 1000ms.

test.describe("AC: Dashboard load < 1s to first meaningful paint", () => {
  test("renders meaningful dashboard content within 1000ms", async ({
    authenticatedPage,
  }) => {
    const start = Date.now();

    await authenticatedPage.goto("/dashboard");

    // Wait for either the case list, empty state, or skeleton to appear —
    // any of these constitutes "first meaningful paint" for the dashboard.
    await authenticatedPage
      .locator(
        [
          "[data-testid='case-row-skeleton']",
          "text=No cases yet",
          "[data-testid^='case-row-']",
          "text=Active Cases",
        ].join(", "),
      )
      .first()
      .waitFor({ state: "visible", timeout: 5_000 });

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1_000);
  });
});
