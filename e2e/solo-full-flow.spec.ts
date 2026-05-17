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
    const inviteeBtn = toggle.locator(".party-toggle-btn[data-active='false']");
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
    const activeBtn = toggle.locator(".party-toggle-btn[data-active='true']");
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

    await textarea.fill("This is the initiator's private coaching message.");
    await textarea.press("Enter");

    // Verify the initiator message appears
    await expect(
      pageA.getByText("This is the initiator's private coaching message."),
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
      pageA.getByText("This is the initiator's private coaching message."),
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

  test("party toggle is NOT visible on non-solo cases", async ({ pageA }) => {
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

// ── WOR-123: ReadyForJointView — synthesis accessible after entering ────
// AC: "Synthesis remains accessible from 'View my guidance' link in
//      joint chat top nav after entering"
//
// This test exercises the full flow: ready page shows synthesis →
// click Enter Joint Session → joint chat page has "View my guidance" link
// that opens the synthesis.

test.describe("Solo mode — ready page → joint session entry → synthesis accessibility", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      isSolo: true,
      category: "workplace",
      status: "READY_FOR_JOINT",
    });
    caseId = result.caseId;
  });

  test("ready page displays synthesis content for the acting party", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}/ready?as=initiator`);

    // Synthesis card should be visible with content
    const synthesisCard = pageA.locator(".cc-synthesis-card");
    await expect(synthesisCard).toBeVisible({ timeout: 10_000 });

    // Verify at least one of the expected H3 headings renders
    const heading = pageA.getByRole("heading", {
      name: /Areas of likely agreement/,
      level: 3,
    });
    await expect(heading).toBeVisible();
  });

  test("privacy banner shows other party name on ready page", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}/ready?as=initiator`);

    // Privacy banner should include the other party's name
    const banner = pageA.locator(".cc-banner-privacy");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText("has their own version");
  });

  test("clicking 'Enter Joint Session →' navigates to joint chat", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}/ready?as=initiator`);

    // Click the CTA button
    const ctaButton = pageA.getByRole("button", {
      name: /Enter Joint Session/,
    });
    await expect(ctaButton).toBeVisible({ timeout: 10_000 });
    await ctaButton.click();

    // Should navigate to the joint chat page
    await expect(pageA).toHaveURL(new RegExp(`/cases/${caseId}/joint`), {
      timeout: 10_000,
    });
  });

  test("AC: synthesis remains accessible via 'View my guidance' link after entering joint session", async ({
    pageA,
  }) => {
    // Navigate to joint chat (case should already be JOINT_ACTIVE from prior test)
    await pageA.goto(`/cases/${caseId}/joint?as=initiator`);

    // The joint chat top nav should have a "View my guidance" link
    const guidanceLink = pageA.getByRole("link", {
      name: /View my guidance/i,
    });
    await expect(guidanceLink).toBeVisible({ timeout: 10_000 });

    // Clicking it should show the synthesis content
    await guidanceLink.click();

    // Verify synthesis content is displayed (could be a modal, panel, or navigated page)
    const synthesisContent = pageA.locator(".cc-synthesis-card");
    await expect(synthesisContent).toBeVisible({ timeout: 10_000 });

    // Verify synthesis heading is present
    const heading = pageA.getByRole("heading", {
      name: /Areas of likely agreement/,
      level: 3,
    });
    await expect(heading).toBeVisible();
  });
});

// ── WOR-130: Closure UI — proposal modal + confirmation banner ────────
// Covers:
//   AC: Close button in joint chat top nav opens closure modal
//   AC: "Propose Resolution" calls jointChat/proposeClosure mutation
//   AC: "Close without resolution" calls jointChat/unilateralClose mutation
//   AC: Confirmation banner shown to other party with summary + buttons
//   AC: Confirm calls jointChat/confirmClosure → CLOSED_RESOLVED
//   AC: Reject clears the closure proposal
//   AC: Take a break — modal closes, case stays JOINT_ACTIVE

test.describe("Solo mode — closure modal and confirmation banner", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      isSolo: true,
      category: "workplace",
      status: "JOINT_ACTIVE",
    });
    caseId = result.caseId;
  });

  test("AC: Close button in joint chat top nav opens the closure modal dialog", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}/joint?as=initiator`);

    // Click the Close button in the top nav
    const closeButton = pageA.getByRole("button", { name: /close/i });
    await expect(closeButton).toBeVisible({ timeout: 10_000 });
    await closeButton.click();

    // Assert the Dialog is visible (Radix Dialog, not browser confirm)
    const dialogContent = pageA.locator(".cc-dialog-content");
    await expect(dialogContent).toBeVisible({ timeout: 5_000 });

    // Assert three option buttons are present
    await expect(
      pageA.getByRole("button", { name: /^resolved$/i }),
    ).toBeVisible();
    await expect(
      pageA.getByRole("button", { name: /not resolved/i }),
    ).toBeVisible();
    await expect(
      pageA.getByRole("button", { name: /take a break/i }),
    ).toBeVisible();
  });

  test("AC: Resolved path — fill summary, Propose Resolution, banner appears, Confirm closes case", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}/joint?as=initiator`);

    // Open the closure modal
    const closeButton = pageA.getByRole("button", { name: /close/i });
    await expect(closeButton).toBeVisible({ timeout: 10_000 });
    await closeButton.click();

    const dialogContent = pageA.locator(".cc-dialog-content");
    await expect(dialogContent).toBeVisible({ timeout: 5_000 });

    // Select "Resolved"
    await pageA.getByRole("button", { name: /^resolved$/i }).click();

    // Fill the summary textarea
    const textarea = pageA.getByRole("textbox");
    await expect(textarea).toBeVisible();
    await textarea.fill("We agreed to meet weekly to discuss progress.");

    // Click "Propose Resolution"
    await pageA.getByRole("button", { name: /propose resolution/i }).click();

    // Modal should close after proposing
    await expect(dialogContent).not.toBeVisible({ timeout: 5_000 });

    // Toggle to the other party (invitee) to see the confirmation banner
    const inviteeBtn = pageA.locator(
      ".party-toggle .party-toggle-btn[data-active='false']",
    );
    await inviteeBtn.click();
    await expect(pageA).toHaveURL(/[?&]as=invitee/);

    // Confirmation banner should be visible with summary text
    await expect(
      pageA.getByText(/has proposed resolving this case/i),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      pageA.getByText(/We agreed to meet weekly to discuss progress/),
    ).toBeVisible();

    // Click "Confirm" on the banner
    const confirmBtn = pageA.getByRole("button", { name: /confirm/i });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Case should transition to CLOSED_RESOLVED — redirected to closed page
    await expect(pageA).toHaveURL(new RegExp(`/cases/${caseId}/closed`), {
      timeout: 10_000,
    });
  });
});

test.describe("Solo mode — not resolved and take a break closure paths", () => {
  let notResolvedCaseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      isSolo: true,
      category: "workplace",
      status: "JOINT_ACTIVE",
    });
    notResolvedCaseId = result.caseId;
  });

  test("AC: Not resolved path — Close without resolution transitions to CLOSED_UNRESOLVED", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${notResolvedCaseId}/joint?as=initiator`);

    // Open the closure modal
    const closeButton = pageA.getByRole("button", { name: /close/i });
    await expect(closeButton).toBeVisible({ timeout: 10_000 });
    await closeButton.click();

    const dialogContent = pageA.locator(".cc-dialog-content");
    await expect(dialogContent).toBeVisible({ timeout: 5_000 });

    // Select "Not resolved"
    await pageA.getByRole("button", { name: /not resolved/i }).click();

    // Verify warning message is displayed
    await expect(
      pageA.getByText(/this closes the case immediately for both of you/i),
    ).toBeVisible();

    // Click "Close without resolution"
    await pageA
      .getByRole("button", { name: /close without resolution/i })
      .click();

    // Case should transition to CLOSED_UNRESOLVED — page redirects away from joint chat
    await expect(pageA).not.toHaveURL(
      new RegExp(`/cases/${notResolvedCaseId}/joint`),
      { timeout: 10_000 },
    );
  });
});

