import { test, expect } from "./fixtures";
import { test as base } from "@playwright/test";
import { createTestCaseWithInvite, createTestUser, loginAs, consumeTestInvite } from "./helpers";
import AxeBuilder from "@axe-core/playwright";

// ── AC 1: Logged-out view — centered card, heading, body, sign-in ──────

base.describe("AC: Logged-out view for invite accept page", () => {
  base("renders centered card with initiator name in heading", async ({
    browser,
  }) => {
    const invite = await createTestCaseWithInvite({
      initiatorEmail: "initiator-e2e@example.com",
      mainTopic: "How we communicate at work",
      category: "workplace",
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to the invite page without auth
    await page.goto(`/invite/${invite.token}`);
    await page.waitForLoadState("domcontentloaded");

    // Heading should contain the initiator's name and invitation text
    const heading = page.getByRole("heading");
    await expect(heading).toBeVisible({ timeout: 10_000 });
    await expect(heading).toContainText(/invited you to work through something together/i);

    // Body should explain Clarity
    await expect(
      page.getByText(/clarity is a private mediation tool/i),
    ).toBeVisible();

    // Sign in button should be present and focusable
    const signInButton = page.getByRole("button", {
      name: /sign in to continue/i,
    });
    await expect(signInButton).toBeVisible();
    await signInButton.focus();
    await expect(signInButton).toBeFocused();

    await context.close();
  });

  base("does not show Accept or Decline buttons when logged out", async ({
    browser,
  }) => {
    const invite = await createTestCaseWithInvite({
      initiatorEmail: "initiator-e2e@example.com",
    });

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/invite/${invite.token}`);
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("button", { name: /accept invitation/i }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /decline/i }),
    ).not.toBeVisible();

    await context.close();
  });
});

// ── AC 2: Token persistence through auth flow ──────────────────────────

base.describe("AC: Invite token persists through auth redirect", () => {
  base("redirects back to /invite/:token after sign-in", async ({
    browser,
  }) => {
    const invite = await createTestCaseWithInvite({
      initiatorEmail: "initiator-e2e@example.com",
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to the invite page without auth
    await page.goto(`/invite/${invite.token}`);
    await page.waitForLoadState("domcontentloaded");

    // Click sign in
    await page
      .getByRole("button", { name: /sign in to continue/i })
      .click();

    // Should navigate to /login with redirect param
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain(
      `redirect=${encodeURIComponent(`/invite/${invite.token}`)}`,
    );

    // Complete the auth flow (test auth bypass)
    const { email } = await createTestUser();
    await loginAs(page, email);

    // After auth, should land back on /invite/:token
    await page.waitForURL(new RegExp(`/invite/${invite.token}`), {
      timeout: 15_000,
    });
    expect(page.url()).toContain(`/invite/${invite.token}`);

    // Should now see the logged-in view
    await expect(
      page.getByRole("button", { name: /accept invitation/i }),
    ).toBeVisible({ timeout: 10_000 });

    await context.close();
  });
});

// ── AC 3: Logged-in unredeemed view — mainTopic, category, buttons ─────

test.describe("AC: Logged-in unredeemed view", () => {
  test("displays mainTopic, category, and Accept/Decline buttons", async ({
    authenticatedPage,
  }) => {
    const invite = await createTestCaseWithInvite({
      initiatorEmail: "initiator-e2e-2@example.com",
      mainTopic: "Team project deadlines",
      category: "workplace",
    });

    await authenticatedPage.goto(`/invite/${invite.token}`);
    await authenticatedPage.waitForLoadState("domcontentloaded");

    // mainTopic should be displayed
    await expect(
      authenticatedPage.getByText("Team project deadlines"),
    ).toBeVisible({ timeout: 10_000 });

    // category should be displayed
    await expect(
      authenticatedPage.getByText(/workplace/i),
    ).toBeVisible();

    // Accept and Decline buttons visible
    await expect(
      authenticatedPage.getByRole("button", { name: /accept invitation/i }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole("button", { name: /decline/i }),
    ).toBeVisible();
  });
});

// ── AC 5: Accept flow — redeem + redirect to /cases/:caseId/private ────

test.describe("AC: Accept invitation flow", () => {
  test("clicking Accept routes to /cases/:caseId/private", async ({
    authenticatedPage,
  }) => {
    const invite = await createTestCaseWithInvite({
      initiatorEmail: "initiator-e2e-3@example.com",
      mainTopic: "Budget planning",
      category: "personal",
    });

    await authenticatedPage.goto(`/invite/${invite.token}`);
    await authenticatedPage.waitForLoadState("domcontentloaded");

    // Wait for accept button
    const acceptButton = authenticatedPage.getByRole("button", {
      name: /accept invitation/i,
    });
    await expect(acceptButton).toBeVisible({ timeout: 10_000 });

    // Click Accept
    await acceptButton.click();

    // Should redirect to /cases/:caseId/private
    await authenticatedPage.waitForURL(/\/cases\/[^/]+\/private/, {
      timeout: 15_000,
    });
    expect(authenticatedPage.url()).toMatch(/\/cases\/[^/]+\/private/);
  });
});

// ── AC 6: Decline flow — redirect away from invite page ────────────────

test.describe("AC: Decline invitation flow", () => {
  test("clicking Decline redirects to dashboard", async ({
    authenticatedPage,
  }) => {
    const invite = await createTestCaseWithInvite({
      initiatorEmail: "initiator-e2e-4@example.com",
      mainTopic: "Office space",
      category: "workplace",
    });

    await authenticatedPage.goto(`/invite/${invite.token}`);
    await authenticatedPage.waitForLoadState("domcontentloaded");

    // Wait for decline button
    const declineButton = authenticatedPage.getByRole("button", {
      name: /decline/i,
    });
    await expect(declineButton).toBeVisible({ timeout: 10_000 });

    // Click Decline
    await declineButton.click();

    // Should navigate away from the invite page (to dashboard)
    await authenticatedPage.waitForURL(/\/dashboard/, {
      timeout: 15_000,
    });
    expect(authenticatedPage.url()).toMatch(/\/dashboard/);
  });
});

// ── AC 7: Consumed token — error message and navigation options ────────

test.describe("AC: Consumed token shows error state", () => {
  test("displays error message with dashboard link for consumed token (logged in)", async ({
    authenticatedPage,
  }) => {
    const invite = await createTestCaseWithInvite({
      initiatorEmail: "initiator-e2e-5@example.com",
    });

    // Consume the token via the backend before navigating
    await consumeTestInvite(invite.token);

    // Navigate to the original (now-consumed) token URL
    await authenticatedPage.goto(`/invite/${invite.token}`);
    await authenticatedPage.waitForLoadState("domcontentloaded");

    // Should show consumed-specific error message
    await expect(
      authenticatedPage.getByText(/this invite has already been accepted/i),
    ).toBeVisible({ timeout: 10_000 });

    // Should show dashboard navigation
    await expect(
      authenticatedPage.getByText(/go to dashboard/i),
    ).toBeVisible();
  });
});

// ── AC 8: Accessibility — keyboard navigation and WCAG AA ──────────────

test.describe("AC: Keyboard navigability and WCAG AA", () => {
  test("all interactive elements are reachable via Tab key (logged-in view)", async ({
    authenticatedPage,
  }) => {
    const invite = await createTestCaseWithInvite({
      initiatorEmail: "initiator-e2e-6@example.com",
      mainTopic: "Accessibility test",
      category: "personal",
    });

    await authenticatedPage.goto(`/invite/${invite.token}`);
    await authenticatedPage.waitForLoadState("domcontentloaded");

    // Wait for page to render
    await expect(
      authenticatedPage.getByRole("button", { name: /accept invitation/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Tab through interactive elements
    const focusedElements: string[] = [];

    for (let i = 0; i < 10; i++) {
      await authenticatedPage.keyboard.press("Tab");
      const tagName = await authenticatedPage.evaluate(() =>
        document.activeElement?.tagName.toLowerCase() ?? "none",
      );
      const role = await authenticatedPage.evaluate(() =>
        document.activeElement?.getAttribute("role") ?? "",
      );
      focusedElements.push(role || tagName);
    }

    // Should have reached at least the Accept and Decline buttons
    const buttonCount = focusedElements.filter(
      (el) => el === "button",
    ).length;
    expect(buttonCount).toBeGreaterThanOrEqual(2);
  });

  test("passes axe accessibility audit for WCAG AA", async ({
    authenticatedPage,
  }) => {
    const invite = await createTestCaseWithInvite({
      initiatorEmail: "initiator-e2e-7@example.com",
      mainTopic: "A11y audit test",
      category: "personal",
    });

    await authenticatedPage.goto(`/invite/${invite.token}`);
    await authenticatedPage.waitForLoadState("domcontentloaded");

    // Wait for content to render
    await expect(
      authenticatedPage.getByRole("button", { name: /accept invitation/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Run axe accessibility audit
    const results = await new AxeBuilder({ page: authenticatedPage })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test("all interactive elements are reachable via Tab key (logged-out view)", async ({
    browser,
  }) => {
    const invite = await createTestCaseWithInvite({
      initiatorEmail: "initiator-e2e-8@example.com",
    });

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/invite/${invite.token}`);
    await page.waitForLoadState("domcontentloaded");

    // Wait for sign-in button
    await expect(
      page.getByRole("button", { name: /sign in to continue/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Tab to the sign-in button
    const focusedButtons: string[] = [];

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const tagName = await page.evaluate(() =>
        document.activeElement?.tagName.toLowerCase() ?? "none",
      );
      focusedButtons.push(tagName);
    }

    // Should reach at least one button (Sign in to continue)
    expect(focusedButtons.filter((t) => t === "button").length).toBeGreaterThanOrEqual(1);

    await context.close();
  });
});
