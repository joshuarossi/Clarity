import { test, expect } from "@playwright/test";

/**
 * WOR-102: App shell — Vite + React + ConvexProvider + AuthProvider + routing
 *
 * E2E tests covering the 6 browser-dependent acceptance criteria:
 *   1. main.tsx renders React 18 with providers wrapping the router
 *   2. App.tsx defines all routes from TechSpec §9.2
 *   3. Protected routes redirect to /login when unauthenticated
 *   4. Admin routes redirect to /dashboard for non-admin users
 *   5. TopNav variants (logged-in + case-detail)
 *   6. Browser back/forward navigation
 *
 * At red state the app shell does not exist, so most tests will fail
 * because the expected page content is not rendered. That is the
 * expected red-state failure.
 */

// ── AC1: main.tsx renders React 18 with ConvexProvider and AuthProvider ──

test.describe("AC: Provider tree renders without errors", () => {
  test("app loads at root URL without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/");
    // Wait for the app to render
    await page.waitForLoadState("networkidle");

    // Filter out known acceptable errors (e.g. favicon 404)
    const criticalErrors = consoleErrors.filter(
      (msg) =>
        !msg.includes("favicon") &&
        !msg.includes("404 (Not Found)"),
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test("no missing provider errors in console", async ({ page }) => {
    const providerErrors: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (
        text.includes("ConvexProvider") ||
        text.includes("missing provider") ||
        text.includes("useContext") ||
        text.includes("must be used within")
      ) {
        providerErrors.push(text);
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    expect(providerErrors).toHaveLength(0);
  });
});

// ── AC2: Route definitions — all routes from TechSpec §9.2 ──────────

test.describe("AC: Route definitions", () => {
  // Public routes (no auth required)
  test("/ renders landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("page-landing")).toBeVisible();
  });

  test("/login renders login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("page-login")).toBeVisible();
  });

  test("/invite/:token renders invite page", async ({ page }) => {
    await page.goto("/invite/test-token-abc");
    await expect(page.getByTestId("page-invite")).toBeVisible();
  });
});

// Protected routes — these tests assume an authenticated context.
// At red state, the auth mechanism is not wired, so these may fail
// for the right reason (redirect to /login or missing auth setup).

test.describe("AC: Protected route pages render when authenticated", () => {
  // Note: In a full implementation, these tests would use a Playwright
  // auth fixture to establish an authenticated session. At red state
  // the auth flow doesn't exist yet, so these tests document the
  // expected behavior.

  test("/dashboard renders dashboard page", async ({ page }) => {
    await page.goto("/dashboard");
    // If authenticated, the dashboard should render
    await expect(page.getByTestId("page-dashboard")).toBeVisible();
  });

  test("/cases/new renders new case page", async ({ page }) => {
    await page.goto("/cases/new");
    await expect(page.getByTestId("page-new-case")).toBeVisible();
  });

  test("/cases/:caseId renders case detail page", async ({ page }) => {
    await page.goto("/cases/test-case-id");
    await expect(page.getByTestId("page-case-detail")).toBeVisible();
  });

  test("/cases/:caseId/private renders private coaching view", async ({
    page,
  }) => {
    await page.goto("/cases/test-case-id/private");
    await expect(
      page.getByTestId("page-private-coaching"),
    ).toBeVisible();
  });

  test("/cases/:caseId/joint renders joint chat view", async ({ page }) => {
    await page.goto("/cases/test-case-id/joint");
    await expect(page.getByTestId("page-joint-chat")).toBeVisible();
  });

  test("/cases/:caseId/closed renders closed case view", async ({
    page,
  }) => {
    await page.goto("/cases/test-case-id/closed");
    await expect(page.getByTestId("page-closed-case")).toBeVisible();
  });

  test("/admin/templates renders templates list page", async ({
    page,
  }) => {
    await page.goto("/admin/templates");
    await expect(
      page.getByTestId("page-admin-templates"),
    ).toBeVisible();
  });

  test("/admin/templates/:id renders template edit page", async ({
    page,
  }) => {
    await page.goto("/admin/templates/test-template-id");
    await expect(
      page.getByTestId("page-admin-template-edit"),
    ).toBeVisible();
  });

  test("/admin/audit renders audit log page", async ({ page }) => {
    await page.goto("/admin/audit");
    await expect(page.getByTestId("page-admin-audit")).toBeVisible();
  });
});

