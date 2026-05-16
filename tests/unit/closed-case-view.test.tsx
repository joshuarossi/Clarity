// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { ClosedCaseView } from "../../src/routes/ClosedCaseView";

// ── Hoisted mocks ───────────────────────────────────────────────────────

const {
  mockUseQuery,
  mockUseParams,
  mockSearchParams,
  mockSetSearchParams,
  mockNavigateComponent,
} = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockUseParams: vi.fn((): { caseId: string | undefined } => ({
    caseId: "case-closed-123",
  })),
  mockSearchParams: new URLSearchParams("tab=joint"),
  mockSetSearchParams: vi.fn(),
  mockNavigateComponent: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useParams: mockUseParams,
    useSearchParams: () => [mockSearchParams, mockSetSearchParams],
    Navigate: ({ to }: { to: string }) => {
      mockNavigateComponent(to);
      return <div data-testid="navigate-redirect" data-to={to} />;
    },
  };
});

import { MemoryRouter } from "react-router-dom";

// ── Fixture types ───────────────────────────────────────────────────────

interface CaseDoc {
  _id: string;
  status: string;
  category: string;
  closedAt: number;
  closureSummary: string | null;
  initiatorUserId: string;
  isSolo: boolean;
}

interface JointMessage {
  _id: string;
  authorType: "USER" | "COACH";
  authorUserId: string;
  content: string;
  status: string;
  isIntervention: boolean;
  createdAt: number;
}

interface PrivateMessage {
  _id: string;
  role: "USER" | "AI";
  content: string;
  status: string;
  createdAt: number;
}

interface Synthesis {
  text: string;
}

// ── Fixture data ────────────────────────────────────────────────────────

const CASE_ID = "case-closed-123";
const USER_ID = "user-alex";
const CLOSED_AT = 1_700_000_000_000; // 2023-11-14

const RESOLVED_CASE: CaseDoc = {
  _id: CASE_ID,
  status: "CLOSED_RESOLVED",
  category: "Workplace",
  closedAt: CLOSED_AT,
  closureSummary: "Both parties agreed to weekly check-ins and a shared task tracker.",
  initiatorUserId: USER_ID,
  isSolo: false,
};

const UNRESOLVED_CASE: CaseDoc = {
  _id: CASE_ID,
  status: "CLOSED_UNRESOLVED",
  category: "Family",
  closedAt: CLOSED_AT,
  closureSummary: null,
  initiatorUserId: USER_ID,
  isSolo: false,
};

const ABANDONED_CASE: CaseDoc = {
  _id: CASE_ID,
  status: "CLOSED_ABANDONED",
  category: "Roommate",
  closedAt: CLOSED_AT,
  closureSummary: null,
  initiatorUserId: USER_ID,
  isSolo: false,
};

const JOINT_MESSAGES: JointMessage[] = [
  {
    _id: "msg-1",
    authorType: "COACH",
    authorUserId: "coach",
    content: "Welcome to this joint session.",
    status: "SENT",
    isIntervention: false,
    createdAt: CLOSED_AT - 3600_000,
  },
  {
    _id: "msg-2",
    authorType: "USER",
    authorUserId: USER_ID,
    content: "I think we should discuss the project timeline.",
    status: "SENT",
    isIntervention: false,
    createdAt: CLOSED_AT - 3000_000,
  },
];

const PRIVATE_MESSAGES: PrivateMessage[] = [
  {
    _id: "pm-1",
    role: "USER",
    content: "I feel frustrated about the lack of communication.",
    status: "SENT",
    createdAt: CLOSED_AT - 7200_000,
  },
  {
    _id: "pm-2",
    role: "AI",
    content: "That sounds challenging. Let's explore what good communication looks like for you.",
    status: "SENT",
    createdAt: CLOSED_AT - 7100_000,
  },
];

const MY_SYNTHESIS: Synthesis = {
  text: "Focus on expressing needs clearly and asking clarifying questions before reacting.",
};

