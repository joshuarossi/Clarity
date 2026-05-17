import { test, expect } from "./fixtures";
import { createTestUser, loginAs } from "./helpers";

/**
 * WOR-135: Admin audit log page — E2E tests.
 *
 * At red state, the AdminAuditLogPage component and listAuditLog query do
 * not exist yet — tests will fail because the page elements won't render
 * as expected. That is the correct red-state failure.
 */

// ── Helpers ──────────────────────────────────────────────────────────────

async function loginAsAdmin(page: import("@playwright/test").Page) {
  const { email } = await createTestUser({ role: "ADMIN" });
  await loginAs(page, email);
}

async function loginAsNonAdmin(page: import("@playwright/test").Page) {
  const { email } = await createTestUser({ role: "USER" });
  await loginAs(page, email);
}

// ── AC: Route /admin/audit accessible only to admin users ───────────────

test.describe("AC: Admin-only route gating", () => {
  test("non-admin user navigating to /admin/audit is redirected to /dashboard", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsNonAdmin(page);

    await page.goto("/admin/audit");
    await page.waitForURL("**/dashboard");

    expect(page.url()).toContain("/dashboard");
    await context.close();
  });

  test("admin user can access /admin/audit and sees the audit log table", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/audit");
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/admin/audit");
    await expect(page.locator("table")).toBeVisible();
    await context.close();
  });
});

// ── AC: Table columns: Actor, Action, Target, Timestamp ─────────────────

test.describe("AC: Table columns display correctly", () => {
  test("table renders with correct column headers", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/audit");
    await page.waitForLoadState("networkidle");

    const table = page.locator("table");
    await expect(table).toBeVisible();

    await expect(table.locator("th", { hasText: "Actor" })).toBeVisible();
    await expect(table.locator("th", { hasText: "Action" })).toBeVisible();
    await expect(table.locator("th", { hasText: "Target" })).toBeVisible();
    await expect(table.locator("th", { hasText: "Timestamp" })).toBeVisible();
    await context.close();
  });

  test("table row displays actor name, action, target, and timestamp", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/audit");
    await page.waitForLoadState("networkidle");

    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toBeVisible();

    // Each row should have at least 4 cells
    const cells = firstRow.locator("td");
    await expect(cells).toHaveCount(4);

    // Actor column should contain text (name or email)
    await expect(cells.nth(0)).not.toBeEmpty();
    // Action column should contain an action string
    await expect(cells.nth(1)).not.toBeEmpty();
    // Target column should contain targetType:targetId format
    await expect(cells.nth(2)).toContainText(":");
    // Timestamp column should contain a formatted date
    await expect(cells.nth(3)).not.toBeEmpty();
    await context.close();
  });
});

// ── AC: Filterable by actor, action type, and date range ────────────────