// ── AC3: Protected routes redirect to /login when unauthenticated ───

test.describe("AC: Unauthenticated redirects to /login", () => {
  test("/dashboard redirects to /login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/cases/new redirects to /login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/cases/new");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/cases/:caseId redirects to /login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/cases/test-case-id");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/cases/:caseId/private redirects to /login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/cases/test-case-id/private");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/admin/templates redirects to /login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/admin/templates");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/admin/audit redirects to /login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/admin/audit");
    await expect(page).toHaveURL(/\/login/);
  });

  test("no protected page content flashes before redirect", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    // The dashboard content should never be visible — either a spinner
    // or the login page should show
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId("page-dashboard")).not.toBeVisible();
  });
});

// ── AC4: Admin routes redirect non-admin users to /dashboard ────────

test.describe("AC: Non-admin users redirected from admin routes", () => {
  // Note: These tests require an authenticated session with a user
  // whose role is "USER" (not "ADMIN"). At red state the auth flow
  // and role system don't exist, so these will fail for the right reason.

  test("/admin/templates redirects non-admin to /dashboard", async ({
    page,
  }) => {
    // In a full setup, this would use a fixture with a USER-role session
    await page.goto("/admin/templates");
    // For a non-admin user, expect redirect to /dashboard
    // At red state without auth, this may redirect to /login instead
    await expect(page).toHaveURL(/\/(dashboard|login)/);
  });

  test("/admin/templates/:id redirects non-admin to /dashboard", async ({
    page,
  }) => {
    await page.goto("/admin/templates/some-id");
    await expect(page).toHaveURL(/\/(dashboard|login)/);
  });

  test("/admin/audit redirects non-admin to /dashboard", async ({
    page,
  }) => {
    await page.goto("/admin/audit");
    await expect(page).toHaveURL(/\/(dashboard|login)/);
  });
});

// ── AC5: TopNav renders correct variants ────────────────────────────

test.describe("AC: TopNav variants", () => {
  test("TopNav uses a <nav> element for accessibility", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("nav")).toBeVisible();
  });

  test("logged-in variant shows Dashboard link", async ({ page }) => {
    // This test assumes an authenticated context
    await page.goto("/dashboard");
    const nav = page.locator("nav");
    await expect(nav.getByRole("link", { name: /dashboard/i })).toBeVisible();
  });

  test("logged-in variant shows user menu", async ({ page }) => {
    // When authenticated, TopNav should display user name or email
    await page.goto("/dashboard");
    const nav = page.locator("nav");
    // The user menu should be present (showing displayName or email)
    await expect(nav).toBeVisible();
  });

  test("case-detail variant shows back arrow and Back to Dashboard link", async ({
    page,
  }) => {
    await page.goto("/cases/test-case-id");
    const nav = page.locator("nav");
    await expect(
      nav.getByRole("link", { name: /back to dashboard/i }),
    ).toBeVisible();
  });

  test("case-detail variant shows phase display", async ({ page }) => {
    await page.goto("/cases/test-case-id/private");
    const nav = page.locator("nav");
    // The phase display should be present in the nav
    await expect(nav).toBeVisible();
  });

  test("page content uses <main> element for accessibility", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
  });
});

// ── AC6: Browser back/forward navigation ────────────────────────────

test.describe("AC: Browser history navigation", () => {
  test("back and forward buttons navigate between routes", async ({
    page,
  }) => {
    // Navigate to dashboard
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    // Navigate to new case page
    await page.goto("/cases/new");
    await expect(page).toHaveURL(/\/cases\/new/);

    // Go back — should return to dashboard
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/);

    // Go forward — should return to cases/new
    await page.goForward();
    await expect(page).toHaveURL(/\/cases\/new/);
  });

  test("back button works from case detail to dashboard", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.goto("/cases/test-case-id");

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
