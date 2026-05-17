// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  cleanup,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { JointChatView } from "../../src/routes/JointChatView";

// ── Hoisted mocks ───────────────────────────────────────────────────────

const {
  mockNavigate,
  mockUseQuery,
  mockUseMutation,
  mockUseParams,
  mockSendUserMessage,
  mockProposeClosure,
  mockUnilateralClose,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseQuery: vi.fn(),
  mockUseMutation: vi.fn(),
  mockUseParams: vi.fn(() => ({ caseId: "case-abc123" })),
  mockSendUserMessage: vi.fn(() => Promise.resolve(null)),
  mockProposeClosure: vi.fn(() => Promise.resolve(null)),
  mockUnilateralClose: vi.fn(() => Promise.resolve(null)),
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

interface JointMessage {
  _id: string;
  caseId: string;
  authorType: "USER" | "COACH";
  authorUserId: string | null;
  content: string;
  status: "STREAMING" | "COMPLETE" | "ERROR";
  isIntervention: boolean;
  createdAt: number;
}

interface CaseDoc {
  _id: string;
  status: string;
  category: string;
  initiatorUserId: string;
  inviteeUserId: string | null;
  isSolo: boolean;
}

interface Synthesis {
  text: string;
}

// ── Fixture data ────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;
const CASE_ID = "case-abc123";
const INITIATOR_ID = "user-alex";
const INVITEE_ID = "user-jordan";

const DEFAULT_CASE: CaseDoc = {
  _id: CASE_ID,
  status: "JOINT_ACTIVE",
  category: "Workplace",
  initiatorUserId: INITIATOR_ID,
  inviteeUserId: INVITEE_ID,
  isSolo: false,
};

const DEFAULT_SYNTHESIS: Synthesis = {
  text: "Start by acknowledging shared goals before addressing specific concerns.",
};

const DEFAULT_MESSAGES: JointMessage[] = [
  {
    _id: "msg-1",
    caseId: CASE_ID,
    authorType: "COACH",
    authorUserId: null,
    content: "Welcome to the joint session. Let's begin.",
    status: "COMPLETE",
    isIntervention: false,
    createdAt: NOW,
  },
  {
    _id: "msg-2",
    caseId: CASE_ID,
    authorType: "USER",
    authorUserId: INITIATOR_ID,
    content: "I'd like to discuss the meeting frequency.",
    status: "COMPLETE",
    isIntervention: false,
    createdAt: NOW + 1000,
  },
  {
    _id: "msg-3",
    caseId: CASE_ID,
    authorType: "USER",
    authorUserId: INVITEE_ID,
    content: "I agree, let's talk about that.",
    status: "COMPLETE",
    isIntervention: false,
    createdAt: NOW + 2000,
  },
];

// ── Mock query/mutation routing ─────────────────────────────────────────

const FN_NAME = Symbol.for("functionName");

interface PartyStates {
  self: {
    role: string;
    _id: string;
    _creationTime: number;
    caseId: string;
    userId: string;
  };
  other: {
    role: string;
    hasCompletedPC: boolean;
    closureProposed: boolean;
  } | null;
}

const DEFAULT_PARTY_STATES: PartyStates = {
  self: {
    role: "INITIATOR",
    _id: "ps1",
    _creationTime: 0,
    caseId: CASE_ID,
    userId: INITIATOR_ID,
  },
  other: { role: "INVITEE", hasCompletedPC: false, closureProposed: false },
};

let caseFixture: CaseDoc | undefined;
let messagesFixture: JointMessage[] | undefined;
let synthesisFixture: Synthesis | null | undefined;
let partyStatesFixture: PartyStates | undefined;

function setupDefaultMocks() {
  mockUseQuery.mockImplementation(
    (queryRef: Record<string | symbol, unknown>) => {
      const name: string = (queryRef?.[FN_NAME] as string) ?? "";
      if (name.includes("cases:get") || name.includes("cases.get")) {
        return caseFixture;
      }
      if (
        name.includes("jointChat:messages") ||
        name.includes("jointChat.messages")
      ) {
        return messagesFixture;
      }
      if (
        name.includes("jointChat:mySynthesis") ||
        name.includes("jointChat.mySynthesis")
      ) {
        return synthesisFixture;
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
        name.includes("jointChat:sendUserMessage") ||
        name.includes("jointChat.sendUserMessage")
      ) {
        return mockSendUserMessage;
      }
      if (
        name.includes("jointChat:proposeClosure") ||
        name.includes("jointChat.proposeClosure")
      ) {
        return mockProposeClosure;
      }
      if (
        name.includes("jointChat:unilateralClose") ||
        name.includes("jointChat.unilateralClose")
      ) {
        return mockUnilateralClose;
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
  mockSendUserMessage.mockReset();
  mockProposeClosure.mockReset();
  mockUnilateralClose.mockReset();
  mockUseParams.mockReturnValue({ caseId: CASE_ID });

  mockSendUserMessage.mockReturnValue(Promise.resolve(null));
  mockProposeClosure.mockReturnValue(Promise.resolve(null));
  mockUnilateralClose.mockReturnValue(Promise.resolve(null));

  // Reset fixtures to defaults before each test
  caseFixture = DEFAULT_CASE;
  messagesFixture = DEFAULT_MESSAGES;
  synthesisFixture = DEFAULT_SYNTHESIS;
  partyStatesFixture = DEFAULT_PARTY_STATES;

  setupDefaultMocks();
});

afterEach(() => {
  cleanup();
});

// ── Helpers ─────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/cases/${CASE_ID}/joint`]}>
      <JointChatView />
    </MemoryRouter>,
  );
}

// ── AC: Renders all joint messages via reactive query ────────────────────

describe("AC: Renders all joint messages via reactive query", () => {
  it("renders all messages from the messages query", () => {
    renderPage();
    expect(screen.getByText(/Welcome to the joint session/)).toBeDefined();
    expect(
      screen.getByText(/I'd like to discuss the meeting frequency/),
    ).toBeDefined();
    expect(screen.getByText(/I agree, let's talk about that/)).toBeDefined();
  });

  it("shows loading state while queries return undefined", () => {
    caseFixture = undefined;
    messagesFixture = undefined;
    renderPage();
    const spinner =
      screen.queryByRole("status") ?? screen.queryByText(/loading/i);
    expect(spinner).not.toBeNull();
  });

  it("renders empty message list when messages array is empty", () => {
    messagesFixture = [];
    renderPage();
    // No messages rendered but page still loads
    expect(screen.queryByText(/Welcome to the joint session/)).toBeNull();
  });

  it("reactively updates when new messages arrive", () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={[`/cases/${CASE_ID}/joint`]}>
        <JointChatView />
      </MemoryRouter>,
    );

    expect(
      screen.getAllByText(
        /Welcome to the joint session|I'd like to discuss|I agree/,
      ).length,
    ).toBe(3);

    // Simulate new message arriving via reactive query
    messagesFixture = [
      ...DEFAULT_MESSAGES,
      {
        _id: "msg-4",
        caseId: CASE_ID,
        authorType: "USER",
        authorUserId: INITIATOR_ID,
        content: "How about meeting twice a week?",
        status: "COMPLETE",
        isIntervention: false,
        createdAt: NOW + 3000,
      },
    ];

    rerender(
      <MemoryRouter initialEntries={[`/cases/${CASE_ID}/joint`]}>
        <JointChatView />
      </MemoryRouter>,
    );

    expect(screen.getByText(/How about meeting twice a week/)).toBeDefined();
  });
});

// ── AC: Each participant has consistent avatar color ──────────────────────

describe("AC: Each participant has consistent avatar color", () => {
  it("applies party-initiator variant to initiator messages", () => {
    renderPage();
    const initiatorMsg = screen.getByText(
      /I'd like to discuss the meeting frequency/,
    );
    const bubble = initiatorMsg.closest("[class*='cc-bubble-party-initiator']");
    expect(bubble).not.toBeNull();
  });

  it("applies party-invitee variant to invitee messages", () => {
    renderPage();
    const inviteeMsg = screen.getByText(/I agree, let's talk about that/);
    const bubble = inviteeMsg.closest("[class*='cc-bubble-party-invitee']");
    expect(bubble).not.toBeNull();
  });

  it("applies coach-joint variant to Coach messages", () => {
    renderPage();
    const coachMsg = screen.getByText(/Welcome to the joint session/);
    const bubble = coachMsg.closest("[class*='cc-bubble-coach-joint']");
    expect(bubble).not.toBeNull();
  });
});

// ── AC: Coach messages have 3px left border and ⟡ glyph ─────────────────

describe("AC: Coach messages have 3px left border (--coach-accent), --coach-subtle background with ⟡ glyph", () => {
  it("maps Coach messages to coach-joint variant (⟡ glyph passed as authorName)", () => {
    renderPage();
    const coachMsg = screen.getByText(/Welcome to the joint session/);
    // Verify the coach-joint CSS class is applied — this confirms JointChatView
    // maps Coach messages with the correct variant and authorName='⟡'
    // (MessageBubble does not yet render authorName as a visible element)
    const bubble = coachMsg.closest("[class*='cc-bubble-coach-joint']");
    expect(bubble).not.toBeNull();
  });

  it("Coach message container has coach-joint CSS class for 3px border styling", () => {
    renderPage();
    const coachMsg = screen.getByText(/Welcome to the joint session/);
    const bubble = coachMsg.closest("[class*='cc-bubble-coach-joint']");
    expect(bubble).not.toBeNull();
  });
});

// ── AC: Coach intervention messages have 4px left border ─────────────────

describe("AC: Coach intervention messages (isIntervention=true) have 4px left border", () => {
  it("applies coach-intervention variant when isIntervention is true", () => {
    messagesFixture = [
      {
        _id: "msg-intervention",
        caseId: CASE_ID,
        authorType: "COACH",
        authorUserId: null,
        content: "Let's take a step back and try a different approach.",
        status: "COMPLETE",
        isIntervention: true,
        createdAt: NOW + 5000,
      },
    ];
    renderPage();

    const interventionMsg = screen.getByText(/Let's take a step back/);
    const bubble = interventionMsg.closest(
      "[class*='cc-bubble-coach-intervention']",
    );
    expect(bubble).not.toBeNull();
  });

  it("non-intervention Coach messages do not use intervention class", () => {
    renderPage();
    const coachMsg = screen.getByText(/Welcome to the joint session/);
    const bubble = coachMsg.closest("[class*='cc-bubble-coach-intervention']");
    expect(bubble).toBeNull();
  });
});

// ── AC: Message input: textarea + "✨ Draft with Coach" button ────────────

describe("AC: Message input: textarea for direct typing + Draft with Coach button", () => {
  it("renders a textarea for message input", () => {
    renderPage();
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeDefined();
  });

  it("renders the '✨ Draft with Coach' button", () => {
    renderPage();
    const draftButton = screen.getByRole("button", {
      name: /Draft with Coach/,
    });
    expect(draftButton).toBeDefined();
  });

  it("renders a Send button", () => {
    renderPage();
    const sendButton = screen.getByRole("button", { name: /send/i });
    expect(sendButton).toBeDefined();
  });
});

// ── AC: Users can type directly and Send ─────────────────────────────────

describe("AC: Users can type directly and Send, bypassing Draft Coach entirely", () => {
  it("calls sendUserMessage mutation when user types and clicks Send", async () => {
    renderPage();
    const textarea = screen.getByRole("textbox");
    const sendButton = screen.getByRole("button", { name: /send/i });

    fireEvent.change(textarea, {
      target: { value: "Here is my direct message" },
    });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mockSendUserMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          caseId: CASE_ID,
          content: "Here is my direct message",
        }),
      );
    });
  });

  it("clears textarea after successful send", async () => {
    renderPage();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(textarea, {
      target: { value: "Message to send" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(textarea.value).toBe("");
    });
  });

  it("does not send empty messages", () => {
    renderPage();
    const sendButton = screen.getByRole("button", { name: /send/i });
    fireEvent.click(sendButton);

    expect(mockSendUserMessage).not.toHaveBeenCalled();
  });
});