test.describe("AC: Filterable by actor, action type, and date range", () => {
  test("actor filter reduces visible rows to matching actor", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/audit");
    await page.waitForLoadState("networkidle");

    // Get initial row count
    const initialRows = await page.locator("tbody tr").count();
    expect(initialRows).toBeGreaterThan(0);

    // Apply actor filter
    const actorInput = page.locator(
      'input[placeholder*="actor" i], input[aria-label*="actor" i]',
    );
    await actorInput.fill("admin@test.com");
    await actorInput.press("Enter");
    await page.waitForLoadState("networkidle");

    // All visible rows should have the filtered actor in the Actor column
    const rows = page.locator("tbody tr");
    const filteredRowCount = await rows.count();
    expect(filteredRowCount).toBeGreaterThan(0);
    for (let i = 0; i < filteredRowCount; i++) {
      const actorCell = rows.nth(i).locator("td").nth(0);
      await expect(actorCell).toContainText("admin@test.com");
    }
    await context.close();
  });

  test("action type filter shows only matching actions", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/audit");
    await page.waitForLoadState("networkidle");

    // Find the action type select/dropdown
    const actionSelect = page.locator(
      'select[aria-label*="action" i], [role="combobox"][aria-label*="action" i]',
    );
    await actionSelect.click();

    // Select TEMPLATE_CREATED from the dropdown options
    await page.getByRole("option", { name: /TEMPLATE_CREATED/i }).click();
    await page.waitForLoadState("networkidle");

    // All visible rows should have TEMPLATE_CREATED in the action column
    const rows = page.locator("tbody tr");
    const rowCount = await rows.count();
    for (let i = 0; i < rowCount; i++) {
      const actionCell = rows.nth(i).locator("td").nth(1);
      await expect(actionCell).toContainText("TEMPLATE_CREATED");
    }
    await context.close();
  });

  test("date range filter excludes entries outside the range", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/audit");
    await page.waitForLoadState("networkidle");

    const initialRows = await page.locator("tbody tr").count();
    expect(initialRows).toBeGreaterThan(0);

    // Set date-from filter to tomorrow (should exclude all entries)
    const tomorrow = new Date(Date.now() + 86400000)
      .toISOString()
      .split("T")[0];
    const dateFromInput = page.locator(
      'input[type="date"][aria-label*="from" i], input[type="date"][name*="from" i]',
    );
    await dateFromInput.fill(tomorrow);
    await page.waitForLoadState("networkidle");

    // Either no rows or empty state should appear
    const emptyState = page.locator('[data-testid="empty-state"]');
    const remainingRows = page.locator("tbody tr");
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    const rowCount = await remainingRows.count();

    expect(hasEmpty || rowCount === 0).toBe(true);
    await context.close();
  });

  test("combining filters intersects correctly", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/audit");
    await page.waitForLoadState("networkidle");

    const initialRows = await page.locator("tbody tr").count();
    expect(initialRows).toBeGreaterThan(0);

    // Apply action filter
    const actionSelect = page.locator(
      'select[aria-label*="action" i], [role="combobox"][aria-label*="action" i]',
    );
    await actionSelect.click();
    await page.getByRole("option", { name: /TEMPLATE_CREATED/i }).click();
    await page.waitForLoadState("networkidle");

    const afterActionFilter = await page.locator("tbody tr").count();

    // Apply a restrictive date range (yesterday to today)
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .split("T")[0];
    const today = new Date().toISOString().split("T")[0];
    const dateFromInput = page.locator(
      'input[type="date"][aria-label*="from" i], input[type="date"][name*="from" i]',
    );
    const dateToInput = page.locator(
      'input[type="date"][aria-label*="to" i], input[type="date"][name*="to" i]',
    );
    await dateFromInput.fill(yesterday);
    await dateToInput.fill(today);
    await page.waitForLoadState("networkidle");

    const afterBothFilters = await page.locator("tbody tr").count();
    expect(afterBothFilters).toBeLessThanOrEqual(afterActionFilter);
    await context.close();
  });
});

// ── AC: Click on table row opens a right-side drawer with JSON ──────────

test.describe("AC: Row click opens drawer with formatted JSON metadata", () => {
  test("clicking a table row opens a right-side Sheet with metadata JSON", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/audit");
    await page.waitForLoadState("networkidle");

    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();

    // Sheet (drawer) should open on the right side
    const drawer = page.locator('[role="dialog"], [data-state="open"]');
    await expect(drawer).toBeVisible();

    // Should contain a <pre> block with formatted JSON
    const preBlock = drawer.locator("pre");
    await expect(preBlock).toBeVisible();

    // The content should be valid JSON
    const jsonContent = await preBlock.textContent();
    expect(jsonContent).toBeTruthy();
    expect(() => JSON.parse(jsonContent!)).not.toThrow();
    await context.close();
  });

  test("drawer can be closed with Escape key", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/audit");
    await page.waitForLoadState("networkidle");

    const firstRow = page.locator("tbody tr").first();
    await firstRow.click();

    const drawer = page.locator('[role="dialog"], [data-state="open"]');
    await expect(drawer).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(drawer).not.toBeVisible();
    await context.close();
  });

  test("drawer displays metadata with JetBrains Mono font", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/audit");
    await page.waitForLoadState("networkidle");

    const firstRow = page.locator("tbody tr").first();
    await firstRow.click();

    const drawer = page.locator('[role="dialog"], [data-state="open"]');
    await expect(drawer).toBeVisible();

    const preBlock = drawer.locator("pre");
    const fontFamily = await preBlock.evaluate(
      (el) => window.getComputedStyle(el).fontFamily,
    );
    expect(fontFamily.toLowerCase()).toContain("jetbrains mono");
    await context.close();
  });
});

