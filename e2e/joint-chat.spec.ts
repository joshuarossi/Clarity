import { test, expect } from "./fixtures";
import { createTestCase, transitionCaseStatus } from "./helpers";

/**
 * WOR-126: JointChatView — E2E tests
 *
 * AC: Message propagation target < 500ms (Convex reactive queries)
 *
 * This test requires two browser contexts subscribed to the same
 * JOINT_ACTIVE case to verify that a message sent from one party
 * appears in the other party's view within 500ms via Convex reactive
 * subscriptions.
 */

test.describe("Joint Chat — real-time message propagation (E2E)", () => {
  let caseId: string;

  test.beforeAll(async () => {
    // Create a case with two users and transition it to JOINT_ACTIVE
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      category: "workplace",
      status: "JOINT_ACTIVE",
    });
    caseId = result.caseId;

    await transitionCaseStatus(caseId, "JOINT_ACTIVE");
  });

  test("message sent by one party appears in the other party's view within 500ms", async ({
    pageA,
    pageB,
  }) => {
    // Both parties navigate to the joint chat
    await pageA.goto(`/cases/${caseId}/joint`);
    await pageB.goto(`/cases/${caseId}/joint`);

    // Wait for both pages to load the chat view
    await pageA.waitForSelector(
      "[data-testid='chat-window'], [class*='chat-window']",
      {
        timeout: 10_000,
      },
    );
    await pageB.waitForSelector(
      "[data-testid='chat-window'], [class*='chat-window']",
      {
        timeout: 10_000,
      },
    );

    // Party A types and sends a message
    const messageContent = `Test propagation message ${Date.now()}`;
    const textareaA = pageA.getByRole("textbox");
    await textareaA.fill(messageContent);

    const sendButtonA = pageA.getByRole("button", { name: /send/i });
    await sendButtonA.click();

    // Measure propagation time: the message should appear on Party B's
    // screen within 500ms of the send action
    const startTime = Date.now();

    const messageBLocator = pageB.getByText(messageContent);
    await expect(messageBLocator).toBeVisible({ timeout: 500 });

    const propagationTime = Date.now() - startTime;
    expect(propagationTime).toBeLessThan(500);
  });

  test("Coach message appears reactively on both parties' screens", async ({
    pageA,
    pageB,
  }) => {
    // Both parties navigate to the joint chat
    await pageA.goto(`/cases/${caseId}/joint`);
    await pageB.goto(`/cases/${caseId}/joint`);

    // Wait for chat to load
    await pageA.waitForSelector(
      "[data-testid='chat-window'], [class*='chat-window']",
      {
        timeout: 10_000,
      },
    );
    await pageB.waitForSelector(
      "[data-testid='chat-window'], [class*='chat-window']",
      {
        timeout: 10_000,
      },
    );

    // Send a message from Party A to trigger Coach response
    const textareaA = pageA.getByRole("textbox");
    await textareaA.fill("I want to discuss this topic further.");
    await pageA.getByRole("button", { name: /send/i }).click();

    // Coach response should eventually appear on both screens
    // The Coach processes the message and responds (may show "Coach is thinking..." first)
    const coachIndicator = pageA.getByText(/Coach is thinking|⟡/);
    await expect(coachIndicator).toBeVisible({ timeout: 15_000 });

    // Eventually the Coach message completes and both parties see it
    const coachBubbleA = pageA.locator("[class*='cc-bubble-coach']");
    await expect(coachBubbleA.last()).toBeVisible({ timeout: 30_000 });

    const coachBubbleB = pageB.locator("[class*='cc-bubble-coach']");
    await expect(coachBubbleB.last()).toBeVisible({ timeout: 30_000 });
  });
});
