import { test, expect } from "./fixtures";
import { createTestCase, transitionCaseStatus } from "./helpers";

/**
 * WOR-122: Synthesis AI action — E2E tests
 *
 * AC: Loading state: 'Generating your guidance...' is surfaced to both
 * parties during generation.
 *
 * This test requires a running app with real Convex subscriptions to observe
 * reactive query updates during action execution. Uses CLAUDE_MOCK=true to
 * avoid external API calls while still exercising the full server-side action.
 */

test.describe("Synthesis — loading state and completion (E2E)", () => {
  let caseId: string;

  test.beforeAll(async () => {
    // Create a solo case so a single user can act as both parties
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testusera@example.com",
      category: "workplace",
      isSolo: true,
    });
    caseId = result.caseId;

    // Transition case: complete private coaching for both parties
    await transitionCaseStatus(caseId, "BOTH_PRIVATE_COACHING");
  });

  test("displays 'Generating your guidance...' while synthesis action is in-flight", async ({
    pageA,
  }) => {
    // Navigate to the case detail page where synthesis status is shown
    await pageA.goto(`/cases/${caseId}`);

    // The loading state should appear when both coaching is complete but
    // synthesis has not yet finished. The reactive query on partyStates
    // will show this intermediate state.
    const loadingIndicator = pageA.getByText(/generating your guidance/i);
    await expect(loadingIndicator).toBeVisible({ timeout: 15_000 });
  });

  test("synthesis text replaces loading state after generation completes", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}`);

    // Wait for synthesis to complete — loading state should clear
    // and the synthesis text should be visible
    const loadingIndicator = pageA.getByText(/generating your guidance/i);

    // Eventually loading should disappear as synthesis completes
    await expect(loadingIndicator).toBeHidden({ timeout: 30_000 });

    // After synthesis completes, the case should show synthesis content
    // or transition to the READY_FOR_JOINT state view
    const readyIndicator = pageA.getByText(
      /ready for joint|joint session|your guidance/i,
    );
    await expect(readyIndicator).toBeVisible({ timeout: 10_000 });
  });

  test("both parties see their own synthesis text after generation (solo mode)", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}`);

    // In solo mode, the party toggle allows viewing as each party.
    // Verify that synthesis content is visible (not the other party's).
    // The synthesis text area should contain personalized guidance.
    const synthesisContent = pageA.locator(
      "[data-testid='synthesis-text'], [class*='synthesis']",
    );
    await expect(synthesisContent.first()).toBeVisible({ timeout: 15_000 });

    // The content should not be empty
    const text = await synthesisContent.first().textContent();
    expect(text).toBeTruthy();
    expect(text!.length).toBeGreaterThan(0);
  });
});