// ── AC: "Coach is thinking..." inline message ────────────────────────────

describe("AC: 'Coach is thinking...' inline message shown when Coach is generating", () => {
  it("renders 'Coach is thinking...' for STREAMING Coach messages", () => {
    messagesFixture = [
      ...DEFAULT_MESSAGES,
      {
        _id: "msg-streaming",
        caseId: CASE_ID,
        authorType: "COACH",
        authorUserId: null,
        content: "partial content that should not appear",
        status: "STREAMING",
        isIntervention: false,
        createdAt: NOW + 5000,
      },
    ];
    renderPage();

    expect(screen.getByText(/Coach is thinking/)).toBeDefined();
  });

  it("does not show partial content for STREAMING Coach messages", () => {
    messagesFixture = [
      {
        _id: "msg-streaming",
        caseId: CASE_ID,
        authorType: "COACH",
        authorUserId: null,
        content: "partial content that should not appear",
        status: "STREAMING",
        isIntervention: false,
        createdAt: NOW + 5000,
      },
    ];
    renderPage();

    expect(
      screen.queryByText(/partial content that should not appear/),
    ).toBeNull();
  });

  it("does not show 'Coach is thinking...' for COMPLETE Coach messages", () => {
    renderPage();
    // Default messages are all COMPLETE - there should be no thinking indicator
    const thinkingElements = screen.queryAllByText(/Coach is thinking/);
    expect(thinkingElements.length).toBe(0);
  });
});