// ── Mock query routing ──────────────────────────────────────────────────

const FN_NAME = Symbol.for("functionName");

let caseFixture: CaseDoc | undefined;
let jointMessagesFixture: JointMessage[] | undefined;
let privateMessagesFixture: PrivateMessage[] | undefined;
let synthesisFixture: Synthesis | null | undefined;
let partyStatesFixture: { self: { role: string } } | undefined;

function setupDefaultMocks() {
  caseFixture = RESOLVED_CASE;
  jointMessagesFixture = JOINT_MESSAGES;
  privateMessagesFixture = PRIVATE_MESSAGES;
  synthesisFixture = MY_SYNTHESIS;
  partyStatesFixture = { self: { role: "INITIATOR" } };

  mockUseQuery.mockImplementation(
    (queryRef: Record<string | symbol, unknown>) => {
      const name: string = (queryRef?.[FN_NAME] as string) ?? "";
      if (name.includes("cases:get") || name.includes("cases.get")) {
        return caseFixture;
      }
      if (
        name.includes("cases:partyStates") ||
        name.includes("cases.partyStates")
      ) {
        return partyStatesFixture;
      }
      if (
        name.includes("jointChat:messages") ||
        name.includes("jointChat.messages")
      ) {
        return jointMessagesFixture;
      }
      if (
        name.includes("privateCoaching:myMessages") ||
        name.includes("privateCoaching.myMessages")
      ) {
        return privateMessagesFixture;
      }
      if (
        name.includes("jointChat:mySynthesis") ||
        name.includes("jointChat.mySynthesis")
      ) {
        return synthesisFixture;
      }
      return undefined;
    },
  );
}

// ── Setup / Teardown ────────────────────────────────────────────────────

beforeEach(() => {
  mockUseQuery.mockReset();
  mockSetSearchParams.mockReset();
  mockNavigateComponent.mockReset();
  mockUseParams.mockReturnValue({ caseId: CASE_ID });

  // Reset searchParams to default tab
  mockSearchParams.delete("tab");
  mockSearchParams.set("tab", "joint");

  setupDefaultMocks();
});

afterEach(() => {
  cleanup();
});

// ── Helpers ─────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/cases/${CASE_ID}/closed`]}>
      <ClosedCaseView />
    </MemoryRouter>,
  );
}

// ── AC: Header displays case name, category, closure date, and outcome ──

describe("AC: Header displays case name, category, closure date, and outcome", () => {
  it("renders category as case name in header", () => {
    renderPage();
    expect(screen.getByText("Workplace")).toBeTruthy();
  });

  it("renders formatted closure date", () => {
    renderPage();
    const dateEl = screen.getByTestId("closed-header-closure-date");
    expect(dateEl.textContent).toBeTruthy();
    // The date should be a formatted representation of CLOSED_AT
    expect(dateEl.textContent!.length).toBeGreaterThan(0);
  });

  it("renders 'Resolved' outcome for CLOSED_RESOLVED status", () => {
    caseFixture = RESOLVED_CASE;
    renderPage();
    const outcomeEl = screen.getByTestId("closed-header-outcome");
    expect(outcomeEl.textContent).toBe("Resolved");
  });

  it("renders 'Not Resolved' outcome for CLOSED_UNRESOLVED status", () => {
    caseFixture = UNRESOLVED_CASE;
    renderPage();
    const outcomeEl = screen.getByTestId("closed-header-outcome");
    expect(outcomeEl.textContent).toBe("Not Resolved");
  });

  it("renders 'Abandoned' outcome for CLOSED_ABANDONED status", () => {
    caseFixture = ABANDONED_CASE;
    renderPage();
    const outcomeEl = screen.getByTestId("closed-header-outcome");
    expect(outcomeEl.textContent).toBe("Abandoned");
  });
});

// ── AC: If Resolved: closure summary is prominently displayed ───────────

