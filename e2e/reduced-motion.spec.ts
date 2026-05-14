import { test, expect } from "@playwright/test";

/**
 * WOR-103: prefers-reduced-motion disables streaming cursor animation
 *
 * These tests verify that when the browser reports
 * prefers-reduced-motion: reduce, the streaming cursor animation
 * is disabled (computed animation is "none") and no CSS transitions
 * are applied on bubble enter animations.
 *
 * At red state, the CSS files and page do not exist yet, so the
 * elements won't be found — tests will fail because the product
 * behavior is missing. That is the expected red-state failure.
 */

test.describe("AC: prefers-reduced-motion disables animations", () => {
  test("streaming cursor has no animation when reduced motion is preferred", async ({
    page,
  }) => {
    // Emulate reduced motion preference
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    // We need a streaming cursor element to exist on the page.
    // In a real scenario, this would appear during AI streaming.
    // Inject a test element with the streaming cursor class to verify
    // the CSS rule applies.
    await page.evaluate(() => {
      const el = document.createElement("span");
      el.className = "cc-streaming-cursor";
      el.id = "test-cursor";
      document.body.appendChild(el);
    });

    const cursor = page.locator("#test-cursor");
    await expect(cursor).toBeVisible();

    const animationName = await cursor.evaluate((el) =>
      getComputedStyle(el).animationName,
    );
    // Under reduced motion, animation should be "none"
    expect(animationName).toBe("none");
  });

  test("streaming cursor animates normally without reduced motion preference", async ({
    page,
  }) => {
    // Emulate normal motion preference
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");

    await page.evaluate(() => {
      const el = document.createElement("span");
      el.className = "cc-streaming-cursor";
      el.id = "test-cursor";
      document.body.appendChild(el);
    });

    const cursor = page.locator("#test-cursor");
    await expect(cursor).toBeVisible();

    const animationName = await cursor.evaluate((el) =>
      getComputedStyle(el).animationName,
    );
    // Under normal motion, animation should be cc-blink
    expect(animationName).toBe("cc-blink");
  });

  test("bubble enter animation is disabled under reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    // Inject a bubble element to verify the CSS
    await page.evaluate(() => {
      const el = document.createElement("div");
      el.className = "cc-bubble";
      el.id = "test-bubble";
      el.textContent = "Test message";
      document.body.appendChild(el);
    });

    const bubble = page.locator("#test-bubble");
    await expect(bubble).toBeVisible();

    const animationName = await bubble.evaluate((el) =>
      getComputedStyle(el).animationName,
    );
    expect(animationName).toBe("none");

    const transitionDuration = await bubble.evaluate((el) =>
      getComputedStyle(el).transitionDuration,
    );
    // Transition should be 0s under reduced motion
    expect(transitionDuration).toBe("0s");
  });
});