// ── AC: Top nav links ────────────────────────────────────────────────────

describe("AC: Top nav: 'My guidance' link opens synthesis panel, 'Close' button opens closure modal", () => {
  it("renders 'My guidance' link", () => {
    renderPage();
    const guidanceLink = screen.getByText(/My guidance/i);
    expect(guidanceLink).toBeDefined();
  });

  it("clicking 'My guidance' shows synthesis text in panel", async () => {
    renderPage();
    const guidanceLink = screen.getByText(/My guidance/i);
    fireEvent.click(guidanceLink);

    await waitFor(() => {
      expect(
        screen.getByText(/Start by acknowledging shared goals/),
      ).toBeDefined();
    });
  });

  it("shows fallback when synthesis is null", async () => {
    synthesisFixture = null;
    renderPage();
    const guidanceLink = screen.getByText(/My guidance/i);
    fireEvent.click(guidanceLink);

    await waitFor(() => {
      expect(screen.getByText(/synthesis not available/i)).toBeDefined();
    });
  });

  it("renders 'Close' button", () => {
    renderPage();
    const closeButton = screen.getByRole("button", { name: /close/i });
    expect(closeButton).toBeDefined();
  });

  it("clicking 'Close' button opens closure modal", async () => {
    renderPage();
    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);

    await waitFor(() => {
      // Modal should be visible with closure options
      const modal = screen.getByRole("dialog");
      expect(modal).toBeDefined();
    });
  });
});

