import { test, expect } from "./fixtures";
import { createTestCase, transitionCaseStatus } from "./helpers";

/**
 * WOR-129: DraftCoachPanel — E2E tests
 *
 * Tests the Draft Coach side panel, which is the primary UI surface
 * enforcing Clarity's send-gate principle: no message reaches the
 * other party without explicit user approval.
 */

test.describe("Draft Coach Panel — layout and open/close", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      category: "workplace",
      status: "JOINT_ACTIVE",
    });
    caseId = result.caseId;
    await transitionCaseStatus(caseId, "JOINT_ACTIVE");
  });

  // AC: Panel slides in from right, 420px wide on desktop, full-height, shadow-3
  test("panel slides in from right at 420px wide on desktop", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/cases/${caseId}/joint`);
    await page.waitForSelector("[data-testid='chat-window'], [class*='chat-window']", {
      timeout: 10_000,
    });

    // Click "Draft with Coach" to open the panel
    const draftButton = page.getByRole("button", { name: /draft with coach/i });
    await draftButton.click();

    // Assert panel appears with role='dialog'
    const panel = page.getByRole("dialog", { name: "Draft Coach" });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Assert width is 420px
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(420);

    // Assert panel is full-height (matches viewport height)
    const viewportSize = page.viewportSize();
    expect(viewportSize).not.toBeNull();
    expect(box!.height).toBe(viewportSize!.height);

    // Assert panel is positioned on the right side
    expect(box!.x + box!.width).toBe(viewportSize!.width);
  });

  // AC: Panel closes via close button
  test("panel closes when close button is clicked", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/cases/${caseId}/joint`);
    await page.waitForSelector("[data-testid='chat-window'], [class*='chat-window']", {
      timeout: 10_000,
    });

    const draftButton = page.getByRole("button", { name: /draft with coach/i });
    await draftButton.click();

    const panel = page.getByRole("dialog", { name: "Draft Coach" });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Click the close button
    const closeButton = panel.getByRole("button", { name: /close/i });
    await closeButton.click();

    // Panel should be removed
    await expect(panel).not.toBeVisible({ timeout: 3_000 });
  });
});

// AC: Mobile: becomes full-screen bottom sheet per DesignDoc §4.9
test.describe("Draft Coach Panel — mobile bottom sheet", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      category: "workplace",
      status: "JOINT_ACTIVE",
    });
    caseId = result.caseId;
    await transitionCaseStatus(caseId, "JOINT_ACTIVE");
  });

  test("renders as full-screen bottom sheet on mobile viewport", async ({
    authenticatedPage: page,
  }) => {
    // Set mobile viewport (< 768px)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`/cases/${caseId}/joint`);
    await page.waitForSelector("[data-testid='chat-window'], [class*='chat-window']", {
      timeout: 10_000,
    });

    const draftButton = page.getByRole("button", { name: /draft with coach/i });
    await draftButton.click();

    const panel = page.getByRole("dialog", { name: "Draft Coach" });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // On mobile, panel should be full-screen (full width and height)
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(375);
    expect(box!.height).toBe(667);
  });
});

// AC: Header: Sparkles icon, 'Draft Coach' title, Lock icon, close button
test.describe("Draft Coach Panel — header elements", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      category: "workplace",
      status: "JOINT_ACTIVE",
    });
    caseId = result.caseId;
    await transitionCaseStatus(caseId, "JOINT_ACTIVE");
  });

  test("header contains Sparkles icon, title, Lock icon, and close button", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/cases/${caseId}/joint`);
    await page.waitForSelector("[data-testid='chat-window'], [class*='chat-window']", {
      timeout: 10_000,
    });

    const draftButton = page.getByRole("button", { name: /draft with coach/i });
    await draftButton.click();

    const panel = page.getByRole("dialog", { name: "Draft Coach" });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Title text
    await expect(panel.getByText("Draft Coach")).toBeVisible();

    // Close button
    const closeButton = panel.getByRole("button", { name: /close/i });
    await expect(closeButton).toBeVisible();

    // Lock icon (check for aria-label or title on the lock element)
    const lockIcon = panel.locator("[aria-label*='private'], [aria-label*='lock'], [title*=\"can't see\"]");
    await expect(lockIcon.first()).toBeVisible();
  });
});

// AC: Private banner directly under header
test.describe("Draft Coach Panel — privacy banner", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      category: "workplace",
      status: "JOINT_ACTIVE",
    });
    caseId = result.caseId;
    await transitionCaseStatus(caseId, "JOINT_ACTIVE");
  });

  test("displays privacy banner with other party name", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/cases/${caseId}/joint`);
    await page.waitForSelector("[data-testid='chat-window'], [class*='chat-window']", {
      timeout: 10_000,
    });

    const draftButton = page.getByRole("button", { name: /draft with coach/i });
    await draftButton.click();

    const panel = page.getByRole("dialog", { name: "Draft Coach" });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Banner should contain "This is private to you" and the other party's name
    const banner = panel.getByText(/this is private to you/i);
    await expect(banner).toBeVisible();

    // Should also mention that the other party can't see this
    const bannerText = await banner.textContent();
    expect(bannerText).toContain("can't see what you're discussing here");
  });
});

