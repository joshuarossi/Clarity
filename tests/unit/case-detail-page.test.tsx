// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  cleanup,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { CaseDetailPage } from "../../src/routes/CaseDetailPage";

// ── Hoisted mocks ───────────────────────────────────────────────────────

const {
  mockNavigate,
  mockUseQuery,
  mockUseMutation,
  mockUseParams,
  mockUpdateMyForm,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseQuery: vi.fn(),
  mockUseMutation: vi.fn(),
  mockUseParams: vi.fn((): { caseId: string | undefined } => ({ caseId: "case-abc123" })),
  mockUpdateMyForm: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: mockUseParams,
    Navigate: ({ to }: { to: string }) => (
      <div data-testid="navigate-redirect" data-to={to} />
    ),
  };
});

// ── Import MemoryRouter after mocks ─────────────────────────────────────
import { MemoryRouter } from "react-router-dom";

// ── Fixture types ───────────────────────────────────────────────────────

interface CaseDoc {
  _id: string;
  status: string;
  isSolo: boolean;
  category: string;
  initiatorUserId: string;
  inviteeUserId: string | null;
}

interface PartyStates {
  self: {
    role: string;
    formCompletedAt: number | null;
  };
  other: {
    role: string;
    hasCompletedPC: boolean;
  } | null;
}

// ── Fixture data ────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;
const CASE_ID = "case-abc123";
const USER_ID = "user-me";

const DEFAULT_CASE: CaseDoc = {
  _id: CASE_ID,
  status: "BOTH_PRIVATE_COACHING",
  isSolo: false,
  category: "Workplace",
  initiatorUserId: USER_ID,
  inviteeUserId: "user-jordan",
};

const DEFAULT_PARTY_STATES: PartyStates = {
  self: { role: "INITIATOR", formCompletedAt: NOW - 100_000 },
  other: { role: "INVITEE", hasCompletedPC: false },
};

// ── Mock query/mutation routing ─────────────────────────────────────────

const FN_NAME = Symbol.for("functionName");

let caseFixture: CaseDoc | undefined;
let partyStatesFixture: PartyStates | undefined;

function setupDefaultMocks() {
  caseFixture = DEFAULT_CASE;
  partyStatesFixture = DEFAULT_PARTY_STATES;

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
      return undefined;
    },
  );

  mockUseMutation.mockImplementation(
    (mutationRef: Record<string | symbol, unknown>) => {
      const name: string = (mutationRef?.[FN_NAME] as string) ?? "";
      if (
        name.includes("cases:updateMyForm") ||
        name.includes("cases.updateMyForm")
      ) {
        return mockUpdateMyForm;
      }
      return vi.fn();
    },
  );
}

// ── Setup / Teardown ────────────────────────────────────────────────────

beforeEach(() => {
  mockNavigate.mockReset();
  mockUseQuery.mockReset();
  mockUseMutation.mockReset();
  mockUpdateMyForm.mockReset();
  mockUseParams.mockReturnValue({ caseId: CASE_ID });

  mockUpdateMyForm.mockReturnValue(Promise.resolve(null));

  setupDefaultMocks();
});

afterEach(() => {
  cleanup();
});

// ── Helpers ─────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/cases/${CASE_ID}`]}>
      <CaseDetailPage />
    </MemoryRouter>,
  );
}

// ── AC: Route /cases/:caseId reads case status and renders the correct subview ──

