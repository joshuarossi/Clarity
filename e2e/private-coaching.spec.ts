import { test, expect } from "./fixtures";
import { createTestCase } from "./helpers";

// ── Full E2E private coaching flow ──────────────────────────────────────
// Covers: send message, receive streaming AI response, verify privacy
// banner, mark complete, verify read-only state, and verify privacy
// isolation between parties.

test.describe("Private coaching — full E2E flow", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      category: "workplace",
    });
    caseId = result.caseId;
  });

  test("initiator sees privacy banner on private coaching page", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}/private`);

    // Privacy banner must be visible with other party reference
    const banner = pageA.locator("[class*='cc-banner-privacy']");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText(/will never see any of it/i);
  });

  test("initiator can send a message and see streaming AI response", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}/private`);

    // Wait for the message input to be ready
    const textarea = pageA.getByRole("textbox", { name: /message input/i });
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // Type and send a message
    await textarea.fill("I want to talk about our team communication issues.");
    await textarea.press("Enter");

    // Verify user message appears in the chat
    await expect(
      pageA.getByText("I want to talk about our team communication issues."),
    ).toBeVisible({ timeout: 5_000 });

    // Wait for AI response to start streaming (STREAMING status bubble)
    const streamingBubble = pageA.locator("[data-status='STREAMING']");
    await expect(streamingBubble).toBeVisible({ timeout: 15_000 });

    // Wait for streaming to complete
    const completedBubble = pageA.locator(
      "[class*='cc-bubble-coach'][data-status='COMPLETE']",
    );
    await expect(completedBubble).toBeVisible({ timeout: 30_000 });

    // Copy button should now be visible on the completed AI message
    const copyButton = completedBubble.getByRole("button", {
      name: /copy/i,
    });
    await expect(copyButton).toBeVisible();
  });

  test("initiator can mark private coaching complete via confirmation dialog", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}/private`);

    // Wait for page to load
    await expect(
      pageA.getByText(/mark private coaching complete/i),
    ).toBeVisible({ timeout: 10_000 });

    // Click the mark-complete footer CTA
    await pageA.getByText(/mark private coaching complete/i).click();

    // Confirmation dialog should appear with message count and party name
    const dialog = pageA.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toContainText(/you.?ve had/i);
    await expect(dialog).toContainText(/ready to move on/i);

    // Verify both dialog buttons exist
    await expect(
      dialog.getByRole("button", { name: /continue coaching/i }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /mark complete/i }),
    ).toBeVisible();

    // Confirm mark complete
    await dialog.getByRole("button", { name: /mark complete/i }).click();

    // Page should transition to read-only state
    await expect(pageA.getByText(/completed private coaching/i)).toBeVisible({
      timeout: 10_000,
    });

    // Message input should no longer be visible
    await expect(
      pageA.getByRole("textbox", { name: /message input/i }),
    ).not.toBeVisible();

    // Mark-complete footer should no longer be visible
    await expect(
      pageA.getByText(/mark private coaching complete/i),
    ).not.toBeVisible();
  });

  test("privacy isolation — other party cannot see initiator messages", async ({
    pageB,
  }) => {
    // Navigate party B to the same case's private coaching page
    await pageB.goto(`/cases/${caseId}/private`);

    // Wait for the page to load
    const textarea = pageB.getByRole("textbox", { name: /message input/i });
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // Party B should NOT see the initiator's message
    await expect(
      pageB.getByText("I want to talk about our team communication issues."),
    ).not.toBeVisible();

    // Party B should see an empty chat or their own messages only
    // The privacy banner should reference the initiator
    const banner = pageB.locator("[class*='cc-banner-privacy']");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/will never see any of it/i);
  });
});
