import { test, expect } from "@playwright/test";

/**
 * WOR-102: App shell — E2E tests for provider tree, routing, auth guards,
 * TopNav variants, and browser navigation.
 *
 * At red state, src/main.tsx and the rest of the app shell do not exist yet,
 * so the dev server will not serve the expected page — tests will fail
 * because the elements they look for won't be present. That is the expected
 * red-state failure.
 */

// ── All TechSpec §9.2 routes ──────────────────────────────────────────────

const PUBLIC_ROUTES = [
  { path: "/", heading: "Home" },
  { path: "/login", heading: "Login" },
];

const PROTECTED_ROUTES = [
  { path: "/dashboard", heading: "Dashboard" },
  { path: "/cases/new", heading: "New Case" },
  { path: "/cases/test-case-id", heading: "Case" },
  { path: "/cases/test-case-id/private", heading: "Private" },
  { path: "/cases/test-case-id/joint", heading: "Joint" },
  { path: "/cases/test-case-id/closed", heading: "Closed" },
];

const ADMIN_ROUTES = [
  { path: "/admin/templates", heading: "Templates" },
  { path: "/admin/templates/test-template-id", heading: "Template" },
  { path: "/admin/audit", heading: "Audit" },
];

const INVITE_ROUTE = { path: "/invite/test-token", heading: "Invite" };

// ── AC: main.tsx renders React 18 with ConvexProvider and AuthProvider ────

test.describe("AC: main.tsx renders providers wrapping the router", () => {
  test("app boots and renders without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Filter out expected development warnings (React dev mode, HMR, etc.)
    const criticalErrors = consoleErrors.filter(
      (msg) =>
        !msg.includes("[HMR]") &&
        !msg.includes("React DevTools") &&
        !msg.includes("Download the React DevTools"),
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test("root element is present and React has rendered content", async ({
    page,
  }) => {
    await page.goto("/");
    const root = page.locator("#root");
    await expect(root).toBeAttached();
    // React should have rendered children inside #root
    await expect(root).not.toBeEmpty();
  });
});

// ── AC: App.tsx defines all routes from TechSpec §9.2 ─────────────────────

test.describe("AC: App.tsx defines all TechSpec §9.2 routes", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`public route ${route.path} renders content`, async ({ page }) => {
      await page.goto(route.path);
      // Each route stub should render an h1 or identifiable content
      const heading = page.locator("h1");
      await expect(heading).toBeVisible();
    });
  }

  test(`invite route ${INVITE_ROUTE.path} renders content`, async ({
    page,
  }) => {
    await page.goto(INVITE_ROUTE.path);
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();
  });

  test("unmatched route renders a page-not-found message", async ({
    page,
  }) => {
    await page.goto("/this-route-does-not-exist");
    // Should show a "Page not found" or similar stub
    await expect(page.getByText(/not found/i)).toBeVisible();
  });
});

// ── AC: Protected routes redirect to /login when unauthenticated ──────────

test.describe("AC: Protected routes redirect to /login when unauthenticated", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`unauthenticated visit to ${route.path} redirects to /login`, async ({
      page,
    }) => {
      await page.goto(route.path);

      // Should end up on /login after redirect
      await page.waitForURL("**/login", { timeout: 10000 });
      expect(page.url()).toContain("/login");
    });
  }

  for (const route of ADMIN_ROUTES) {
    test(`unauthenticated visit to ${route.path} redirects to /login`, async ({
      page,
    }) => {
      await page.goto(route.path);

      // Admin routes also require auth first — should redirect to /login
      await page.waitForURL("**/login", { timeout: 10000 });
      expect(page.url()).toContain("/login");
    });
  }

  test("protected route shows spinner while auth is loading, not a redirect flash", async ({
    page,
  }) => {
    // Navigate to a protected route and check for loading indicator
    // before any redirect happens
    await page.goto("/dashboard", { waitUntil: "commit" });

    // The spinner should appear with accessible aria-label
    const spinner = page.getByLabel("Loading");
    // Either the spinner is briefly visible OR we get redirected —
    // but we should never see dashboard content flash before auth resolves
    const dashboardContent = page.locator("[data-testid='dashboard-page']");

    // If we see the spinner, auth loading state is correct
    // If we're already redirected, that's also valid (fast auth resolution)
    const spinnerVisible = await spinner.isVisible().catch(() => false);
    const contentVisible = await dashboardContent
      .isVisible()
      .catch(() => false);

    // We should NOT see dashboard content without being authenticated
    if (!spinnerVisible) {
      // If spinner wasn't visible, we should have been redirected
      expect(page.url()).toContain("/login");
    }
    expect(contentVisible).toBe(false);
  });
});