describe("AC: Status-to-subview mapping", () => {
  it("renders Navigate to /private for DRAFT_PRIVATE_COACHING (initiator)", () => {
    caseFixture = { ...DEFAULT_CASE, status: "DRAFT_PRIVATE_COACHING" };
    renderPage();
    const nav = screen.getByTestId("navigate-redirect");
    expect(nav.getAttribute("data-to")).toContain("/private");
  });

  it("renders Navigate to /private for BOTH_PRIVATE_COACHING (initiator)", () => {
    caseFixture = { ...DEFAULT_CASE, status: "BOTH_PRIVATE_COACHING" };
    renderPage();
    const nav = screen.getByTestId("navigate-redirect");
    expect(nav.getAttribute("data-to")).toContain("/private");
  });

  it("renders ReadyForJointView for READY_FOR_JOINT", () => {
    caseFixture = { ...DEFAULT_CASE, status: "READY_FOR_JOINT" };
    renderPage();
    expect(screen.getByTestId("subview-ready-for-joint")).toBeDefined();
  });

  it("renders JointChatView for JOINT_ACTIVE", () => {
    caseFixture = { ...DEFAULT_CASE, status: "JOINT_ACTIVE" };
    renderPage();
    expect(screen.getByTestId("subview-joint-chat")).toBeDefined();
  });

  it("renders ClosedCaseView for CLOSED_RESOLVED", () => {
    caseFixture = { ...DEFAULT_CASE, status: "CLOSED_RESOLVED" };
    renderPage();
    expect(screen.getByTestId("subview-closed")).toBeDefined();
  });

  it("renders ClosedCaseView for CLOSED_UNRESOLVED", () => {
    caseFixture = { ...DEFAULT_CASE, status: "CLOSED_UNRESOLVED" };
    renderPage();
    expect(screen.getByTestId("subview-closed")).toBeDefined();
  });

  it("renders ClosedCaseView for CLOSED_ABANDONED", () => {
    caseFixture = { ...DEFAULT_CASE, status: "CLOSED_ABANDONED" };
    renderPage();
    expect(screen.getByTestId("subview-closed")).toBeDefined();
  });
});

// ── AC: DRAFT_PRIVATE_COACHING or BOTH_PRIVATE_COACHING → invitee form ──

describe("AC: Private coaching status shows invitee form when invitee has not completed form", () => {
  beforeEach(() => {
    caseFixture = {
      ...DEFAULT_CASE,
      status: "DRAFT_PRIVATE_COACHING",
      initiatorUserId: "user-other",
      inviteeUserId: USER_ID,
    };
    partyStatesFixture = {
      self: { role: "INVITEE", formCompletedAt: null },
      other: { role: "INITIATOR", hasCompletedPC: false },
    };
  });

  it("renders invitee form when invitee has not completed perspective form", () => {
    renderPage();
    // The form should have fields for mainTopic, description, desiredOutcome
    expect(screen.getByLabelText(/main topic/i)).toBeDefined();
  });

  it("renders invitee form with description and desired outcome fields", () => {
    renderPage();
    expect(screen.getByLabelText(/description/i)).toBeDefined();
    expect(screen.getByLabelText(/desired outcome/i)).toBeDefined();
  });

  it("does not render invitee form when formCompletedAt is set", () => {
    partyStatesFixture = {
      self: { role: "INVITEE", formCompletedAt: NOW },
      other: { role: "INITIATOR", hasCompletedPC: false },
    };
    renderPage();
    // Should navigate to /private instead of showing form
    const nav = screen.getByTestId("navigate-redirect");
    expect(nav.getAttribute("data-to")).toContain("/private");
  });

  it("does not render invitee form when user is the initiator", () => {
    caseFixture = {
      ...DEFAULT_CASE,
      status: "DRAFT_PRIVATE_COACHING",
    };
    partyStatesFixture = {
      self: { role: "INITIATOR", formCompletedAt: NOW },
      other: { role: "INVITEE", hasCompletedPC: false },
    };
    renderPage();
    const nav = screen.getByTestId("navigate-redirect");
    expect(nav.getAttribute("data-to")).toContain("/private");
  });

  it("calls updateMyForm mutation on form submission", async () => {
    renderPage();

    const topicInput = screen.getByLabelText(/main topic/i);
    const descInput = screen.getByLabelText(/description/i);
    const outcomeInput = screen.getByLabelText(/desired outcome/i);

    fireEvent.change(topicInput, { target: { value: "Communication issues" } });
    fireEvent.change(descInput, {
      target: { value: "We struggle to communicate effectively" },
    });
    fireEvent.change(outcomeInput, {
      target: { value: "Better understanding" },
    });

    const submitButton = screen.getByRole("button", { name: /submit/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockUpdateMyForm).toHaveBeenCalledWith(
        expect.objectContaining({
          caseId: CASE_ID,
          mainTopic: "Communication issues",
          description: "We struggle to communicate effectively",
          desiredOutcome: "Better understanding",
        }),
      );
    });
  });

  it("disables submit when form fields are empty", () => {
    renderPage();
    const submitButton = screen.getByRole("button", { name: /submit/i });
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);
  });
});

