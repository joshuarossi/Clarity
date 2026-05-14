import { test, expect } from "@playwright/test";

/**
 * WOR-103: Dark mode toggle — no flash of wrong theme
 *
 * These tests verify that the inline <script> in index.html correctly
 * detects prefers-color-scheme and localStorage preferences, applying
 * the data-theme attribute on <html> before first paint.
 *
 * At red state, index.html does not exist yet, so the dev server will
 * not serve the expected page — tests will fail because the elements
 * they look for won't be present. That is the expected red-state
 * failure.
 */

test.describe("AC: Dark mode detection and persistence", () => {
  test("applies data-theme='dark' when prefers-color-scheme is dark", async ({
    page,
  }) => {
    // Emulate dark color scheme preference
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    const theme = await page
      .locator("html")
      .getAttribute("data-theme");
    expect(theme).toBe("dark");
  });

  test("applies data-theme='light' when prefers-color-scheme is light", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");

    const theme = await page
      .locator("html")
      .getAttribute("data-theme");
    expect(theme).toBe("light");
  });

  test("persists theme preference in localStorage across reloads", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");

    // Set dark theme in localStorage
    await page.evaluate(() => {
      localStorage.setItem("theme", "dark");
    });

    // Reload — the inline script should read localStorage and apply dark
    await page.reload();

    const theme = await page
      .locator("html")
      .getAttribute("data-theme");
    expect(theme).toBe("dark");
  });

  test("localStorage preference overrides prefers-color-scheme", async ({
    page,
  }) => {
    // System says light, but localStorage says dark
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");

    await page.evaluate(() => {
      localStorage.setItem("theme", "dark");
    });
    await page.reload();

    const theme = await page
      .locator("html")
      .getAttribute("data-theme");
    expect(theme).toBe("dark");
  });

  test("data-theme is set before first paint (no flash)", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });

    // Capture the data-theme attribute as early as possible via
    // page.addInitScript, which runs before page scripts.
    // We evaluate in the domcontentloaded event to catch the state
    // before React hydrates.
    const themePromise = new Promise<string | null>((resolve) => {
      page.on("domcontentloaded", async () => {
        const theme = await page.evaluate(() =>
          document.documentElement.getAttribute("data-theme"),
        );
        resolve(theme);
      });
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const theme = await themePromise;
    expect(theme).toBe("dark");
  });
});
