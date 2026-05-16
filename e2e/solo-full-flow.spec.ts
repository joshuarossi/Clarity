import { test, expect } from "./fixtures";
import { createTestCase } from "./helpers";

// ── Solo mode full E2E flow ────────────────────────────────────────────
// Covers:
//   AC: All data queries respect the acting party from the hook
//   AC: AI responses behave as if each party were separate
//
// These tests exercise the full partyRole-tagged query pipeline in a
// real browser against a running Convex backend.

test.describe("Solo mode — party toggle and message isolation", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      isSolo: true,
      category: "workplace",
    });
    caseId = result.caseId;
  });

  test("party toggle is visible on solo case private coaching page", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}/private?as=initiator`);

    // PartyToggle should be visible with "VIEWING AS" label
    const toggle = pageA.locator(".party-toggle");
    await expect(toggle).toBeVisible({ timeout: 10_000 });

    const label = pageA.locator(".party-toggle-label");
    await expect(label).toBeVisible();
    await expect(label).toHaveText("VIEWING AS");
  });

  test("party toggle shows both party name buttons", async ({ pageA }) => {
    await pageA.goto(`/cases/${caseId}/private?as=initiator`);

    const toggle = pageA.locator(".party-toggle");
    await expect(toggle).toBeVisible({ timeout: 10_000 });

    // Both toggle buttons should be present
    const buttons = toggle.locator(".party-toggle-btn");
    await expect(buttons).toHaveCount(2);
  });

  test("clicking toggle switches URL param to ?as=invitee", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}/private?as=initiator`);

    const toggle = pageA.locator(".party-toggle");
    await expect(toggle).toBeVisible({ timeout: 10_000 });

    // The initiator button should be active initially
    const initiatorBtn = toggle.locator(
      ".party-toggle-btn[data-active='true']",
    );
    await expect(initiatorBtn).toBeVisible();

    // Click the inactive (invitee) button
    const inviteeBtn = toggle.locator(
      ".party-toggle-btn[data-active='false']",
    );
    await inviteeBtn.click();

    // URL should now have ?as=invitee
    await expect(pageA).toHaveURL(/[?&]as=invitee/);

    // The invitee button should now be active
    const nowActiveBtn = toggle.locator(
      ".party-toggle-btn[data-active='true']",
    );
    await expect(nowActiveBtn).toBeVisible();
  });

  test("toggle state survives page refresh", async ({ pageA }) => {
    await pageA.goto(`/cases/${caseId}/private?as=invitee`);

    const toggle = pageA.locator(".party-toggle");
    await expect(toggle).toBeVisible({ timeout: 10_000 });

    // Verify invitee is the active party
    const activeBtn = toggle.locator(
      ".party-toggle-btn[data-active='true']",
    );
    await expect(activeBtn).toBeVisible();

    // Refresh the page
    await pageA.reload();

    // Toggle should still show invitee as active after refresh
    const toggleAfterRefresh = pageA.locator(".party-toggle");
    await expect(toggleAfterRefresh).toBeVisible({ timeout: 10_000 });

    const activeBtnAfterRefresh = toggleAfterRefresh.locator(
      ".party-toggle-btn[data-active='true']",
    );
    await expect(activeBtnAfterRefresh).toBeVisible();

    // URL should still contain ?as=invitee
    await expect(pageA).toHaveURL(/[?&]as=invitee/);
  });

  test("AC: message isolation — initiator messages not visible when toggled to invitee", async ({
    pageA,
  }) => {
    // Step 1: Send a message as Initiator
    await pageA.goto(`/cases/${caseId}/private?as=initiator`);

    const textarea = pageA.getByRole("textbox", { name: /message input/i });
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    await textarea.fill(
      "This is the initiator's private coaching message.",
    );
    await textarea.press("Enter");

    // Verify the initiator message appears
    await expect(
      pageA.getByText(
        "This is the initiator's private coaching message.",
      ),
    ).toBeVisible({ timeout: 5_000 });

    // Wait for AI response to complete
    const completedBubble = pageA.locator(
      "[class*='cc-bubble-coach'][data-status='COMPLETE']",
    );
    await expect(completedBubble.first()).toBeVisible({ timeout: 30_000 });

    // Step 2: Toggle to Invitee
    const inviteeBtn = pageA.locator(
      ".party-toggle .party-toggle-btn[data-active='false']",
    );
    await inviteeBtn.click();

    await expect(pageA).toHaveURL(/[?&]as=invitee/);

    // Step 3: Initiator's messages should NOT be visible
    await expect(
      pageA.getByText(
        "This is the initiator's private coaching message.",
      ),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test("AC: message isolation — invitee messages not visible when toggled back to initiator", async ({
    pageA,
  }) => {
    // Step 1: Navigate as Invitee and send a message
    await pageA.goto(`/cases/${caseId}/private?as=invitee`);

    const textarea = pageA.getByRole("textbox", { name: /message input/i });
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    await textarea.fill("This is the invitee's private coaching message.");
    await textarea.press("Enter");

    // Verify the invitee message appears
    await expect(
      pageA.getByText("This is the invitee's private coaching message."),
    ).toBeVisible({ timeout: 5_000 });

    // Step 2: Toggle back to Initiator
    const initiatorBtn = pageA.locator(
      ".party-toggle .party-toggle-btn[data-active='false']",
    );
    await initiatorBtn.click();

    await expect(pageA).toHaveURL(/[?&]as=initiator/);

    // Step 3: Invitee's messages should NOT be visible
    await expect(
      pageA.getByText("This is the invitee's private coaching message."),
    ).not.toBeVisible({ timeout: 5_000 });

    // Step 4: Initiator's earlier messages SHOULD still be visible
    // (from the previous test's message, if the case persists across tests)
  });

  test("AC: AI responses are separate per party — invitee has fresh coaching context", async ({
    pageA,
  }) => {
    // Step 1: As Initiator, verify there are AI responses from prior interaction
    await pageA.goto(`/cases/${caseId}/private?as=initiator`);

    const initiatorCoachBubbles = pageA.locator(
      "[class*='cc-bubble-coach'][data-status='COMPLETE']",
    );
    await expect(initiatorCoachBubbles.first()).toBeVisible({
      timeout: 10_000,
    });

    // Step 2: Toggle to Invitee
    await pageA.goto(`/cases/${caseId}/private?as=invitee`);

    // Step 3: Invitee should have their own separate AI responses
    // (or none if they haven't chatted yet). The key assertion is that
    // the Initiator's coach responses are NOT mixed in.
    const inviteeCoachBubbles = pageA.locator(
      "[class*='cc-bubble-coach'][data-status='COMPLETE']",
    );

    // Invitee has not chatted, so there should be zero AI coach bubbles.
    // Use assertion-based waiting instead of waitForTimeout (Playwright best practice).
    await expect(inviteeCoachBubbles).toHaveCount(0, { timeout: 5_000 });
  });

  test("party toggle is NOT visible on non-solo cases", async ({
    pageA,
  }) => {
    // Create a non-solo case
    const nonSoloResult = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      category: "workplace",
    });

    await pageA.goto(`/cases/${nonSoloResult.caseId}/private`);

    // Wait for page to load
    const textarea = pageA.getByRole("textbox", { name: /message input/i });
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // PartyToggle should NOT be present on non-solo case
    const toggle = pageA.locator(".party-toggle");
    await expect(toggle).not.toBeVisible();
  });
});
