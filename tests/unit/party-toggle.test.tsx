// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { PartyToggle } from "../../src/components/layout/PartyToggle";

afterEach(cleanup);

// ── Fixture data ────────────────────────────────────────────────────────

interface PartyToggleProps {
  initiatorName: string;
  inviteeName: string;
  activeParty: "initiator" | "invitee";
  onToggle: (party: "initiator" | "invitee") => void;
}

function defaultProps(overrides?: Partial<PartyToggleProps>): PartyToggleProps {
  return {
    initiatorName: "Alex (Initiator)",
    inviteeName: "Alex (Invitee)",
    activeParty: "initiator",
    onToggle: vi.fn(),
    ...overrides,
  };
}

// ── AC: PartyToggle renders a prominent segmented control with initiator
//    name and invitee name, colored with --coach-accent border per
//    StyleGuide §6.10 ───────────────────────────────────────────────────

describe("AC: PartyToggle renders segmented control with party names and coach-accent styling", () => {
  it("renders both party name buttons", () => {
    const props = defaultProps();
    render(<PartyToggle {...props} />);

    expect(screen.getByText("Alex (Initiator)")).toBeDefined();
    expect(screen.getByText("Alex (Invitee)")).toBeDefined();
  });

  it("applies .party-toggle class to the container (coach-accent border)", () => {
    const props = defaultProps();
    const { container } = render(<PartyToggle {...props} />);

    const toggle = container.querySelector(".party-toggle");
    expect(toggle).not.toBeNull();
  });

  it("marks the active party button with data-active='true'", () => {
    const props = defaultProps({ activeParty: "initiator" });
    render(<PartyToggle {...props} />);

    const initiatorBtn = screen.getByText("Alex (Initiator)").closest("button");
    expect(initiatorBtn).not.toBeNull();
    expect(initiatorBtn!.getAttribute("data-active")).toBe("true");
  });

  it("marks the inactive party button with data-active='false'", () => {
    const props = defaultProps({ activeParty: "initiator" });
    render(<PartyToggle {...props} />);

    const inviteeBtn = screen.getByText("Alex (Invitee)").closest("button");
    expect(inviteeBtn).not.toBeNull();
    expect(inviteeBtn!.getAttribute("data-active")).toBe("false");
  });

  it("applies .party-toggle-btn class to each button", () => {
    const props = defaultProps();
    const { container } = render(<PartyToggle {...props} />);

    const buttons = container.querySelectorAll(".party-toggle-btn");
    expect(buttons.length).toBe(2);
  });
});

// ── AC: "VIEWING AS" uppercase label at 11px above the toggle per
//    StyleGuide §6.10 ───────────────────────────────────────────────────

describe("AC: 'VIEWING AS' uppercase label above the toggle", () => {
  it("renders 'VIEWING AS' text", () => {
    const props = defaultProps();
    render(<PartyToggle {...props} />);

    expect(screen.getByText("VIEWING AS")).toBeDefined();
  });

  it("'VIEWING AS' label has .party-toggle-label class", () => {
    const props = defaultProps();
    const { container } = render(<PartyToggle {...props} />);

    const label = container.querySelector(".party-toggle-label");
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe("VIEWING AS");
  });
});

// ── AC: Toggle state stored in URL query param — click fires onToggle
//    with the correct party value ───────────────────────────────────────

describe("AC: Toggle click fires onToggle with correct party value", () => {
  it("calls onToggle with 'invitee' when invitee button is clicked", () => {
    const onToggle = vi.fn();
    const props = defaultProps({ activeParty: "initiator", onToggle });
    render(<PartyToggle {...props} />);

    const inviteeBtn = screen.getByText("Alex (Invitee)").closest("button");
    expect(inviteeBtn).not.toBeNull();
    fireEvent.click(inviteeBtn!);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("invitee");
  });

  it("calls onToggle with 'initiator' when initiator button is clicked", () => {
    const onToggle = vi.fn();
    const props = defaultProps({ activeParty: "invitee", onToggle });
    render(<PartyToggle {...props} />);

    const initiatorBtn = screen.getByText("Alex (Initiator)").closest("button");
    expect(initiatorBtn).not.toBeNull();
    fireEvent.click(initiatorBtn!);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("initiator");
  });
});