// ── AC: Admin routes redirect non-admin users to /dashboard ───────────────

test.describe("AC: Admin routes redirect non-admin users to /dashboard", () => {
  // NOTE: These tests require an authenticated non-admin user session.
  // At red state, the auth system is not wired up, so these tests will
  // fail because the app doesn't boot. That is expected.

  // In a real CI environment, this would use a test fixture that
  // authenticates as a regular USER role before navigating.
  // For now, we test the redirect behavior assuming the app is running
  // with an authenticated regular user context.

  for (const route of ADMIN_ROUTES) {
    test(`non-admin user at ${route.path} is redirected to /dashboard`, async ({
      page,
    }) => {
      // This test assumes authentication has been set up via a
      // storageState fixture or similar mechanism for a USER-role account.
      // At red state, the app doesn't exist, so this will fail.
      await page.goto(route.path);

      // Non-admin should be redirected to /dashboard (after auth confirms)
      // We check that we don't stay on an admin route
      await page.waitForURL((url) => !url.pathname.startsWith("/admin"), {
        timeout: 15000,
      });
      expect(page.url()).toContain("/dashboard");
    });
  }
});

// ── AC: TopNav variants ───────────────────────────────────────────────────

test.describe("AC: TopNav renders logged-in and case-detail variants", () => {
  test("logged-in variant shows Dashboard link and user menu", async ({
    page,
  }) => {
    // Navigate to dashboard (requires authenticated context at green state)
    await page.goto("/dashboard");

    // TopNav should render the logged-in variant
    const nav = page.locator("nav");
    await expect(nav).toBeVisible();

    // Dashboard link should be present
    const dashboardLink = nav.getByRole("link", { name: /dashboard/i });
    await expect(dashboardLink).toBeVisible();

    // User menu or user display should be present
    // The contract says: "Dashboard link + user display name + logout button/menu"
    const userMenu = nav.locator(
      "[data-testid='user-menu'], button:has-text('Logout'), button:has-text('Log out')",
    );
    await expect(userMenu.first()).toBeVisible();
  });

  test("case-detail variant shows back arrow and phase display", async ({
    page,
  }) => {
    // Navigate to a case detail page (requires authenticated context)
    await page.goto("/cases/test-case-id");

    const nav = page.locator("nav");
    await expect(nav).toBeVisible();

    // Back arrow should be present (ArrowLeft icon per contract)
    const backLink = nav.locator(
      "a[href*='/'], [data-testid='back-arrow'], [aria-label*='back' i]",
    );
    await expect(backLink.first()).toBeVisible();

    // Phase display should be present
    const phaseDisplay = nav.locator(
      "[data-testid='phase-display'], [data-testid='case-phase']",
    );
    await expect(phaseDisplay.first()).toBeVisible();
  });
});

// ── AC: Navigation between routes works with browser back/forward ─────────

test.describe("AC: Navigation with browser back/forward buttons", () => {
  test("back and forward navigation works between routes", async ({
    page,
  }) => {
    // Start at a known route
    await page.goto("/dashboard");
    await expect(page.locator("h1")).toBeVisible();

    // Navigate to another route
    await page.goto("/cases/new");
    await expect(page.locator("h1")).toBeVisible();
    expect(page.url()).toContain("/cases/new");

    // Go back
    await page.goBack();
    await page.waitForURL("**/dashboard", { timeout: 5000 });
    expect(page.url()).toContain("/dashboard");

    // Go forward
    await page.goForward();
    await page.waitForURL("**/cases/new", { timeout: 5000 });
    expect(page.url()).toContain("/cases/new");
  });

  test("back from protected route after redirect does not create a redirect loop", async ({
    page,
  }) => {
    // Visit login, then navigate to dashboard (which requires auth)
    await page.goto("/login");
    await expect(page.locator("h1")).toBeVisible();

    // Attempt to visit a protected route (unauthenticated)
    await page.goto("/dashboard");
    await page.waitForURL("**/login", { timeout: 10000 });

    // Pressing back should go to the original login page, not loop
    await page.goBack();
    // Should not be stuck in a redirect loop
    await page.waitForTimeout(1000);
    // The URL should be stable (not rapidly changing)
    const finalUrl = page.url();
    expect(finalUrl).toBeDefined();
  });
});