// AC: User can type messages to Draft Coach and iterate
test.describe("Draft Coach Panel — coaching conversation", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      category: "workplace",
      status: "JOINT_ACTIVE",
    });
    caseId = result.caseId;
    await transitionCaseStatus(caseId, "JOINT_ACTIVE");
  });

  test("user can type a message and receive AI coaching response", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/cases/${caseId}/joint`);
    await page.waitForSelector("[data-testid='chat-window'], [class*='chat-window']", {
      timeout: 10_000,
    });

    const draftButton = page.getByRole("button", { name: /draft with coach/i });
    await draftButton.click();

    const panel = page.getByRole("dialog", { name: "Draft Coach" });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Type a message in the coaching textarea
    const textarea = panel.getByRole("textbox");
    await textarea.fill("I want to tell them I feel unheard in meetings");

    // Submit the message
    const sendButton = panel.getByRole("button", { name: /send/i });
    await sendButton.click();

    // User message should appear in the chat
    await expect(
      panel.getByText("I want to tell them I feel unheard in meetings"),
    ).toBeVisible({ timeout: 5_000 });

    // AI response should appear (may take a moment due to AI generation)
    // We look for any new AI message that wasn't there before
    const aiMessages = panel.locator("[class*='coach'], [class*='ai-message']");
    await expect(aiMessages.last()).toBeVisible({ timeout: 15_000 });
  });
});

// AC: 'Draft it for me' button at bottom triggers readiness signal
test.describe("Draft Coach Panel — Draft it for me", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      category: "workplace",
      status: "JOINT_ACTIVE",
    });
    caseId = result.caseId;
    await transitionCaseStatus(caseId, "JOINT_ACTIVE");
  });

  test("clicking 'Draft it for me' triggers draft generation and shows DraftReadyCard", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/cases/${caseId}/joint`);
    await page.waitForSelector("[data-testid='chat-window'], [class*='chat-window']", {
      timeout: 10_000,
    });

    const draftButton = page.getByRole("button", { name: /draft with coach/i });
    await draftButton.click();

    const panel = page.getByRole("dialog", { name: "Draft Coach" });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Click "Draft it for me" button
    const draftItButton = panel.getByRole("button", { name: /draft it for me/i });
    await draftItButton.click();

    // Wait for DraftReadyCard to appear (AI generates the draft)
    const draftReadyCard = panel.locator(".cc-draft-ready");
    await expect(draftReadyCard).toBeVisible({ timeout: 30_000 });

    // Should show all 4 action buttons
    await expect(panel.getByRole("button", { name: /send this message/i })).toBeVisible();
    await expect(panel.getByRole("button", { name: /edit before sending/i })).toBeVisible();
    await expect(panel.getByRole("button", { name: /keep refining with coach/i })).toBeVisible();
    await expect(panel.getByRole("button", { name: /discard/i })).toBeVisible();
  });
});

// AC: 'Send this message' calls draftCoach/sendFinalDraft which posts to joint chat
// — this is the ONLY way the draft reaches joint chat (THE core send-gate test)
test.describe("Draft Coach Panel — Send this message (send-gate)", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      category: "workplace",
      status: "JOINT_ACTIVE",
    });
    caseId = result.caseId;
    await transitionCaseStatus(caseId, "JOINT_ACTIVE");
  });

  test("'Send this message' posts draft to joint chat and closes panel", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/cases/${caseId}/joint`);
    await page.waitForSelector("[data-testid='chat-window'], [class*='chat-window']", {
      timeout: 10_000,
    });

    // Open Draft Coach panel
    const openButton = page.getByRole("button", { name: /draft with coach/i });
    await openButton.click();

    const panel = page.getByRole("dialog", { name: "Draft Coach" });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Trigger draft generation
    const draftItButton = panel.getByRole("button", { name: /draft it for me/i });
    await draftItButton.click();

    // Wait for DraftReadyCard
    const draftReadyCard = panel.locator(".cc-draft-ready");
    await expect(draftReadyCard).toBeVisible({ timeout: 30_000 });

    // Capture the draft text before sending
    const draftText = await draftReadyCard.textContent();

    // Click "Send this message"
    const sendButton = panel.getByRole("button", { name: /send this message/i });
    await sendButton.click();

    // Panel should close
    await expect(panel).not.toBeVisible({ timeout: 5_000 });

    // The draft message should now appear in the joint chat
    // (look in the main chat window, not the panel)
    const jointChat = page.locator("[data-testid='chat-window'], [class*='chat-window']").first();
    // The draft text (trimmed of button labels) should be present in joint chat
    expect(draftText).not.toBeNull();
    // At least part of the draft should show up in the joint chat
    await expect(jointChat).toContainText(draftText!.substring(0, 20), {
      timeout: 10_000,
    });
  });
});

// AC: 'Edit before sending' drops draft into joint chat input and closes panel
test.describe("Draft Coach Panel — Edit before sending", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      category: "workplace",
      status: "JOINT_ACTIVE",
    });
    caseId = result.caseId;
    await transitionCaseStatus(caseId, "JOINT_ACTIVE");
  });

  test("'Edit before sending' populates joint chat input and closes panel", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/cases/${caseId}/joint`);
    await page.waitForSelector("[data-testid='chat-window'], [class*='chat-window']", {
      timeout: 10_000,
    });

    // Open Draft Coach
    const openButton = page.getByRole("button", { name: /draft with coach/i });
    await openButton.click();

    const panel = page.getByRole("dialog", { name: "Draft Coach" });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Generate a draft
    const draftItButton = panel.getByRole("button", { name: /draft it for me/i });
    await draftItButton.click();

    const draftReadyCard = panel.locator(".cc-draft-ready");
    await expect(draftReadyCard).toBeVisible({ timeout: 30_000 });

    // Click "Edit before sending"
    const editButton = panel.getByRole("button", { name: /edit before sending/i });
    await editButton.click();

    // Panel should close
    await expect(panel).not.toBeVisible({ timeout: 5_000 });

    // The joint chat input textarea should contain the draft text
    const jointChatInput = page.getByRole("textbox");
    const inputValue = await jointChatInput.inputValue();
    expect(inputValue.length).toBeGreaterThan(0);
  });
});