test.describe("Solo mode — take a break path", () => {
  let breakCaseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      isSolo: true,
      category: "workplace",
      status: "JOINT_ACTIVE",
    });
    breakCaseId = result.caseId;
  });

  test("AC: Take a break closes modal, case stays JOINT_ACTIVE", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${breakCaseId}/joint?as=initiator`);

    // Open the closure modal
    const closeButton = pageA.getByRole("button", { name: /close/i });
    await expect(closeButton).toBeVisible({ timeout: 10_000 });
    await closeButton.click();

    const dialogContent = pageA.locator(".cc-dialog-content");
    await expect(dialogContent).toBeVisible({ timeout: 5_000 });

    // Click "Take a break"
    await pageA.getByRole("button", { name: /take a break/i }).click();

    // Modal should close
    await expect(dialogContent).not.toBeVisible({ timeout: 5_000 });

    // Should still be on the joint chat page (case remains JOINT_ACTIVE)
    await expect(pageA).toHaveURL(new RegExp(`/cases/${breakCaseId}/joint`));
  });
});

test.describe("Solo mode — reject closure proposal", () => {
  let rejectCaseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      isSolo: true,
      category: "workplace",
      status: "JOINT_ACTIVE",
    });
    rejectCaseId = result.caseId;
  });

  test("AC: Reject clears the closure proposal, banner disappears, case stays JOINT_ACTIVE", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${rejectCaseId}/joint?as=initiator`);

    // Open the closure modal and propose resolution
    const closeButton = pageA.getByRole("button", { name: /close/i });
    await expect(closeButton).toBeVisible({ timeout: 10_000 });
    await closeButton.click();

    const dialogContent = pageA.locator(".cc-dialog-content");
    await expect(dialogContent).toBeVisible({ timeout: 5_000 });

    await pageA.getByRole("button", { name: /^resolved$/i }).click();

    const textarea = pageA.getByRole("textbox");
    await textarea.fill("Let's try weekly check-ins.");

    await pageA.getByRole("button", { name: /propose resolution/i }).click();
    await expect(dialogContent).not.toBeVisible({ timeout: 5_000 });

    // Toggle to invitee to see the banner
    const inviteeBtn = pageA.locator(
      ".party-toggle .party-toggle-btn[data-active='false']",
    );
    await inviteeBtn.click();
    await expect(pageA).toHaveURL(/[?&]as=invitee/);

    // Banner should be visible
    const bannerText = pageA.getByText(/has proposed resolving this case/i);
    await expect(bannerText).toBeVisible({ timeout: 10_000 });

    // Click "Reject and keep talking"
    const rejectBtn = pageA.getByRole("button", {
      name: /reject and keep talking/i,
    });
    await expect(rejectBtn).toBeVisible();
    await rejectBtn.click();

    // Banner should disappear
    await expect(bannerText).not.toBeVisible({ timeout: 5_000 });

    // Case should remain JOINT_ACTIVE — still on the joint chat page
    await expect(pageA).toHaveURL(new RegExp(`/cases/${rejectCaseId}/joint`));
  });
});