describe("AC: Closure summary displayed when Resolved", () => {
  it("renders closure summary when status is CLOSED_RESOLVED", () => {
    caseFixture = RESOLVED_CASE;
    renderPage();
    const summaryEl = screen.getByTestId("closed-closure-summary");
    expect(summaryEl.textContent).toContain(
      "Both parties agreed to weekly check-ins",
    );
  });

  it("does NOT render closure summary when status is CLOSED_UNRESOLVED", () => {
    caseFixture = UNRESOLVED_CASE;
    renderPage();
    expect(screen.queryByTestId("closed-closure-summary")).toBeNull();
  });

  it("does NOT render closure summary when status is CLOSED_ABANDONED", () => {
    caseFixture = ABANDONED_CASE;
    renderPage();
    expect(screen.queryByTestId("closed-closure-summary")).toBeNull();
  });
});

// ── AC: Full joint chat transcript is rendered read-only (no input bar) ─

describe("AC: Read-only joint chat transcript", () => {
  it("renders joint chat messages in the default tab", () => {
    renderPage();
    expect(
      screen.getByText("Welcome to this joint session."),
    ).toBeTruthy();
    expect(
      screen.getByText("I think we should discuss the project timeline."),
    ).toBeTruthy();
  });

  it("does NOT render a textarea input", () => {
    renderPage();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does NOT render a send button", () => {
    renderPage();
    const sendButtons = screen.queryAllByRole("button").filter((btn) =>
      /send/i.test(btn.textContent ?? ""),
    );
    expect(sendButtons.length).toBe(0);
  });

  it("does NOT render a message-input testid element", () => {
    renderPage();
    expect(screen.queryByTestId("message-input")).toBeNull();
  });

  it("does NOT render a Draft Coach trigger button", () => {
    renderPage();
    const draftCoachButtons = screen.queryAllByRole("button").filter((btn) =>
      /draft.*coach/i.test(btn.textContent ?? ""),
    );
    expect(draftCoachButtons.length).toBe(0);
  });
});

// ── AC: Nav tabs: "Joint Chat" | "My Private Coaching" | "My Guidance" ──

describe("AC: Nav tabs work correctly", () => {
  it("renders three tab buttons with correct labels", () => {
    renderPage();
    expect(screen.getByTestId("tab-joint")).toBeTruthy();
    expect(screen.getByTestId("tab-private")).toBeTruthy();
    expect(screen.getByTestId("tab-guidance")).toBeTruthy();
  });

  it("tab buttons have correct text content", () => {
    renderPage();
    expect(screen.getByTestId("tab-joint").textContent).toBe("Joint Chat");
    expect(screen.getByTestId("tab-private").textContent).toBe(
      "My Private Coaching",
    );
    expect(screen.getByTestId("tab-guidance").textContent).toBe("My Guidance");
  });

  it("tab bar uses role=tablist", () => {
    renderPage();
    expect(screen.getByRole("tablist")).toBeTruthy();
  });

  it("tab buttons use role=tab", () => {
    renderPage();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBe(3);
  });

  it("clicking 'My Private Coaching' tab calls setSearchParams with private", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("tab-private"));
    expect(mockSetSearchParams).toHaveBeenCalled();
    const firstArg = mockSetSearchParams.mock.calls[0][0];
    // The component may pass a function or an object/URLSearchParams
    if (typeof firstArg === "function") {
      const result = firstArg(new URLSearchParams("tab=joint"));
      expect(new URLSearchParams(result).get("tab")).toBe("private");
    } else {
      expect(new URLSearchParams(firstArg).get("tab")).toBe("private");
    }
  });

  it("clicking 'My Guidance' tab calls setSearchParams with guidance", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("tab-guidance"));
    expect(mockSetSearchParams).toHaveBeenCalled();
    const firstArg = mockSetSearchParams.mock.calls[0][0];
    if (typeof firstArg === "function") {
      const result = firstArg(new URLSearchParams("tab=joint"));
      expect(new URLSearchParams(result).get("tab")).toBe("guidance");
    } else {
      expect(new URLSearchParams(firstArg).get("tab")).toBe("guidance");
    }
  });

  it("renders tabpanel for joint chat by default", () => {
    renderPage();
    expect(screen.getByTestId("tabpanel-joint")).toBeTruthy();
  });

  it("renders private coaching messages when private tab is active", () => {
    mockSearchParams.delete("tab");
    mockSearchParams.set("tab", "private");
    renderPage();
    expect(screen.getByTestId("tabpanel-private")).toBeTruthy();
    expect(
      screen.getByText(
        "I feel frustrated about the lack of communication.",
      ),
    ).toBeTruthy();
  });

  it("renders synthesis text when guidance tab is active", () => {
    mockSearchParams.delete("tab");
    mockSearchParams.set("tab", "guidance");
    renderPage();
    expect(screen.getByTestId("tabpanel-guidance")).toBeTruthy();
    expect(
      screen.getByText(
        "Focus on expressing needs clearly and asking clarifying questions before reacting.",
      ),
    ).toBeTruthy();
  });

  it("renders fallback text when synthesis is null", () => {
    mockSearchParams.delete("tab");
    mockSearchParams.set("tab", "guidance");
    synthesisFixture = null;
    renderPage();
    expect(
      screen.getByText("Synthesis not available."),
    ).toBeTruthy();
  });
});

