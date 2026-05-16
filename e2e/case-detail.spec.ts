import { test, expect } from "./fixtures";
import { createTestUser, createTestCase, loginAs, transitionCaseStatus } from "./helpers";

// ── AC: Route /cases/:caseId reads case status and renders the correct subview ──

test.describe("AC: Correct subview for each case status", () => {
  test("renders private coaching content for BOTH_PRIVATE_COACHING", async ({
    pageA,
  }) => {
    const { caseId } = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      status: "BOTH_PRIVATE_COACHING",
    });

    await pageA.goto(`/cases/${caseId}`);

    // Should redirect to /private or show private coaching content
    await expect(pageA).toHaveURL(
      new RegExp(`/cases/${caseId}/private`),
    );
  });

  test("renders ReadyForJointView for READY_FOR_JOINT status", async ({
    pageA,
  }) => {
    const { caseId } = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      status: "READY_FOR_JOINT",
    });

    await pageA.goto(`/cases/${caseId}`);

    await expect(
      pageA.locator("[data-testid='subview-ready-for-joint']"),
    ).toBeVisible();
  });

  test("renders JointChatView for JOINT_ACTIVE status", async ({
    pageA,
  }) => {
    const { caseId } = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      status: "JOINT_ACTIVE",
    });

    await pageA.goto(`/cases/${caseId}`);

    await expect(
      pageA.locator("[data-testid='subview-joint-chat']"),
    ).toBeVisible();
  });

  test("renders ClosedCaseView for CLOSED_RESOLVED status", async ({
    pageA,
  }) => {
    const { caseId } = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      status: "CLOSED_RESOLVED",
    });

    await pageA.goto(`/cases/${caseId}`);

    await expect(
      pageA.locator("[data-testid='subview-closed']"),
    ).toBeVisible();
  });
});

// ── AC: Subroutes redirect if case status doesn't match ─────────────────

test.describe("AC: Subroute mismatch triggers redirect", () => {
  test("navigating to /joint when case is in BOTH_PRIVATE_COACHING shows private coaching", async ({
    pageA,
  }) => {
    const { caseId } = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      status: "BOTH_PRIVATE_COACHING",
    });

    // Navigate directly to the joint subroute
    await pageA.goto(`/cases/${caseId}/joint`);

    // Should redirect or show private coaching content since case is not in joint phase
    await pageA.waitForURL(
      new RegExp(`/cases/${caseId}/private`),
      { timeout: 5_000 },
    );
  });

  test("navigating to /closed when case is in JOINT_ACTIVE redirects to /joint", async ({
    pageA,
  }) => {
    const { caseId } = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      status: "JOINT_ACTIVE",
    });

    await pageA.goto(`/cases/${caseId}/closed`);

    // Should redirect since case is not closed
    await pageA.waitForURL(
      new RegExp(`/cases/${caseId}/joint`),
      { timeout: 5_000 },
    );
  });
});

// ── AC: PhaseHeader shows correct phase name ────────────────────────────

test.describe("AC: PhaseHeader shows correct phase name for current status", () => {
  test("shows 'Private Coaching' phase for private coaching status", async ({
    pageA,
  }) => {
    const { caseId } = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      status: "BOTH_PRIVATE_COACHING",
    });

    await pageA.goto(`/cases/${caseId}`);

    await expect(
      pageA.getByText("Private Coaching"),
    ).toBeVisible();
  });

  test("shows 'Joint Discussion' phase for JOINT_ACTIVE status", async ({
    pageA,
  }) => {
    const { caseId } = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      status: "JOINT_ACTIVE",
    });

    await pageA.goto(`/cases/${caseId}`);

    await expect(
      pageA.getByText("Joint Discussion"),
    ).toBeVisible();
  });

  test("shows 'Closed' phase for CLOSED_RESOLVED status", async ({
    pageA,
  }) => {
    const { caseId } = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      status: "CLOSED_RESOLVED",
    });

    await pageA.goto(`/cases/${caseId}`);

    await expect(
      pageA.getByText("Closed"),
    ).toBeVisible();
  });
});

// ── AC: Non-party redirect to /dashboard with error toast ───────────────

test.describe("AC: Non-party user redirects to /dashboard with error toast", () => {
  test("redirects non-party user to /dashboard with error message", async ({
    browser,
  }) => {
    // Create a case between user A and user B
    const { caseId } = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      status: "BOTH_PRIVATE_COACHING",
    });

    // Log in as user C (not a party to the case)
    const { email: userCEmail } = await createTestUser({
      email: "testuserc@example.com",
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, userCEmail);

    // Navigate to the case as non-party user
    await page.goto(`/cases/${caseId}`);

    // Should redirect to /dashboard
    await page.waitForURL("**/dashboard", { timeout: 5_000 });

    // Should show an error message/toast
    await expect(
      page.getByText(/not a party|access denied|forbidden/i),
    ).toBeVisible();

    await context.close();
  });
});

// ── AC: Reactively updates when case transitions status ─────────────────

test.describe("AC: Reactive updates on case status transition", () => {
  test("view updates when case transitions from private coaching to ready for joint", async ({
    pageA,
  }) => {
    const { caseId } = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      status: "BOTH_PRIVATE_COACHING",
    });

    // Navigate to case in private coaching phase
    await pageA.goto(`/cases/${caseId}`);

    // Verify initial state shows private coaching content
    await expect(pageA).toHaveURL(
      new RegExp(`/cases/${caseId}/private`),
    );

    // Trigger a status transition mutation server-side
    await transitionCaseStatus(caseId, "READY_FOR_JOINT");

    // The reactive subscription should update the view automatically
    await expect(
      pageA.locator("[data-testid='subview-ready-for-joint']"),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ── AC: Invitee form — shown when invitee hasn't completed perspective ───

test.describe("AC: Invitee form when invitee has not completed perspective form", () => {
  test("shows perspective form for invitee who has not submitted", async ({
    pageB,
  }) => {
    const { caseId } = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      status: "DRAFT_PRIVATE_COACHING",
    });

    // pageB is authenticated as testuserb@example.com (the invitee)
    await pageB.goto(`/cases/${caseId}`);

    // Should show the invitee perspective form fields
    await expect(
      pageB.getByLabel(/main topic/i),
    ).toBeVisible();
    await expect(
      pageB.getByLabel(/description/i),
    ).toBeVisible();
    await expect(
      pageB.getByLabel(/desired outcome/i),
    ).toBeVisible();
  });

  test("submitting the form transitions to PrivateCoachingView", async ({
    pageB,
  }) => {
    const { caseId } = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      status: "DRAFT_PRIVATE_COACHING",
    });

    // pageB is authenticated as testuserb@example.com (the invitee)
    await pageB.goto(`/cases/${caseId}`);

    // Fill in the form
    await pageB.getByLabel(/main topic/i).fill("Communication");
    await pageB
      .getByLabel(/description/i)
      .fill("We have trouble communicating");
    await pageB
      .getByLabel(/desired outcome/i)
      .fill("Better understanding");

    // Submit
    await pageB.getByRole("button", { name: /submit/i }).click();

    // After submission, the invitee form should disappear and private coaching view should show
    await expect(
      pageB.getByLabel(/main topic/i),
    ).not.toBeVisible({ timeout: 5_000 });

    // Should now show private coaching content or redirect to /private
    await expect(pageB).toHaveURL(
      new RegExp(`/cases/${caseId}/private`),
    );
  });
});
