// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  cleanup,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { ReadyForJointView } from "../../src/routes/ReadyForJointView";

// ── Hoisted mocks ───────────────────────────────────────────────────────

const {
  mockNavigate,
  mockUseQuery,
  mockUseMutation,
  mockUseParams,
  mockEnterSession,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseQuery: vi.fn(),
  mockUseMutation: vi.fn(),
  mockUseParams: vi.fn(() => ({ caseId: "case-abc123" })),
  mockEnterSession: vi.fn(() => Promise.resolve()),
}));

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
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
  category: string;
  initiatorUserId: string;
  inviteeUserId: string | null;
}

interface Synthesis {
  text: string;
}

interface OtherPartyName {
  displayName: string | null;
}

interface PartyStates {
  self: {
    role: string;
    privateCoachingCompletedAt: number | null;
  };
  other: {
    role: string;
    hasCompletedPC: boolean;
  } | null;
}

// ── Fixture data ────────────────────────────────────────────────────────

const CASE_ID = "case-abc123";

const SYNTHESIS_MARKDOWN = `### Areas of likely agreement

Both parties want a respectful working relationship and recognize the value of clear communication.

### Points that will need real discussion

There is a disconnect about meeting frequency and the level of detail expected in status updates.

### Suggested approach

Start by acknowledging shared goals, then address the meeting frequency concern with specific proposals.`;

const DEFAULT_CASE: CaseDoc = {
  _id: CASE_ID,
  status: "READY_FOR_JOINT",
  category: "Workplace",
  initiatorUserId: "user-me",
  inviteeUserId: "user-jordan",
};

const DEFAULT_SYNTHESIS: Synthesis = {
  text: SYNTHESIS_MARKDOWN,
};

const DEFAULT_OTHER_PARTY_NAME: OtherPartyName = {
  displayName: "Jordan",
};

const DEFAULT_PARTY_STATES: PartyStates = {
  self: { role: "INITIATOR", privateCoachingCompletedAt: 1_700_000_000_000 },
  other: { role: "INVITEE", hasCompletedPC: true },
};

// ── Mock query/mutation routing ─────────────────────────────────────────

const FN_NAME = Symbol.for("functionName");

let caseFixture: CaseDoc | undefined;
let synthesisFixture: Synthesis | null | undefined;
let otherPartyNameFixture: OtherPartyName | undefined;
let partyStatesFixture: PartyStates | undefined;

function setupDefaultMocks() {
  caseFixture = DEFAULT_CASE;
  synthesisFixture = DEFAULT_SYNTHESIS;
  otherPartyNameFixture = DEFAULT_OTHER_PARTY_NAME;
  partyStatesFixture = DEFAULT_PARTY_STATES;

  mockUseQuery.mockImplementation(
    (queryRef: Record<string | symbol, unknown>) => {
      const name: string = (queryRef?.[FN_NAME] as string) ?? "";
      if (name.includes("cases:get") || name.includes("cases.get")) {
        return caseFixture;
      }
      if (
        name.includes("jointChat:mySynthesis") ||
        name.includes("jointChat.mySynthesis")
      ) {
        return synthesisFixture;
      }
      if (
        name.includes("cases:otherPartyName") ||
        name.includes("cases.otherPartyName")
      ) {
        return otherPartyNameFixture;
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
        name.includes("jointChat:enterSession") ||
        name.includes("jointChat.enterSession")
      ) {
        return mockEnterSession;
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
  mockEnterSession.mockReset();
  mockUseParams.mockReturnValue({ caseId: CASE_ID });

  mockEnterSession.mockReturnValue(Promise.resolve());

  setupDefaultMocks();
});

afterEach(() => {
  cleanup();
});

// ── Helpers ─────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/cases/${CASE_ID}/ready`]}>
      <ReadyForJointView />
    </MemoryRouter>,
  );
}

// ── AC: Reads synthesis from jointChat/mySynthesis reactive query ────────

describe("AC: Reads synthesis from jointChat/mySynthesis reactive query", () => {
  it("renders synthesis text from the mySynthesis query", () => {
    renderPage();
    expect(
      screen.getByText(/Both parties want a respectful working relationship/),
    ).toBeDefined();
  });

  it("shows loading state while synthesis query returns undefined", () => {
    synthesisFixture = undefined;
    renderPage();
    const spinner =
      screen.queryByRole("status") ?? screen.queryByText(/loading/i);
    expect(spinner).not.toBeNull();
  });

  it("shows preparing message when synthesis is null", () => {
    synthesisFixture = null;
    renderPage();
    expect(screen.getByText(/synthesis is being prepared/i)).toBeDefined();
  });
});

// ── AC: Synthesis card rendered with correct styling class ──────────────

describe("AC: Synthesis card rendered with --private-tint background, 32px padding, 14px radius", () => {
  it("renders a container with the cc-synthesis-card class", () => {
    renderPage();
    const card = document.querySelector(".cc-synthesis-card");
    expect(card).not.toBeNull();
  });
});

// ── AC: Privacy banner above synthesis ──────────────────────────────────

describe("AC: Privacy banner above synthesis", () => {
  it("renders privacy banner with other party name", () => {
    renderPage();
    expect(
      screen.getByText(/Private to you — Jordan has their own version/),
    ).toBeDefined();
  });

  it("falls back to 'the other party' when displayName is null", () => {
    otherPartyNameFixture = { displayName: null };
    renderPage();
    expect(
      screen.getByText(
        /Private to you — the other party has their own version/,
      ),
    ).toBeDefined();
  });
});