// ── AC: PhaseHeader shows correct phase name for current status ──────────

describe("AC: PhaseHeader shows correct phase name for current status", () => {
  it("shows 'Private Coaching' for DRAFT_PRIVATE_COACHING", () => {
    caseFixture = { ...DEFAULT_CASE, status: "DRAFT_PRIVATE_COACHING" };
    renderPage();
    expect(screen.getByText(/Private Coaching/)).toBeDefined();
  });

  it("shows 'Private Coaching' for BOTH_PRIVATE_COACHING", () => {
    caseFixture = { ...DEFAULT_CASE, status: "BOTH_PRIVATE_COACHING" };
    renderPage();
    expect(screen.getByText(/Private Coaching/)).toBeDefined();
  });

  it("shows 'Ready for Joint Session' for READY_FOR_JOINT", () => {
    caseFixture = { ...DEFAULT_CASE, status: "READY_FOR_JOINT" };
    renderPage();
    expect(screen.getByText(/Ready for Joint Session/)).toBeDefined();
  });

  it("shows 'Joint Discussion' for JOINT_ACTIVE", () => {
    caseFixture = { ...DEFAULT_CASE, status: "JOINT_ACTIVE" };
    renderPage();
    expect(screen.getByText(/Joint Discussion/)).toBeDefined();
  });

  it("shows 'Closed' for CLOSED_RESOLVED", () => {
    caseFixture = { ...DEFAULT_CASE, status: "CLOSED_RESOLVED" };
    renderPage();
    expect(screen.getByRole("heading", { name: /Closed/ })).toBeDefined();
  });

  it("shows 'Closed' for CLOSED_UNRESOLVED", () => {
    caseFixture = { ...DEFAULT_CASE, status: "CLOSED_UNRESOLVED" };
    renderPage();
    expect(screen.getByRole("heading", { name: /Closed/ })).toBeDefined();
  });

  it("shows 'Closed' for CLOSED_ABANDONED", () => {
    caseFixture = { ...DEFAULT_CASE, status: "CLOSED_ABANDONED" };
    renderPage();
    expect(screen.getByRole("heading", { name: /Closed/ })).toBeDefined();
  });
});

// ── AC: If caller is not a party, redirects to /dashboard ────────────────

describe("AC: Non-party user redirects to /dashboard with error", () => {
  it("redirects to /dashboard when useQuery throws FORBIDDEN", () => {
    mockUseQuery.mockImplementation(
      (queryRef: Record<string | symbol, unknown>) => {
        const name: string = (queryRef?.[FN_NAME] as string) ?? "";
        if (name.includes("cases:get") || name.includes("cases.get")) {
          throw new Error("FORBIDDEN");
        }
        return undefined;
      },
    );
    renderPage();
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });
});

// ── Edge: Loading state ─────────────────────────────────────────────────

describe("Edge: Loading state while case query returns undefined", () => {
  it("renders a loading indicator when case query returns undefined", () => {
    caseFixture = undefined;
    renderPage();
    const spinner =
      screen.queryByRole("status") ??
      screen.queryByText(/loading/i);
    expect(spinner).not.toBeNull();
  });
});

// ── Edge: Invalid caseId param ──────────────────────────────────────────

describe("Edge: Invalid caseId param", () => {
  it("renders error message when caseId is missing from params", () => {
    mockUseParams.mockReturnValue({ caseId: undefined });
    renderPage();
    expect(screen.getByText(/invalid case/i)).toBeDefined();
  });
});

// ── AC: Reactively updates when status changes ──────────────────────────

describe("AC: Reactively updates when case status changes", () => {
  it("re-renders correct subview when case status transitions", () => {
    caseFixture = { ...DEFAULT_CASE, status: "READY_FOR_JOINT" };
    const { rerender } = renderPage();
    expect(screen.getByTestId("subview-ready-for-joint")).toBeDefined();

    // Simulate status transition
    caseFixture = { ...DEFAULT_CASE, status: "JOINT_ACTIVE" };
    rerender(
      <MemoryRouter initialEntries={[`/cases/${CASE_ID}`]}>
        <CaseDetailPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("subview-joint-chat")).toBeDefined();
  });
});