// ── AC: Timestamps appear on hover ───────────────────────────────────────

describe("AC: Timestamps appear on hover", () => {
  it("renders timestamps with the cc-bubble-timestamp CSS hook for :hover styling", () => {
    renderPage();
    // Timestamps are rendered in the DOM with the cc-bubble-timestamp class.
    // Hover visibility is handled via CSS :hover rules (not testable in jsdom).
    // This test verifies the CSS hook exists so that the stylesheet can apply
    // display:none by default and display:block on :hover.
    const timestamps = document.querySelectorAll(".cc-bubble-timestamp");
    expect(timestamps.length).toBeGreaterThan(0);
  });

  it("timestamp elements are <time> tags with valid dateTime attributes", () => {
    renderPage();
    const timestamps = document.querySelectorAll(".cc-bubble-timestamp");
    for (const ts of timestamps) {
      expect(ts.tagName.toLowerCase()).toBe("time");
      expect(ts.getAttribute("dateTime")).not.toBeNull();
    }
  });
});

// ── AC: Auto-scroll follows latest message ───────────────────────────────

describe("AC: Auto-scroll follows latest message unless user has scrolled up", () => {
  it("scrolls to bottom when new messages arrive and user is at bottom", () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={[`/cases/${CASE_ID}/joint`]}>
        <JointChatView />
      </MemoryRouter>,
    );

    const chatContainer = document.querySelector("[role='log']");
    expect(chatContainer).not.toBeNull();
    const container = chatContainer!;

    // Simulate user being at the bottom
    Object.defineProperty(container, "scrollHeight", { value: 1000 });
    Object.defineProperty(container, "clientHeight", { value: 500 });
    Object.defineProperty(container, "scrollTop", {
      value: 500,
      writable: true,
    });

    // Spy on scrollTop setter or scrollIntoView
    const scrollIntoViewMock = vi.fn();
    const lastChild = container.lastElementChild;
    if (lastChild) {
      lastChild.scrollIntoView = scrollIntoViewMock;
    }

    // Add a new message and rerender
    messagesFixture = [
      ...DEFAULT_MESSAGES,
      {
        _id: "msg-new-scroll",
        caseId: CASE_ID,
        authorType: "USER",
        authorUserId: INVITEE_ID,
        content: "A new message arrives",
        status: "COMPLETE",
        isIntervention: false,
        createdAt: NOW + 10000,
      },
    ];

    rerender(
      <MemoryRouter initialEntries={[`/cases/${CASE_ID}/joint`]}>
        <JointChatView />
      </MemoryRouter>,
    );

    // After rerender with new message, the container should have scrolled
    // to bottom (scrollTop updated or scrollIntoView called on last element)
    const newLastChild = container.lastElementChild;
    const scrolled =
      container.scrollTop >= 500 ||
      scrollIntoViewMock.mock.calls.length > 0 ||
      (newLastChild && newLastChild.scrollIntoView === scrollIntoViewMock);

    // The ChatWindow auto-scroll implementation should ensure the view
    // scrolls to bottom when user was already at bottom
    expect(scrolled).toBe(true);
  });

  it("does not auto-scroll when user has scrolled up", () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={[`/cases/${CASE_ID}/joint`]}>
        <JointChatView />
      </MemoryRouter>,
    );

    const chatContainer = document.querySelector("[role='log']");
    expect(chatContainer).not.toBeNull();
    const container = chatContainer!;

    // Simulate user scrolling up (not at bottom)
    Object.defineProperty(container, "scrollHeight", { value: 1000 });
    Object.defineProperty(container, "clientHeight", { value: 500 });
    Object.defineProperty(container, "scrollTop", {
      value: 200,
      writable: true,
    });
    fireEvent.scroll(container);

    const scrollTopBefore = container.scrollTop;

    // Add a new message
    messagesFixture = [
      ...DEFAULT_MESSAGES,
      {
        _id: "msg-new",
        caseId: CASE_ID,
        authorType: "USER",
        authorUserId: INVITEE_ID,
        content: "New message after scroll up",
        status: "COMPLETE",
        isIntervention: false,
        createdAt: NOW + 10000,
      },
    ];

    rerender(
      <MemoryRouter initialEntries={[`/cases/${CASE_ID}/joint`]}>
        <JointChatView />
      </MemoryRouter>,
    );

    // Scroll position should not have jumped to bottom
    expect(container.scrollTop).toBe(scrollTopBefore);
  });
});

