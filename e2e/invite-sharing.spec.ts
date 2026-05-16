import { test, expect } from "./fixtures";

// ── AC: Solo mode cases skip invite page and route to private coaching ───

test.describe("AC: Solo mode cases skip invite sharing page", () => {
  test("creating a solo case navigates directly to /cases/:caseId/private, never rendering the invite page", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/cases/new");
    await authenticatedPage.waitForLoadState("domcontentloaded");

    // Select a category
    await authenticatedPage.getByLabel("Workplace").click();

    // Fill main topic
    await authenticatedPage
      .getByLabel(/in one sentence, what.?s this about/i)
      .fill("Solo test topic");

    // Fill description
    const descriptionTextarea = authenticatedPage.locator(
      "textarea[rows='5']",
    );
    await descriptionTextarea.fill("Solo test description");

    // Expand Advanced and enable solo mode
    const advancedToggle =
      authenticatedPage.locator("summary").or(
        authenticatedPage.getByText(/advanced/i),
      );
    await advancedToggle.first().click();

    await authenticatedPage.getByRole("checkbox").click();

    // Submit the form
    await authenticatedPage
      .getByRole("button", { name: /create|submit/i })
      .click();

    // Should navigate directly to private coaching, not to the invite page
    await authenticatedPage.waitForURL(/\/cases\/[^/]+\/private/, {
      timeout: 15_000,
    });
    expect(authenticatedPage.url()).toMatch(/\/cases\/[^/]+\/private/);

    // The invite sharing page heading should never have appeared
    const inviteHeading = authenticatedPage.getByRole("heading", {
      name: /your case is ready/i,
    });
    await expect(inviteHeading).not.toBeVisible();
  });
});

// ── AC: Non-solo case navigates to invite page (control case) ───────────

test.describe("AC: Non-solo case shows invite sharing page", () => {
  test("creating a non-solo case navigates to /cases/:caseId/invite", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/cases/new");
    await authenticatedPage.waitForLoadState("domcontentloaded");

    // Select a category
    await authenticatedPage.getByLabel("Workplace").click();

    // Fill main topic
    await authenticatedPage
      .getByLabel(/in one sentence, what.?s this about/i)
      .fill("Non-solo test topic");

    // Fill description
    const descriptionTextarea = authenticatedPage.locator(
      "textarea[rows='5']",
    );
    await descriptionTextarea.fill("Non-solo test description");

    // Fill other party name
    await authenticatedPage
      .getByText(/just a first name or nickname is fine/i)
      .locator("..")
      .locator("input")
      .fill("Jordan");

    // Submit the form (no solo checkbox)
    await authenticatedPage
      .getByRole("button", { name: /create|submit/i })
      .click();

    // Should navigate to the invite sharing page
    await authenticatedPage.waitForURL(/\/cases\/[^/]+\/invite/, {
      timeout: 15_000,
    });
    expect(authenticatedPage.url()).toMatch(/\/cases\/[^/]+\/invite/);

    // The invite sharing page heading should be visible
    const inviteHeading = authenticatedPage.getByRole("heading", {
      name: /your case is ready/i,
    });
    await expect(inviteHeading).toBeVisible({ timeout: 10_000 });
  });
});
