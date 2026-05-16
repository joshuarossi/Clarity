import { test, expect } from "./fixtures";
import { createTestCase, transitionCaseStatus } from "./helpers";

/**
 * WOR-131: ClosedCaseView — E2E tests
 *
 * AC: Other party's private coaching and synthesis are NEVER shown
 * AC: Case remains accessible from Dashboard closed section
 */

test.describe("AC: Privacy — other party's private coaching never shown", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      inviteeEmail: "testuserb@example.com",
      category: "workplace",
      status: "CLOSED_RESOLVED",
      privateCoachingMessages: {
        partyA: ["Alpha private coaching message"],
        partyB: ["Beta private coaching message"],
      },
      synthesisText: {
        partyA: "Alpha synthesis guidance text",
        partyB: "Beta synthesis guidance text",
      },
    });
    caseId = result.caseId;
    await transitionCaseStatus(caseId, "CLOSED_RESOLVED");
  });

  test("Party A sees only their own private coaching messages", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}/closed?tab=private`);

    // Wait for the page to load
    await pageA.waitForSelector("[data-testid='page-case-closed']", {
      timeout: 10_000,
    });

    // The private coaching tab should be active
    const tabPanel = pageA.getByTestId("tabpanel-private");
    await expect(tabPanel).toBeVisible();

    // Party A should see their own messages and NOT Party B's messages
    const pageContent = await tabPanel.textContent();
    expect(pageContent).toContain("Alpha private coaching message");
    expect(pageContent).not.toContain("Beta private coaching message");
  });

  test("Party B sees only their own private coaching messages", async ({
    pageB,
  }) => {
    await pageB.goto(`/cases/${caseId}/closed?tab=private`);

    await pageB.waitForSelector("[data-testid='page-case-closed']", {
      timeout: 10_000,
    });

    const tabPanel = pageB.getByTestId("tabpanel-private");
    await expect(tabPanel).toBeVisible();

    // Party B should see their own messages and NOT Party A's messages
    const pageContent = await tabPanel.textContent();
    expect(pageContent).toContain("Beta private coaching message");
    expect(pageContent).not.toContain("Alpha private coaching message");
  });

  test("Party A synthesis tab shows only their own guidance", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}/closed?tab=guidance`);

    await pageA.waitForSelector("[data-testid='page-case-closed']", {
      timeout: 10_000,
    });

    const tabPanel = pageA.getByTestId("tabpanel-guidance");
    await expect(tabPanel).toBeVisible();

    // Party A should see their synthesis and NOT Party B's
    const panelContent = await tabPanel.textContent();
    expect(panelContent).toContain("Alpha synthesis guidance text");
    expect(panelContent).not.toContain("Beta synthesis guidance text");
  });

  test("Party B synthesis tab shows only their own guidance", async ({
    pageB,
  }) => {
    await pageB.goto(`/cases/${caseId}/closed?tab=guidance`);

    await pageB.waitForSelector("[data-testid='page-case-closed']", {
      timeout: 10_000,
    });

    const tabPanel = pageB.getByTestId("tabpanel-guidance");
    await expect(tabPanel).toBeVisible();

    // Party B should see their synthesis and NOT Party A's
    const panelContent = await tabPanel.textContent();
    expect(panelContent).toContain("Beta synthesis guidance text");
    expect(panelContent).not.toContain("Alpha synthesis guidance text");
  });

  test("no UI element attempts to fetch or display other party data", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}/closed`);

    await pageA.waitForSelector("[data-testid='page-case-closed']", {
      timeout: 10_000,
    });

    // There should be no tab or link that references "Other Party" or generic
    // "Private Coaching" (without "My" prefix)
    const allButtons = await pageA.getByRole("tab").all();
    for (const button of allButtons) {
      const text = await button.textContent();
      // Tabs should be "My Private Coaching" and "My Guidance" — never
      // generic "Private Coaching" without "My"
      if (text?.includes("Private Coaching")) {
        expect(text).toContain("My");
      }
      if (text?.includes("Guidance")) {
        expect(text).toContain("My");
      }
    }
  });
});

test.describe("AC: Case remains accessible from Dashboard closed section", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      category: "workplace",
      status: "CLOSED_RESOLVED",
    });
    caseId = result.caseId;
    await transitionCaseStatus(caseId, "CLOSED_RESOLVED");
  });

  test("closed case appears in Dashboard closed section and navigates to closed view", async ({
    pageA,
  }) => {
    await pageA.goto("/dashboard");

    // Wait for dashboard to load
    await pageA.waitForSelector("text=Closed Cases, text=Closed", {
      timeout: 10_000,
    });

    // Verify the closed section is visible on the dashboard
    const closedSection = pageA.locator(
      "text=Closed Cases, text=Closed",
    ).first();
    await expect(closedSection).toBeVisible();

    // Click the case entry within the closed section to navigate
    const caseLink = pageA.locator(`a[href*="/cases/${caseId}/closed"]`).first();
    await expect(caseLink).toBeVisible({ timeout: 10_000 });
    await caseLink.click();

    // Verify navigation occurred to the closed case view
    await pageA.waitForSelector("[data-testid='page-case-closed']", {
      timeout: 10_000,
    });
    await expect(pageA).toHaveURL(new RegExp(`/cases/${caseId}/closed`));

    // Verify header and banner are visible
    await expect(pageA.getByTestId("closed-banner")).toBeVisible();
    await expect(pageA.getByTestId("closed-header-outcome")).toBeVisible();
  });
});

test.describe("AC: Header and closure summary (e2e confirmation)", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      category: "workplace",
      status: "CLOSED_RESOLVED",
    });
    caseId = result.caseId;
    await transitionCaseStatus(caseId, "CLOSED_RESOLVED");
  });

  test("displays Resolved outcome and closure summary for CLOSED_RESOLVED case", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}/closed`);

    await pageA.waitForSelector("[data-testid='page-case-closed']", {
      timeout: 10_000,
    });

    // Assert header shows "Resolved"
    const outcomeEl = pageA.getByTestId("closed-header-outcome");
    await expect(outcomeEl).toHaveText("Resolved");

    // Assert closure summary is visible
    const summaryEl = pageA.getByTestId("closed-closure-summary");
    await expect(summaryEl).toBeVisible();
  });
});