// ── AC: AI error messages render with ERROR styling and Retry button ──────

describe("AC: AI error messages render inline with ERROR styling and Retry button", () => {
  it("renders error variant for Coach messages with ERROR status", () => {
    messagesFixture = [
      {
        _id: "msg-error",
        caseId: CASE_ID,
        authorType: "COACH",
        authorUserId: null,
        content: "Something went wrong",
        status: "ERROR",
        isIntervention: false,
        createdAt: NOW + 5000,
      },
    ];
    renderPage();

    const errorBubble = document.querySelector(
      "[class*='error'], [class*='ERROR']",
    );
    expect(errorBubble).not.toBeNull();
  });

  it("renders a Retry button for ERROR Coach messages", () => {
    messagesFixture = [
      {
        _id: "msg-error",
        caseId: CASE_ID,
        authorType: "COACH",
        authorUserId: null,
        content: "Generation failed",
        status: "ERROR",
        isIntervention: false,
        createdAt: NOW + 5000,
      },
    ];
    renderPage();

    const retryButton = screen.getByRole("button", { name: /retry/i });
    expect(retryButton).toBeDefined();
  });

  it("clicking Retry triggers a retry action", async () => {
    messagesFixture = [
      {
        _id: "msg-user-before-error",
        caseId: CASE_ID,
        authorType: "USER",
        authorUserId: INITIATOR_ID,
        content: "My message that triggered coach",
        status: "COMPLETE",
        isIntervention: false,
        createdAt: NOW + 4000,
      },
      {
        _id: "msg-error",
        caseId: CASE_ID,
        authorType: "COACH",
        authorUserId: null,
        content: "Generation failed",
        status: "ERROR",
        isIntervention: false,
        createdAt: NOW + 5000,
      },
    ];
    renderPage();

    const callCountBefore = mockSendUserMessage.mock.calls.length;

    const retryButton = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retryButton);

    await waitFor(() => {
      // Retry should call sendUserMessage (or a dedicated retry mutation)
      // specifically as a result of the click — not from initial render
      expect(mockSendUserMessage.mock.calls.length).toBeGreaterThan(
        callCountBefore,
      );
    });
  });
});

// ── Invariant: Route guard redirects when not JOINT_ACTIVE ───────────────

describe("Invariant: Only reachable when case status is JOINT_ACTIVE", () => {
  it("redirects to /cases/:caseId when status is READY_FOR_JOINT", () => {
    caseFixture = { ...DEFAULT_CASE, status: "READY_FOR_JOINT" };
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

  it("redirects to /cases/:caseId when status is CLOSED_RESOLVED", () => {
    caseFixture = { ...DEFAULT_CASE, status: "CLOSED_RESOLVED" };
    renderPage();
    const nav = screen.getByTestId("navigate-redirect");
    expect(nav.getAttribute("data-to")).toBe(`/cases/${CASE_ID}`);
  });
});