// ── AC: Table is read-only — no edit or delete capability ───────────────

test.describe("AC: Table is read-only — no edit or delete controls", () => {
  test("page has no edit, delete, or mutation buttons", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/audit");
    await page.waitForLoadState("networkidle");

    // No edit buttons
    const editButton = page.getByRole("button", { name: /edit/i });
    await expect(editButton).toHaveCount(0);

    // No delete buttons
    const deleteButton = page.getByRole("button", { name: /delete/i });
    await expect(deleteButton).toHaveCount(0);

    // No forms other than filter inputs
    const forms = page.locator("form");
    const formCount = await forms.count();
    // At most one form (the filter form); no data-mutation forms
    expect(formCount).toBeLessThanOrEqual(1);
    await context.close();
  });

  test("drawer has no edit or delete controls", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/audit");
    await page.waitForLoadState("networkidle");

    const firstRow = page.locator("tbody tr").first();
    await firstRow.click();

    const drawer = page.locator('[role="dialog"], [data-state="open"]');
    await expect(drawer).toBeVisible();

    // No edit/delete buttons inside the drawer
    const editButton = drawer.getByRole("button", { name: /edit/i });
    await expect(editButton).toHaveCount(0);

    const deleteButton = drawer.getByRole("button", { name: /delete/i });
    await expect(deleteButton).toHaveCount(0);
    await context.close();
  });
});

// ── AC: Paginated or virtually scrolled for large audit logs ────────────

test.describe("AC: Pagination controls for large data sets", () => {
  test("pagination controls appear when entries exceed page size", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/audit");
    await page.waitForLoadState("networkidle");

    // With 30+ seeded entries exceeding the default page size of 25,
    // a "Load More" or pagination button should appear
    const loadMore = page.getByRole("button", {
      name: /load more|next|show more/i,
    });
    await expect(loadMore).toBeVisible();
    await context.close();
  });

  test("clicking pagination loads different entries", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/audit");
    await page.waitForLoadState("networkidle");

    // Capture the first row content before pagination
    const firstRowBefore = await page.locator("tbody tr").last().textContent();

    // Click Load More / Next
    const loadMore = page.getByRole("button", {
      name: /load more|next|show more/i,
    });
    await loadMore.click();
    await page.waitForLoadState("networkidle");

    // After loading more, there should be additional rows
    const rowCount = await page.locator("tbody tr").count();
    expect(rowCount).toBeGreaterThan(25);

    // The last row should now be different (new entries loaded)
    const lastRowAfter = await page.locator("tbody tr").last().textContent();
    expect(lastRowAfter).not.toBe(firstRowBefore);
    await context.close();
  });

  test("pagination button is hidden when all entries are loaded", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/audit");
    await page.waitForLoadState("networkidle");

    // Click Load More until all entries are loaded
    const loadMore = page.getByRole("button", {
      name: /load more|next|show more/i,
    });

    // Keep clicking until the button disappears (isDone=true hides it)
    let attempts = 0;
    while ((await loadMore.isVisible()) && attempts < 10) {
      await loadMore.click();
      await page.waitForLoadState("networkidle");
      attempts++;
    }

    await expect(loadMore).not.toBeVisible();
    await context.close();
  });
});

// ── AC: Empty state ─────────────────────────────────────────────────────

test.describe("AC: Empty state message", () => {
  test("shows empty state when no audit entries exist", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/audit");
    await page.waitForLoadState("networkidle");

    const emptyState = page.locator('[data-testid="empty-state"]');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText("No audit log entries found");
    await context.close();
  });
});