// ── AC: PartyToggle only renders on cases where isSolo=true ───────────
// This AC is tested at the page integration level — the PartyToggle
// component itself is purely presentational and always renders when
// mounted. The parent (CasePrivatePage) is responsible for conditional
// rendering based on isSolo. We test that the component renders
// normally when mounted, and trust the page-level test below for the
// conditional logic.

describe("AC: PartyToggle only renders on cases where isSolo=true (page-level integration)", () => {
  // We test the presentational component here. The page-level rendering
  // condition (isSolo gate) is tested via the CasePrivatePage integration
  // test below.

  it("PartyToggle renders when mounted (presentational — always renders)", () => {
    const props = defaultProps();
    const { container } = render(<PartyToggle {...props} />);

    const toggle = container.querySelector(".party-toggle");
    expect(toggle).not.toBeNull();
  });
});

// ── AC: PartyToggle only renders on cases where isSolo=true
//    + AC: Position top-right of PhaseHeader in solo cases
//    — Page-level integration: CasePrivatePage renders PartyToggle when
//      isSolo=true and hides it when isSolo=false ──────────────────────

// These tests import CasePrivatePage and mock the queries to control
// isSolo. They verify the toggle appears/disappears based on case data.

import { CasePrivatePage } from "../../src/routes/CasePrivatePage";

const {
  mockNavigate,
  mockUseQuery,
  mockUseMutation,
  mockUseParams,
  mockUseSearchParams,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseQuery: vi.fn(),
  mockUseMutation: vi.fn(),
  mockUseParams: vi.fn(() => ({ caseId: "case-solo-123" })),
  mockUseSearchParams: vi.fn(() => {
    const params = new URLSearchParams("?as=initiator");
    return [params, vi.fn()] as const;
  }),
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
    useSearchParams: mockUseSearchParams,
  };
});

import { MemoryRouter } from "react-router-dom";

// ── Mock query/mutation routing helpers ─────────────────────────────────

const FN_NAME = Symbol.for("functionName");
const CASE_ID = "case-solo-123";
const USER_ID = "user-solo";
const NOW = 1_700_000_000_000;

interface CaseDoc {
  _id: string;
  status: string;
  initiatorUserId: string;
  inviteeUserId: string | null;
  isSolo?: boolean;
}

interface PartyStates {
  self: { privateCoachingCompletedAt: number | null };
  other: { role: string; hasCompletedPC: boolean } | null;
}

const SOLO_CASE: CaseDoc = {
  _id: CASE_ID,
  status: "BOTH_PRIVATE_COACHING",
  initiatorUserId: USER_ID,
  inviteeUserId: USER_ID,
  isSolo: true,
};

const NON_SOLO_CASE: CaseDoc = {
  _id: CASE_ID,
  status: "BOTH_PRIVATE_COACHING",
  initiatorUserId: USER_ID,
  inviteeUserId: "user-other",
  isSolo: false,
};

const DEFAULT_PARTY_STATES: PartyStates = {
  self: { privateCoachingCompletedAt: null },
  other: { role: "invitee", hasCompletedPC: false },
};

const USER_MSG = {
  _id: "msg-1",
  role: "USER" as const,
  content: "Solo test message",
  status: "COMPLETE" as const,
  createdAt: NOW - 60_000,
  userId: USER_ID,
};

const AI_MSG = {
  _id: "msg-2",
  role: "AI" as const,
  content: "Coach reply in solo mode",
  status: "COMPLETE" as const,
  createdAt: NOW - 30_000,
  userId: USER_ID,
};

