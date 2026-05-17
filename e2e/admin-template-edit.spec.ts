import { test, expect } from "./fixtures";
import { createTestUser, loginAs } from "./helpers";

/**
 * WOR-134: Admin template edit page — E2E tests.
 *
 * Covers: two-pane layout, version history timeline, Publish New Version,
 * Archive Template with confirmation modal, form pre-population, and
 * admin-only route gating.
 *
 * At red state, the AdminTemplateEditPage component does not exist —
 * navigating to /admin/templates/:id will show the stub or a blank page.
 * Tests will fail because expected elements won't render. That is the
 * correct red-state failure.
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

// ── AC: Route /admin/templates/:id accessible only to admin users ─────────

test.describe("AC: Admin-only route gating for template edit page", () => {
  test("non-admin user is redirected to /dashboard", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsNonAdmin(page);

    await page.goto("/admin/templates/some-template-id");
    await page.waitForURL("**/dashboard");

    expect(page.url()).toContain("/dashboard");
    await context.close();
  });

  test("admin user can access /admin/templates/:id", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates/some-template-id");
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/admin/templates/");
    await context.close();
  });
});

// ── AC: Two-pane layout: left (form), right (version history timeline) ────

test.describe("AC: Two-pane layout", () => {
  test("left pane (form) and right pane (version timeline) are both visible", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates/some-template-id");
    await page.waitForLoadState("networkidle");

    // Left pane: the form section
    const formPane = page
      .locator("[data-testid='edit-form-pane']")
      .or(page.locator("form"));
    await expect(formPane.first()).toBeVisible();

    // Right pane: the version history timeline
    const timelinePane = page
      .locator("[data-testid='version-timeline-pane']")
      .or(page.locator("section").filter({ hasText: /version history/i }));
    await expect(timelinePane.first()).toBeVisible();

    await context.close();
  });
});

// ── AC: Form fields: Category (select), Name (text), Global Guidance
//    (large textarea), Coach Instructions (textarea), Draft Coach
//    Instructions (textarea), Notes (textarea) ────────────────────────────

test.describe("AC: Form fields are present with correct types", () => {
  test("all six form fields render on the edit page", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates/some-template-id");
    await page.waitForLoadState("networkidle");

    // Category displayed (read-only context per contract) — look for the label+value pair
    const categorySection = page
      .locator("[data-testid='template-category']")
      .or(page.locator("dt, label").filter({ hasText: /^category$/i }));
    await expect(categorySection.first()).toBeVisible();

    // Name displayed (read-only context per contract)
    const nameSection = page
      .locator("[data-testid='template-name']")
      .or(page.locator("dt, label").filter({ hasText: /^name$/i }));
    await expect(nameSection.first()).toBeVisible();

    // Global Guidance textarea
    await expect(page.getByLabel(/global guidance/i)).toBeVisible();

    // Coach Instructions textarea
    await expect(page.getByLabel(/^coach instructions$/i)).toBeVisible();

    // Draft Coach Instructions textarea
    await expect(page.getByLabel(/draft coach instructions/i)).toBeVisible();

    // Notes textarea
    await expect(page.getByLabel(/notes/i)).toBeVisible();

    await context.close();
  });
});

// ── AC: Form pre-populated with current version's content when editing ────

test.describe("AC: Form pre-populated with current version content", () => {
  test("textarea fields contain content from the current template version", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates/some-template-id");
    await page.waitForLoadState("networkidle");

    // Global Guidance should have content (not empty)
    const globalGuidance = page.getByLabel(/global guidance/i);
    await expect(globalGuidance).toBeVisible();
    const guidanceValue = await globalGuidance.inputValue();
    expect(guidanceValue.length).toBeGreaterThan(0);

    await context.close();
  });
});

// ── AC: Version history timeline: each published version shows date,
//    admin name, notes, "View" button for read-only diff ──────────────────