// AC: 'Keep refining with Coach' continues the coaching conversation
test.describe("Draft Coach Panel — Keep refining", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      category: "workplace",
      status: "JOINT_ACTIVE",
    });
    caseId = result.caseId;
    await transitionCaseStatus(caseId, "JOINT_ACTIVE");
  });

  test("'Keep refining with Coach' keeps panel open and allows continued conversation", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/cases/${caseId}/joint`);
    await page.waitForSelector("[data-testid='chat-window'], [class*='chat-window']", {
      timeout: 10_000,
    });

    const openButton = page.getByRole("button", { name: /draft with coach/i });
    await openButton.click();

    const panel = page.getByRole("dialog", { name: "Draft Coach" });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Generate a draft
    const draftItButton = panel.getByRole("button", { name: /draft it for me/i });
    await draftItButton.click();

    const draftReadyCard = panel.locator(".cc-draft-ready");
    await expect(draftReadyCard).toBeVisible({ timeout: 30_000 });

    // Click "Keep refining with Coach"
    const refineButton = panel.getByRole("button", { name: /keep refining with coach/i });
    await refineButton.click();

    // Panel should remain open
    await expect(panel).toBeVisible();

    // DraftReadyCard should disappear (back to conversation mode)
    await expect(draftReadyCard).not.toBeVisible({ timeout: 5_000 });

    // Textarea should be available for continued conversation
    const textarea = panel.getByRole("textbox");
    await expect(textarea).toBeVisible();
    await expect(textarea).toBeFocused();
  });
});

// AC: 'Discard' calls draftCoach/discardSession and closes panel
test.describe("Draft Coach Panel — Discard", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      category: "workplace",
      status: "JOINT_ACTIVE",
    });
    caseId = result.caseId;
    await transitionCaseStatus(caseId, "JOINT_ACTIVE");
  });

  test("'Discard' closes panel and does not post any message to joint chat", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/cases/${caseId}/joint`);
    await page.waitForSelector("[data-testid='chat-window'], [class*='chat-window']", {
      timeout: 10_000,
    });

    // Count current joint chat messages before opening Draft Coach
    const jointChat = page.locator("[data-testid='chat-window'], [class*='chat-window']").first();
    const messageCountBefore = await jointChat.locator("[class*='bubble']").count();

    // Open Draft Coach
    const openButton = page.getByRole("button", { name: /draft with coach/i });
    await openButton.click();

    const panel = page.getByRole("dialog", { name: "Draft Coach" });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Generate a draft
    const draftItButton = panel.getByRole("button", { name: /draft it for me/i });
    await draftItButton.click();

    const draftReadyCard = panel.locator(".cc-draft-ready");
    await expect(draftReadyCard).toBeVisible({ timeout: 30_000 });

    // Click "Discard"
    const discardButton = panel.getByRole("button", { name: /discard/i });
    await discardButton.click();

    // Panel should close
    await expect(panel).not.toBeVisible({ timeout: 5_000 });

    // No new message should have been posted to joint chat
    const messageCountAfter = await jointChat.locator("[class*='bubble']").count();
    expect(messageCountAfter).toBe(messageCountBefore);
  });
});

// AC: Focus moves to textarea on panel open per DesignDoc §7.2
test.describe("Draft Coach Panel — focus management", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      category: "workplace",
      status: "JOINT_ACTIVE",
    });
    caseId = result.caseId;
    await transitionCaseStatus(caseId, "JOINT_ACTIVE");
  });

  test("focuses textarea immediately when panel opens", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/cases/${caseId}/joint`);
    await page.waitForSelector("[data-testid='chat-window'], [class*='chat-window']", {
      timeout: 10_000,
    });

    const openButton = page.getByRole("button", { name: /draft with coach/i });
    await openButton.click();

    const panel = page.getByRole("dialog", { name: "Draft Coach" });
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // The textarea within the panel should have focus
    const textarea = panel.getByRole("textbox");
    await expect(textarea).toBeFocused({ timeout: 3_000 });
  });
});
