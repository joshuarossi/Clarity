import { test, expect } from "./fixtures";

/**
 * WOR-133: Admin templates list page — E2E tests for role gating,
 * table rendering, row navigation, and empty state.
 *
 * At red state, the AdminTemplatesPage component and enhanced listAll
 * query do not exist yet — tests will fail because the page elements
 * won't render as expected. That is the correct red-state failure.
 */

// ── Helpers ──────────────────────────────────────────────────────────────

import { createTestUser, loginAs } from "./helpers";

async function loginAsAdmin(page: import("@playwright/test").Page) {
  const { email } = await createTestUser({ role: "ADMIN" });
  await loginAs(page, email);
}

async function loginAsNonAdmin(page: import("@playwright/test").Page) {
  const { email } = await createTestUser({ role: "USER" });
  await loginAs(page, email);
}

// ── AC: Route /admin/templates accessible only to users with role=ADMIN;
//    non-admin users redirected to /dashboard ─────────────────────────────

test.describe("AC: Admin-only route gating", () => {
  test("non-admin user is redirected to /dashboard", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsNonAdmin(page);

    await page.goto("/admin/templates");
    await page.waitForURL("**/dashboard");

    expect(page.url()).toContain("/dashboard");
    await context.close();
  });

  test("admin user can access /admin/templates", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates");
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/admin/templates");
    await expect(
      page.getByRole("heading", { name: "Templates" }),
    ).toBeVisible();
    await context.close();
  });
});

// ── AC: Table columns: Category, Name, Current Version (number), Status
//    (Active/Archived badge), Pinned Cases Count ──────────────────────────

test.describe("AC: Table columns render with seeded data", () => {
  test("table displays all column headers", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates");
    await page.waitForLoadState("networkidle");

    const table = page.locator("table");
    await expect(table).toBeVisible();

    await expect(table.locator("th", { hasText: "Category" })).toBeVisible();
    await expect(table.locator("th", { hasText: "Name" })).toBeVisible();
    await expect(
      table.locator("th", { hasText: "Current Version" }),
    ).toBeVisible();
    await expect(table.locator("th", { hasText: "Status" })).toBeVisible();
    await expect(
      table.locator("th", { hasText: "Pinned Cases" }),
    ).toBeVisible();
    await context.close();
  });

  test("table rows display template data", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates");
    await page.waitForLoadState("networkidle");

    const rows = page.locator("tbody tr");
    // Expect at least one row when templates exist in the database
    await expect(rows.first()).toBeVisible();
    await context.close();
  });
});

// ── AC: + New Template button opens creation form ────────────────────────

test.describe("AC: + New Template button navigation", () => {
  test("clicking + New Template navigates to creation route", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates");
    await page.waitForLoadState("networkidle");

    const newButton = page.getByRole("button", { name: /new template/i });
    await expect(newButton).toBeVisible();
    await newButton.click();

    // The button should trigger navigation (to /admin/templates/new or similar)
    await page.waitForURL(/\/admin\/templates\/(new|create)/);
    await context.close();
  });
});

// ── AC: Click on table row routes to /admin/templates/:id ────────────────

test.describe("AC: Row click navigates to template detail", () => {
  test("clicking a table row navigates to /admin/templates/:id", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates");
    await page.waitForLoadState("networkidle");

    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();

    // URL should now contain /admin/templates/ followed by a template ID
    await page.waitForURL(/\/admin\/templates\/[^/]+$/);
    expect(page.url()).toMatch(/\/admin\/templates\/[^/]+$/);
    await context.close();
  });
});

// ── AC: Archived templates visually distinguished (muted/grayed styling) ─

test.describe("AC: Archived templates have muted styling", () => {
  test("archived template row is visually distinguished from active rows", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates");
    await page.waitForLoadState("networkidle");

    // Find a row that contains "Archived" badge
    const archivedRow = page
      .locator("tbody tr")
      .filter({ hasText: "Archived" })
      .first();
    await expect(archivedRow).toBeVisible();

    // Verify the archived row has visual distinction — either a CSS class
    // or reduced opacity
    const hasArchivedAttr = await archivedRow.evaluate((el) => {
      const computedStyle = window.getComputedStyle(el);
      const hasOpacity = parseFloat(computedStyle.opacity) < 1;
      const hasMutedClass =
        el.classList.contains("archived") ||
        el.classList.contains("muted") ||
        el.getAttribute("data-archived") === "true";
      return hasOpacity || hasMutedClass;
    });

    expect(hasArchivedAttr).toBe(true);
    await context.close();
  });
});

// ── AC: Empty state message ──────────────────────────────────────────────

test.describe("AC: Empty state displays verbatim message", () => {
  test("when no templates exist, the empty state message is shown", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates");
    await page.waitForLoadState("networkidle");

    const expectedMessage =
      "No templates yet. The app will use a built-in default baseline. " +
      "Create a template when you want to tune the Coach\u2019s behavior per category.";

    await expect(page.getByText(expectedMessage)).toBeVisible();
    await context.close();
  });

  test("+ New Template button is visible even in empty state", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates");
    await page.waitForLoadState("networkidle");

    const newButton = page.getByRole("button", { name: /new template/i });
    await expect(newButton).toBeVisible();
    await context.close();
  });
});