// ── AC: Banner: "This case is closed. No new messages can be added." ────

describe("AC: Closed banner is displayed", () => {
  it("renders the closed banner with correct text", () => {
    renderPage();
    const banner = screen.getByTestId("closed-banner");
    expect(banner.textContent).toBe(
      "This case is closed. No new messages can be added.",
    );
  });

  it("banner is present regardless of which tab is active", () => {
    mockSearchParams.delete("tab");
    mockSearchParams.set("tab", "private");
    renderPage();
    expect(screen.getByTestId("closed-banner")).toBeTruthy();
  });
});

// ── Invariant: Route guard redirects non-closed statuses ────────────────

describe("Invariant: Route guard redirects non-closed statuses", () => {
  it("redirects to /cases/:caseId for JOINT_ACTIVE status", () => {
    caseFixture = {
      ...RESOLVED_CASE,
      status: "JOINT_ACTIVE",
    };
    renderPage();
    const nav = screen.getByTestId("navigate-redirect");
    expect(nav.getAttribute("data-to")).toContain(`/cases/${CASE_ID}`);
  });

  it("redirects to /cases/:caseId for BOTH_PRIVATE_COACHING status", () => {
    caseFixture = {
      ...RESOLVED_CASE,
      status: "BOTH_PRIVATE_COACHING",
    };
    renderPage();
    const nav = screen.getByTestId("navigate-redirect");
    expect(nav.getAttribute("data-to")).toContain(`/cases/${CASE_ID}`);
  });
});

// ── Invariant: No input controls rendered ───────────────────────────────

describe("Invariant: No input controls rendered in any tab", () => {
  it("no textarea exists on joint tab", () => {
    renderPage();
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("no textarea exists on private tab", () => {
    mockSearchParams.delete("tab");
    mockSearchParams.set("tab", "private");
    renderPage();
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("no textarea exists on guidance tab", () => {
    mockSearchParams.delete("tab");
    mockSearchParams.set("tab", "guidance");
    renderPage();
    expect(document.querySelector("textarea")).toBeNull();
  });
});

// ── Invariant: page-level data-testid ───────────────────────────────────

describe("Page-level attributes", () => {
  it("renders main element with data-testid=page-case-closed", () => {
    renderPage();
    expect(screen.getByTestId("page-case-closed")).toBeTruthy();
  });
});

// ── Edge case: Loading state ────────────────────────────────────────────

describe("Edge case: Loading state", () => {
  it("renders loading state when case data is undefined", () => {
    caseFixture = undefined;
    renderPage();
    // Should not crash; should show loading indicator
    expect(screen.queryByTestId("page-case-closed")).toBeNull();
    expect(screen.queryByTestId("navigate-redirect")).toBeNull();
  });
});