let caseFixture: CaseDoc | undefined;

function setupPageMocks(caseDoc: CaseDoc) {
  caseFixture = caseDoc;

  mockUseQuery.mockImplementation(
    (queryRef: Record<string | symbol, unknown>) => {
      const name: string = (queryRef?.[FN_NAME] as string) ?? "";
      if (
        name.includes("privateCoaching:myMessages") ||
        name.includes("privateCoaching.myMessages")
      ) {
        return [USER_MSG, AI_MSG];
      }
      if (name.includes("cases:get") || name.includes("cases.get")) {
        return caseFixture;
      }
      if (
        name.includes("cases:partyStates") ||
        name.includes("cases.partyStates")
      ) {
        return DEFAULT_PARTY_STATES;
      }
      if (
        name.includes("cases:otherPartyName") ||
        name.includes("cases.otherPartyName")
      ) {
        return { displayName: "Alex" };
      }
      return undefined;
    },
  );

  mockUseMutation.mockImplementation(() => vi.fn(() => Promise.resolve(null)));
}

function renderPageWithRouter() {
  return render(
    <MemoryRouter initialEntries={[`/cases/${CASE_ID}/private?as=initiator`]}>
      <CasePrivatePage />
    </MemoryRouter>,
  );
}

describe("AC: PartyToggle renders only on solo cases (page integration)", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseQuery.mockReset();
    mockUseMutation.mockReset();
    mockUseParams.mockReturnValue({ caseId: CASE_ID });
    mockUseSearchParams.mockReturnValue([
      new URLSearchParams("?as=initiator"),
      vi.fn(),
    ]);
  });

  it("renders PartyToggle when case isSolo is true", () => {
    setupPageMocks(SOLO_CASE);
    const { container } = renderPageWithRouter();

    const toggle = container.querySelector(".party-toggle");
    expect(toggle).not.toBeNull();
  });

  it("does NOT render PartyToggle when case isSolo is false", () => {
    setupPageMocks(NON_SOLO_CASE);
    const { container } = renderPageWithRouter();

    const toggle = container.querySelector(".party-toggle");
    expect(toggle).toBeNull();
  });

  it("renders 'VIEWING AS' label inside page header for solo cases", () => {
    setupPageMocks(SOLO_CASE);
    renderPageWithRouter();

    expect(screen.getByText("VIEWING AS")).toBeDefined();
  });
});

// ── AC: Solo cases are visually distinct with coach-accent banner ──────

describe("AC: Solo cases visually distinct with coach-accent styling", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseQuery.mockReset();
    mockUseMutation.mockReset();
    mockUseParams.mockReturnValue({ caseId: CASE_ID });
    mockUseSearchParams.mockReturnValue([
      new URLSearchParams("?as=initiator"),
      vi.fn(),
    ]);
  });

  it("PartyToggle container has .party-toggle class which applies coach-accent border", () => {
    setupPageMocks(SOLO_CASE);
    const { container } = renderPageWithRouter();

    const toggle = container.querySelector(".party-toggle");
    expect(toggle).not.toBeNull();
  });
});

// ── AC: Toggle switches active state correctly ────────────────────────

describe("AC: Active party toggle switches correctly on interaction", () => {
  it("swaps data-active attribute when activeParty changes", () => {
    const onToggle = vi.fn();
    const props = defaultProps({ activeParty: "invitee", onToggle });
    render(<PartyToggle {...props} />);

    const inviteeBtn = screen.getByText("Alex (Invitee)").closest("button");
    expect(inviteeBtn).not.toBeNull();
    expect(inviteeBtn!.getAttribute("data-active")).toBe("true");

    const initiatorBtn = screen.getByText("Alex (Initiator)").closest("button");
    expect(initiatorBtn).not.toBeNull();
    expect(initiatorBtn!.getAttribute("data-active")).toBe("false");
  });
});