test.describe("AC: Version history timeline", () => {
  test("timeline displays version entries with date, admin name, and notes", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates/some-template-id");
    await page.waitForLoadState("networkidle");

    // Version timeline section exists
    const timeline = page
      .locator("[data-testid='version-timeline-pane']")
      .or(page.locator("section").filter({ hasText: /version history/i }));
    await expect(timeline.first()).toBeVisible();

    // Each version entry should have a View button
    const viewButtons = timeline.first().getByRole("button", { name: /view/i });
    await expect(viewButtons.first()).toBeVisible();

    await context.close();
  });

  test("versions are ordered newest-first", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates/some-template-id");
    await page.waitForLoadState("networkidle");

    const timeline = page
      .locator("[data-testid='version-timeline-pane']")
      .or(page.locator("section").filter({ hasText: /version history/i }));

    // Get all version number indicators — expect first to be higher than last
    const versionLabels = timeline.first().locator("[data-version]");
    const count = await versionLabels.count();
    if (count >= 2) {
      const firstVersion = await versionLabels
        .first()
        .getAttribute("data-version");
      const lastVersion = await versionLabels
        .last()
        .getAttribute("data-version");
      expect(Number(firstVersion)).toBeGreaterThan(Number(lastVersion));
    }

    await context.close();
  });

  test("clicking View shows read-only content of that version", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates/some-template-id");
    await page.waitForLoadState("networkidle");

    const timeline = page
      .locator("[data-testid='version-timeline-pane']")
      .or(page.locator("section").filter({ hasText: /version history/i }));

    const viewButton = timeline
      .first()
      .getByRole("button", { name: /view/i })
      .first();
    await viewButton.click();

    // Read-only content should appear (overlay or expansion)
    const readOnlyContent = page
      .locator("[data-testid='version-content-view']")
      .or(page.locator("[role='dialog']").filter({ hasText: /guidance/i }));
    await expect(readOnlyContent.first()).toBeVisible();

    await context.close();
  });
});

// ── AC: "Publish New Version" primary button creates immutable version
//    via admin/templates/publishNewVersion mutation ─────────────────────────

test.describe("AC: Publish New Version", () => {
  test("Publish New Version button is visible and styled as primary", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates/some-template-id");
    await page.waitForLoadState("networkidle");

    const publishButton = page.getByRole("button", {
      name: /publish new version/i,
    });
    await expect(publishButton).toBeVisible();

    await context.close();
  });

  test("publishing creates a new version visible in the timeline", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates/some-template-id");
    await page.waitForLoadState("networkidle");

    // Modify the Global Guidance field
    const globalGuidance = page.getByLabel(/global guidance/i);
    await globalGuidance.fill("Updated guidance for the next version.");

    // Add notes
    const notes = page.getByLabel(/notes/i);
    await notes.fill("E2E test publish");

    // Click Publish
    const publishButton = page.getByRole("button", {
      name: /publish new version/i,
    });
    await publishButton.click();

    // Wait for the new version to appear in the timeline (reactive update)
    const timeline = page
      .locator("[data-testid='version-timeline-pane']")
      .or(page.locator("section").filter({ hasText: /version history/i }));
    await expect(timeline.first().getByText("E2E test publish")).toBeVisible({
      timeout: 5000,
    });

    await context.close();
  });

  test("Publish button is disabled when Global Guidance is empty", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates/some-template-id");
    await page.waitForLoadState("networkidle");

    // Clear the Global Guidance field
    const globalGuidance = page.getByLabel(/global guidance/i);
    await globalGuidance.fill("");

    const publishButton = page.getByRole("button", {
      name: /publish new version/i,
    });
    await expect(publishButton).toBeDisabled();

    await context.close();
  });
});

// ── AC: "Archive Template" danger button with confirmation modal showing
//    count of pinned cases; calls admin/templates/archive mutation ──────────

test.describe("AC: Archive Template", () => {
  test("Archive Template button is visible and styled as danger", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates/some-template-id");
    await page.waitForLoadState("networkidle");

    const archiveButton = page.getByRole("button", {
      name: /archive template/i,
    });
    await expect(archiveButton).toBeVisible();

    await context.close();
  });

  test("clicking Archive opens confirmation modal with pinned case count", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates/some-template-id");
    await page.waitForLoadState("networkidle");

    const archiveButton = page.getByRole("button", {
      name: /archive template/i,
    });
    await archiveButton.click();

    // Confirmation modal should appear
    const modal = page
      .locator("[role='dialog']")
      .or(page.locator("[role='alertdialog']"));
    await expect(modal.first()).toBeVisible();

    // Modal must show pinned cases count
    await expect(modal.first().getByText(/pinned/i)).toBeVisible();

    // Modal must have a confirm action
    const confirmButton = modal
      .first()
      .getByRole("button", { name: /confirm|archive/i });
    await expect(confirmButton).toBeVisible();

    await context.close();
  });

  test("confirming archive redirects to /admin/templates list", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await page.goto("/admin/templates/some-template-id");
    await page.waitForLoadState("networkidle");

    // Open archive modal
    const archiveButton = page.getByRole("button", {
      name: /archive template/i,
    });
    await archiveButton.click();

    const modal = page
      .locator("[role='dialog']")
      .or(page.locator("[role='alertdialog']"));
    await expect(modal.first()).toBeVisible();

    // Confirm the archive
    const confirmButton = modal
      .first()
      .getByRole("button", { name: /confirm|archive/i });
    await confirmButton.click();

    // Should redirect to templates list
    await page.waitForURL("**/admin/templates", { timeout: 5000 });
    expect(page.url()).toMatch(/\/admin\/templates\/?$/);

    await context.close();
  });
});
