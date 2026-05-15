import { test, expect, type Page } from "@playwright/test";

/**
 * WOR-109: Auth session E2E tests — session persistence and logout.
 *
 * These tests require a running Convex dev server and a real browser context.
 * At red state, the auth module (convex/auth.ts, convex/auth.config.ts) does
 * not exist and the login UI is a separate ticket, so sign-in will fail —
 * that is the expected red-state behavior.
 */

/**
 * Signs in via the magic link flow on the login page.
 *
 * In a test environment, this would use a test-mode magic link that
 * auto-verifies without requiring actual email delivery. At red state,
 * the login page UI and auth module do not exist, so this helper will
 * fail — producing the correct red-state error.
 */
async function signInWithMagicLink(page: Page, email: string): Promise<void> {
  await page.goto("/login");

  // Fill in the magic link email input
  const emailInput = page.getByLabel(/email/i);
  await emailInput.fill(email);

  // Submit the sign-in form
  const submitButton = page.getByRole("button", {
    name: /send magic link/i,
  });
  await submitButton.click();

  // Wait for authentication to complete and redirect away from /login
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15000,
  });
}

// ── AC5: Session persists across browser reloads ─────────────────────

test.describe("AC5 — session persists across browser reloads", () => {
  test("authenticated user remains on /dashboard after page reload", async ({
    page,
  }) => {
    await signInWithMagicLink(page, "session-persist@example.com");

    // Navigate to a protected route
    await page.goto("/dashboard");
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    expect(page.url()).toContain("/dashboard");

    // Reload the page — session should survive via cookie/localStorage
    await page.reload();

    // Should still be on /dashboard, not redirected to /login
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    expect(page.url()).toContain("/dashboard");

    // Page should show dashboard content
    await expect(page.locator("h1")).toBeVisible();
  });

  test("authenticated user is not redirected to /login after reload", async ({
    page,
  }) => {
    await signInWithMagicLink(page, "session-nodrop@example.com");

    await page.goto("/dashboard");
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // Reload multiple times to confirm session stability
    await page.reload();
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    expect(page.url()).toContain("/dashboard");

    await page.reload();
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    expect(page.url()).toContain("/dashboard");
  });
});

// ── AC6: Logout mutation clears session client + server side ─────────

test.describe("AC6 — logout clears session client + server side", () => {
  test("after logout, user is redirected to /login", async ({ page }) => {
    await signInWithMagicLink(page, "logout-redirect@example.com");

    // Confirm we are on a protected route
    await page.goto("/dashboard");
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // Trigger logout via the UI
    const logoutButton = page.getByRole("button", {
      name: /log\s?out|sign\s?out/i,
    });
    await logoutButton.click();

    // Should redirect to the login page
    await page.waitForURL("**/login", { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("after logout, navigating to /dashboard redirects to /login (session cleared)", async ({
    page,
  }) => {
    await signInWithMagicLink(page, "logout-cleared@example.com");

    await page.goto("/dashboard");
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // Logout
    const logoutButton = page.getByRole("button", {
      name: /log\s?out|sign\s?out/i,
    });
    await logoutButton.click();
    await page.waitForURL("**/login", { timeout: 10000 });

    // Attempt to access the protected route again — should redirect to /login
    await page.goto("/dashboard");
    await page.waitForURL("**/login", { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("after logout, page does not show authenticated content", async ({
    page,
  }) => {
    await signInWithMagicLink(page, "logout-noprofile@example.com");

    await page.goto("/dashboard");
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // Logout
    const logoutButton = page.getByRole("button", {
      name: /log\s?out|sign\s?out/i,
    });
    await logoutButton.click();
    await page.waitForURL("**/login", { timeout: 10000 });

    // The login page should not display authenticated user info
    await expect(
      page.getByText("logout-noprofile@example.com"),
    ).not.toBeVisible();
  });
});

// ── AC: Post-login redirect preserves original destination via ?redirect= ──

test.describe(
  "AC — post-login redirect via ?redirect= param (WOR-110)",
  () => {
    test("logging in after redirect from /profile lands on /profile, not /dashboard", async ({
      page,
    }) => {
      // Navigate to a protected route while logged out
      await page.goto("/profile");

      // ProtectedRoute should redirect to /login with ?redirect= param
      await page.waitForURL("**/login**", { timeout: 10000 });
      expect(page.url()).toContain("/login");
      expect(page.url()).toContain("redirect=");

      // Complete the login flow inline (not using signInWithMagicLink which
      // navigates to /login fresh, losing the ?redirect= param)
      const emailInput = page.getByLabel(/email/i);
      await emailInput.fill("redirect-test@example.com");

      const submitButton = page.getByRole("button", {
        name: /send magic link/i,
      });
      await submitButton.click();

      // Wait for auth to complete and redirect away from /login
      await page.waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 15000,
      });

      // Should land on /profile (the original destination), not /dashboard
      expect(page.url()).toContain("/profile");
    });
  },
);

// ── AC: Logout from profile page redirects to /login (WOR-110) ──────────

test.describe("AC — logout from profile page (WOR-110)", () => {
  test("signing out from /profile redirects to /login and clears session", async ({
    page,
  }) => {
    await signInWithMagicLink(page, "profile-logout@example.com");

    // Navigate to profile page
    await page.goto("/profile");
    await page.waitForURL("**/profile", { timeout: 10000 });
    expect(page.url()).toContain("/profile");

    // Click sign-out button
    const signOutButton = page.getByRole("button", {
      name: /sign\s?out|log\s?out/i,
    });
    await signOutButton.click();

    // Should redirect to /login
    await page.waitForURL("**/login", { timeout: 10000 });
    expect(page.url()).toContain("/login");

    // Session should be cleared — navigating to /dashboard redirects to /login
    await page.goto("/dashboard");
    await page.waitForURL("**/login", { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });
});