test.describe("AC: Tab navigation with URL persistence", () => {
  let caseId: string;

  test.beforeAll(async () => {
    const result = await createTestCase({
      initiatorEmail: "testusera@example.com",
      category: "workplace",
      status: "CLOSED_RESOLVED",
    });
    caseId = result.caseId;
    await transitionCaseStatus(caseId, "CLOSED_RESOLVED");
  });

  test("clicking My Private Coaching tab updates URL and survives reload", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}/closed`);

    await pageA.waitForSelector("[data-testid='page-case-closed']", {
      timeout: 10_000,
    });

    // Click the private coaching tab
    await pageA.getByTestId("tab-private").click();

    // Assert URL contains ?tab=private
    await expect(pageA).toHaveURL(/tab=private/);

    // Reload the page
    await pageA.reload();

    // Assert the tab is still active after reload
    await pageA.waitForSelector("[data-testid='page-case-closed']", {
      timeout: 10_000,
    });

    const privateTab = pageA.getByTestId("tab-private");
    await expect(privateTab).toHaveAttribute("aria-selected", "true");

    // Assert the private tab panel is visible
    await expect(pageA.getByTestId("tabpanel-private")).toBeVisible();
  });

  test("clicking My Guidance tab updates URL to ?tab=guidance", async ({
    pageA,
  }) => {
    await pageA.goto(`/cases/${caseId}/closed`);

    await pageA.waitForSelector("[data-testid='page-case-closed']", {
      timeout: 10_000,
    });

    await pageA.getByTestId("tab-guidance").click();

    await expect(pageA).toHaveURL(/tab=guidance/);

    await expect(pageA.getByTestId("tabpanel-guidance")).toBeVisible();
  });
});