// ── AC: Three H3 sections in order ─────────────────────────────────────

describe("AC: Three H3 sections in order", () => {
  it("renders three h3 elements with the correct headings in order", () => {
    renderPage();
    const headings = screen.getAllByRole("heading", { level: 3 });
    const headingTexts = headings.map((h) => h.textContent);

    expect(headingTexts).toContain("Areas of likely agreement");
    expect(headingTexts).toContain("Points that will need real discussion");
    expect(headingTexts).toContain("Suggested approach");

    // Verify order
    const agreementIdx = headingTexts.indexOf("Areas of likely agreement");
    const discussionIdx = headingTexts.indexOf(
      "Points that will need real discussion",
    );
    const approachIdx = headingTexts.indexOf("Suggested approach");

    expect(agreementIdx).toBeLessThan(discussionIdx);
    expect(discussionIdx).toBeLessThan(approachIdx);
  });
});

// ── AC: Primary CTA button ─────────────────────────────────────────────

describe("AC: Primary CTA — Enter Joint Session →", () => {
  it("renders a button with text 'Enter Joint Session →'", () => {
    renderPage();
    const button = screen.getByRole("button", {
      name: /Enter Joint Session/,
    });
    expect(button).toBeDefined();
  });

  it("button has cc-btn-primary class", () => {
    renderPage();
    const button = screen.getByRole("button", {
      name: /Enter Joint Session/,
    });
    expect(button.classList.contains("cc-btn-primary")).toBe(true);
  });

  it("is the sole primary action button on the page", () => {
    renderPage();
    const primaryButtons = document.querySelectorAll(".cc-btn-primary");
    expect(primaryButtons.length).toBe(1);
  });
});

// ── AC: Clicking CTA transitions case and navigates ─────────────────────

describe("AC: Clicking CTA transitions case to JOINT_ACTIVE and routes to /cases/:caseId/joint", () => {
  it("calls enterSession mutation on CTA click", async () => {
    renderPage();
    const button = screen.getByRole("button", {
      name: /Enter Joint Session/,
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockEnterSession).toHaveBeenCalledWith(
        expect.objectContaining({ caseId: CASE_ID }),
      );
    });
  });

  it("navigates to /cases/:caseId/joint after successful mutation", async () => {
    renderPage();
    const button = screen.getByRole("button", {
      name: /Enter Joint Session/,
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/cases/${CASE_ID}/joint`);
    });
  });

  it("does not navigate when enterSession mutation fails", async () => {
    mockEnterSession.mockRejectedValue(new Error("CONFLICT"));
    renderPage();
    const button = screen.getByRole("button", {
      name: /Enter Joint Session/,
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockEnterSession).toHaveBeenCalled();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("displays an error message when enterSession mutation fails", async () => {
    mockEnterSession.mockRejectedValue(new Error("CONFLICT"));
    renderPage();
    const button = screen.getByRole("button", {
      name: /Enter Joint Session/,
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/CONFLICT|error/i)).toBeDefined();
    });
  });
});

// ── AC: Name message below CTA ─────────────────────────────────────────

describe("AC: '[Name] will see you've entered when they enter too.' message below CTA", () => {
  it("renders the message with the other party's name", () => {
    renderPage();
    expect(
      screen.getByText(/Jordan will see you've entered when they enter too/),
    ).toBeDefined();
  });

  it("falls back to 'the other party' when displayName is null", () => {
    otherPartyNameFixture = { displayName: null };
    renderPage();
    expect(
      screen.getByText(
        /the other party will see you've entered when they enter too/i,
      ),
    ).toBeDefined();
  });
});

// ── Invariant: Page only reachable in READY_FOR_JOINT status ────────────

describe("Invariant: Page redirects when status is not READY_FOR_JOINT", () => {
  it("redirects to /cases/:caseId when status is JOINT_ACTIVE", () => {
    caseFixture = { ...DEFAULT_CASE, status: "JOINT_ACTIVE" };
    renderPage();
    const nav = screen.getByTestId("navigate-redirect");
    expect(nav.getAttribute("data-to")).toBe(`/cases/${CASE_ID}`);
  });

  it("redirects to /cases/:caseId when status is BOTH_PRIVATE_COACHING", () => {
    caseFixture = { ...DEFAULT_CASE, status: "BOTH_PRIVATE_COACHING" };
    renderPage();
    const nav = screen.getByTestId("navigate-redirect");
    expect(nav.getAttribute("data-to")).toBe(`/cases/${CASE_ID}`);
  });
});

// ── Invariant: Read-only page (no input controls) ───────────────────────

describe("Invariant: No input controls other than the CTA button", () => {
  it("does not render any text input or textarea elements", () => {
    renderPage();
    const inputs = document.querySelectorAll('input[type="text"], textarea');
    expect(inputs.length).toBe(0);
  });
});

// ── Edge: Loading state ─────────────────────────────────────────────────

describe("Edge: Loading state while all queries return undefined", () => {
  it("renders a loading indicator when case query returns undefined", () => {
    caseFixture = undefined;
    renderPage();
    const spinner =
      screen.queryByRole("status") ?? screen.queryByText(/loading/i);
    expect(spinner).not.toBeNull();
  });
});
