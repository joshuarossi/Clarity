import { test, expect } from "@playwright/test";

// ── AC 7: Responsive — works on mobile per NFR-BROWSER targets ───────────
// This test requires a real browser to verify viewport behavior and
// absence of horizontal overflow at supported widths.

test.describe("AC: Responsive landing page", () => {
  test("renders hero, explainer, and footer at mobile viewport (375px) with no horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    // Wait for landing page content to load
    await page
      .getByText("A calm place to work through a difficult conversation.")
      .waitFor({ state: "visible" });

    // Verify key sections are visible
    await expect(
      page.getByText(
        "A calm place to work through a difficult conversation.",
      ),
    ).toBeVisible();
    await expect(page.getByText("Private Coaching")).toBeVisible();
    await expect(page.getByText("Shared Conversation")).toBeVisible();
    await expect(page.getByText("Resolution")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();

    // Assert no horizontal overflow
    const hasOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);
  });

  test("renders hero, explainer, and footer at desktop viewport (1280px) with no horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    // Wait for landing page content to load
    await page
      .getByText("A calm place to work through a difficult conversation.")
      .waitFor({ state: "visible" });

    // Verify key sections are visible
    await expect(
      page.getByText(
        "A calm place to work through a difficult conversation.",
      ),
    ).toBeVisible();
    await expect(page.getByText("Private Coaching")).toBeVisible();
    await expect(page.getByText("Shared Conversation")).toBeVisible();
    await expect(page.getByText("Resolution")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();

    // Assert no horizontal overflow
    const hasOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);
  });
});
