import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * WOR-107: Smoke tests — Playwright infrastructure validation
 *
 * AC 6 — A placeholder smoke.spec.ts runs end-to-end and passes: opens
 *         the app, verifies the landing page loads.
 * AC 2 — Shared fixture: authenticated user context that logs in via
 *         test helper (bypassing real magic link for speed).
 * AC 3 — Shared fixture: two-user context for invite-flow tests (two
 *         separate browser contexts).
 *
 * At red state: e2e/fixtures.ts does not exist yet, so the import
 * produces TS2307. That is the expected red-state error.
 */

// ── AC 6: placeholder smoke test ─────────────────────────────────────────

test.describe("AC 6: landing page smoke test", () => {
  test("opens the app and verifies the landing page loads", async ({
    page,
  }: {
    page: Page;
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });
});

// ── AC 2: authenticated user fixture ─────────────────────────────────────

test.describe("AC 2: authenticatedPage fixture", () => {
  test("provides a logged-in session that can access /dashboard", async ({
    authenticatedPage,
  }: {
    authenticatedPage: Page;
  }) => {
    await authenticatedPage.goto("/dashboard");
    await authenticatedPage.waitForLoadState("domcontentloaded");

    // Should NOT be redirected to /login — fixture sets up auth
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });
});

// ── AC 3: two-user fixture ───────────────────────────────────────────────

test.describe("AC 3: twoUserContexts fixture", () => {
  test("provides two independent authenticated sessions", async ({
    pageA,
    pageB,
  }: {
    pageA: Page;
    pageB: Page;
  }) => {
    await Promise.all([pageA.goto("/dashboard"), pageB.goto("/dashboard")]);
    await Promise.all([
      pageA.waitForLoadState("domcontentloaded"),
      pageB.waitForLoadState("domcontentloaded"),
    ]);

    // Both should be authenticated (not redirected to login)
    await expect(pageA).not.toHaveURL(/\/login/);
    await expect(pageB).not.toHaveURL(/\/login/);

    // The two pages should display different user identities, proving
    // they are separate browser contexts with independent auth state
    const bodyTextA = await pageA.locator("body").innerText();
    const bodyTextB = await pageB.locator("body").innerText();
    expect(bodyTextA).not.toBe(bodyTextB);
  });
});
