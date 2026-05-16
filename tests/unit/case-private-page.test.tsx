// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  cleanup,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { CasePrivatePage } from "../../src/routes/CasePrivatePage";

// ── Hoisted mocks ───────────────────────────────────────────────────────

const {
  mockNavigate,
  mockUseQuery,
  mockUseMutation,
  mockUseParams,
  mockSendUserMessage,
  mockMarkComplete,
  mockRetryLastAIResponse,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseQuery: vi.fn(),
  mockUseMutation: vi.fn(),
  mockUseParams: vi.fn(() => ({ caseId: "case-abc123" })),
  mockSendUserMessage: vi.fn(() => Promise.resolve(null)),
  mockMarkComplete: vi.fn(() =>
    Promise.resolve({ synthesisScheduled: false }),
  ),
  mockRetryLastAIResponse: vi.fn(() => Promise.resolve(null)),
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
  };
});

// ── Import MemoryRouter after mocks ─────────────────────────────────────
import { MemoryRouter } from "react-router-dom";

// ── Fixture types ───────────────────────────────────────────────────────

interface PrivateMessage {
  _id: string;
  role: "USER" | "AI";
  content: string;
  status: "STREAMING" | "COMPLETE" | "ERROR";
  createdAt: number;
  userId: string;
}

interface CaseDoc {
  _id: string;
  status: string;
  initiatorUserId: string;
  inviteeUserId: string | null;
}

interface PartyStates {
  self: {
    privateCoachingCompletedAt: number | null;
  };
  other: {
    role: string;
    hasCompletedPC: boolean;
  } | null;
}

interface OtherPartyName {
  displayName: string | null;
}

// ── Fixture data ────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;
const CASE_ID = "case-abc123";
const USER_ID = "user-me";

const DEFAULT_CASE: CaseDoc = {
  _id: CASE_ID,
  status: "BOTH_PRIVATE_COACHING",
  initiatorUserId: USER_ID,
  inviteeUserId: "user-jordan",
};

const DEFAULT_PARTY_STATES: PartyStates = {
  self: { privateCoachingCompletedAt: null },
  other: { role: "invitee", hasCompletedPC: false },
};

const DEFAULT_OTHER_PARTY_NAME: OtherPartyName = {
  displayName: "Jordan",
};

const USER_MSG: PrivateMessage = {
  _id: "msg-1",
  role: "USER",
  content: "I feel frustrated about the situation.",
  status: "COMPLETE",
  createdAt: NOW - 60_000,
  userId: USER_ID,
};

const AI_MSG_COMPLETE: PrivateMessage = {
  _id: "msg-2",
  role: "AI",
  content: "I hear you. Can you tell me more about what frustrates you?",
  status: "COMPLETE",
  createdAt: NOW - 30_000,
  userId: USER_ID,
};

const AI_MSG_STREAMING: PrivateMessage = {
  _id: "msg-3",
  role: "AI",
  content: "Let me help you think through",
  status: "STREAMING",
  createdAt: NOW - 5_000,
  userId: USER_ID,
};

const AI_MSG_ERROR: PrivateMessage = {
  _id: "msg-4",
  role: "AI",
  content: "",
  status: "ERROR",
  createdAt: NOW - 5_000,
  userId: USER_ID,
};

// ── Mock query/mutation routing ─────────────────────────────────────────

const FN_NAME = Symbol.for("functionName");

let messagesFixture: PrivateMessage[] | undefined;
let caseFixture: CaseDoc | undefined;
let partyStatesFixture: PartyStates | undefined;
let otherPartyNameFixture: OtherPartyName | undefined;

function setupDefaultMocks() {
  messagesFixture = [USER_MSG, AI_MSG_COMPLETE];
  caseFixture = DEFAULT_CASE;
  partyStatesFixture = DEFAULT_PARTY_STATES;
  otherPartyNameFixture = DEFAULT_OTHER_PARTY_NAME;

  mockUseQuery.mockImplementation(
    (queryRef: Record<string | symbol, unknown>) => {
      const name: string = (queryRef?.[FN_NAME] as string) ?? "";
      if (
        name.includes("privateCoaching:myMessages") ||
        name.includes("privateCoaching.myMessages")
      ) {
        return messagesFixture;
      }
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
        name.includes("cases:otherPartyName") ||
        name.includes("cases.otherPartyName")
      ) {
        return otherPartyNameFixture;
      }
      return undefined;
    },
  );

  mockUseMutation.mockImplementation(
    (mutationRef: Record<string | symbol, unknown>) => {
      const name: string = (mutationRef?.[FN_NAME] as string) ?? "";
      if (
        name.includes("privateCoaching:sendUserMessage") ||
        name.includes("privateCoaching.sendUserMessage")
      ) {
        return mockSendUserMessage;
      }
      if (
        name.includes("privateCoaching:markComplete") ||
        name.includes("privateCoaching.markComplete")
      ) {
        return mockMarkComplete;
      }
      if (
        name.includes("privateCoaching:retryLastAIResponse") ||
        name.includes("privateCoaching.retryLastAIResponse")
      ) {
        return mockRetryLastAIResponse;
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
  mockMarkComplete.mockReset();
  mockRetryLastAIResponse.mockReset();
  mockUseParams.mockReturnValue({ caseId: CASE_ID });

  mockSendUserMessage.mockReturnValue(Promise.resolve(null));
  mockMarkComplete.mockReturnValue(
    Promise.resolve({ synthesisScheduled: false }),
  );
  mockRetryLastAIResponse.mockReturnValue(Promise.resolve(null));

  setupDefaultMocks();
});

afterEach(() => {
  cleanup();
});

// ── Helpers ─────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/cases/${CASE_ID}/private`]}>
      <CasePrivatePage />
    </MemoryRouter>,
  );
}

// ── AC 1: Privacy banner ────────────────────────────────────────────────

describe("AC: Privacy banner at top with other party name", () => {
  it("renders privacy banner text including other party name", () => {
    renderPage();
    expect(
      screen.getByText(/jordan will never see any of it/i),
    ).toBeDefined();
  });

  it("renders the lock icon button for learning more about privacy", () => {
    renderPage();
    const lockButton = screen.getByLabelText(/learn more about privacy/i);
    expect(lockButton).toBeDefined();
  });

  it("uses generic fallback when other party name is null", () => {
    otherPartyNameFixture = { displayName: null };
    renderPage();
    expect(
      screen.getByText(/the other party will never see any of it/i),
    ).toBeDefined();
  });
});

// ── AC 2: Coach messages styling ────────────────────────────────────────

describe("AC: Coach messages rendered in --accent-subtle bubbles, left-aligned, with Sparkles icon", () => {
  it("renders AI message with coach bubble styling", () => {
    renderPage();
    const bubble = screen.getByText(AI_MSG_COMPLETE.content).closest("[class]");
    expect(bubble).not.toBeNull();
    // MessageBubble applies cc-bubble-coach class for variant "coach"
    expect(bubble!.className).toMatch(/cc-bubble-coach/);
  });

  it("renders AI message with COMPLETE status data attribute", () => {
    renderPage();
    const bubble = screen.getByText(AI_MSG_COMPLETE.content).closest(
      "[data-status]",
    );
    expect(bubble).not.toBeNull();
    expect(bubble!.getAttribute("data-status")).toBe("COMPLETE");
  });
});

// ── AC 3: User messages styling ─────────────────────────────────────────

describe("AC: User messages rendered in --bg-surface bubbles, right-aligned", () => {
  it("renders user message with user bubble styling", () => {
    renderPage();
    const bubble = screen.getByText(USER_MSG.content).closest("[class]");
    expect(bubble).not.toBeNull();
    // MessageBubble applies cc-bubble class for variant "user"
    expect(bubble!.className).toMatch(/cc-bubble(?!\S)/);
  });
});

// ── AC 4: Streaming behavior ────────────────────────────────────────────

describe("AC: Streaming behavior — blinking cursor while STREAMING, copy button only after COMPLETE", () => {
  it("shows streaming indicator when message status is STREAMING", () => {
    messagesFixture = [USER_MSG, AI_MSG_STREAMING];
    const { container } = renderPage();
    // StreamingIndicator renders a blinking cursor element
    const streamingEl =
      container.querySelector("[data-status='STREAMING']");
    expect(streamingEl).not.toBeNull();
  });

  it("does not show copy button on STREAMING message", () => {
    messagesFixture = [USER_MSG, AI_MSG_STREAMING];
    renderPage();
    // The STREAMING message bubble should not have a Copy button
    const streamingBubble = screen
      .getByText(AI_MSG_STREAMING.content)
      .closest("[data-status]");
    expect(streamingBubble).not.toBeNull();
    const copyButton = streamingBubble!.querySelector(
      "button[aria-label*='opy' i]",
    );
    expect(copyButton).toBeNull();
  });

  it("shows copy button on COMPLETE AI message", () => {
    messagesFixture = [USER_MSG, AI_MSG_COMPLETE];
    renderPage();
    const completeBubble = screen
      .getByText(AI_MSG_COMPLETE.content)
      .closest("[data-status]");
    expect(completeBubble).not.toBeNull();
    const copyButton = completeBubble!.querySelector("button");
    expect(copyButton).not.toBeNull();
    expect(copyButton!.textContent?.toLowerCase()).toContain("copy");
  });
});

// ── AC 5: Input behavior ────────────────────────────────────────────────

describe("AC: Input — Shift+Enter for newline, Enter to send, Send disabled while AI responding", () => {
  it("sends message when Enter is pressed with text", async () => {
    renderPage();
    const textarea = screen.getByRole("textbox", { name: /message input/i });
    expect(textarea).toBeDefined();

    fireEvent.change(textarea, {
      target: { value: "My thoughts on this" },
    });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(mockSendUserMessage).toHaveBeenCalledTimes(1);
    });
  });

  it("does not send on Shift+Enter (inserts newline)", () => {
    renderPage();
    const textarea = screen.getByRole("textbox", { name: /message input/i });

    fireEvent.change(textarea, { target: { value: "Line 1" } });
    fireEvent.keyDown(textarea, {
      key: "Enter",
      code: "Enter",
      shiftKey: true,
    });

    expect(mockSendUserMessage).not.toHaveBeenCalled();
  });

  it("disables Send button while AI is responding (STREAMING)", () => {
    messagesFixture = [USER_MSG, AI_MSG_STREAMING];
    renderPage();
    const sendButton = screen.getByRole("button", { name: /send/i });
    expect(sendButton).toBeDefined();
    expect((sendButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps textarea enabled while AI is responding", () => {
    messagesFixture = [USER_MSG, AI_MSG_STREAMING];
    renderPage();
    const textarea = screen.getByRole("textbox", { name: /message input/i });
    expect((textarea as HTMLTextAreaElement).disabled).toBe(false);
  });
});

// ── AC 6: Mark complete CTA ─────────────────────────────────────────────

describe("AC: 'Mark private coaching complete' is a footer CTA, not a prominent button", () => {
  it("renders 'Mark private coaching complete' text", () => {
    renderPage();
    expect(
      screen.getByText(/mark private coaching complete/i),
    ).toBeDefined();
  });

  it("uses ghost or secondary button styling (not primary)", () => {
    renderPage();
    const cta = screen.getByText(/mark private coaching complete/i).closest(
      "button",
    );
    expect(cta).not.toBeNull();
    // Should NOT have primary styling
    expect(cta!.className).not.toMatch(/cc-btn-primary/);
  });
});

// ── AC 7: Confirmation dialog ───────────────────────────────────────────

describe("AC: Mark Complete opens confirmation dialog with message count and party name", () => {
  it("opens confirmation dialog when mark-complete CTA is clicked", async () => {
    renderPage();
    const cta = screen
      .getByText(/mark private coaching complete/i)
      .closest("button");
    expect(cta).not.toBeNull();

    fireEvent.click(cta!);

    await waitFor(() => {
      // Dialog should mention message count — 1 USER message in default fixtures
      expect(
        screen.getByText(/you.?ve had 1 message/i),
      ).toBeDefined();
    });
  });

  it("dialog includes other party name", async () => {
    renderPage();
    const cta = screen
      .getByText(/mark private coaching complete/i)
      .closest("button");
    fireEvent.click(cta!);

    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(
        within(dialog).getByText(/joint session with jordan/i),
      ).toBeDefined();
    });
  });

  it("dialog has 'Continue Coaching' and 'Mark Complete' buttons", async () => {
    renderPage();
    const cta = screen
      .getByText(/mark private coaching complete/i)
      .closest("button");
    fireEvent.click(cta!);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /continue coaching/i }),
      ).toBeDefined();
      expect(
        screen.getByRole("button", { name: /mark complete/i }),
      ).toBeDefined();
    });
  });

  it("'Continue Coaching' closes dialog without calling mutation", async () => {
    renderPage();
    const cta = screen
      .getByText(/mark private coaching complete/i)
      .closest("button");
    fireEvent.click(cta!);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /continue coaching/i }),
      ).toBeDefined();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /continue coaching/i }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /continue coaching/i }),
      ).toBeNull();
    });

    expect(mockMarkComplete).not.toHaveBeenCalled();
  });

  it("'Mark Complete' button calls markComplete mutation", async () => {
    renderPage();
    const cta = screen
      .getByText(/mark private coaching complete/i)
      .closest("button");
    fireEvent.click(cta!);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /mark complete/i }),
      ).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /mark complete/i }));

    await waitFor(() => {
      expect(mockMarkComplete).toHaveBeenCalledWith({ caseId: CASE_ID });
    });
  });

  it("shows correct message count with multiple user messages", async () => {
    const secondUserMsg: PrivateMessage = {
      _id: "msg-5",
      role: "USER",
      content: "Another thought",
      status: "COMPLETE",
      createdAt: NOW - 10_000,
      userId: USER_ID,
    };
    messagesFixture = [USER_MSG, AI_MSG_COMPLETE, secondUserMsg];
    renderPage();

    const cta = screen
      .getByText(/mark private coaching complete/i)
      .closest("button");
    fireEvent.click(cta!);

    await waitFor(() => {
      expect(screen.getByText(/you.?ve had 2 messages/i)).toBeDefined();
    });
  });
});

// ── AC 8: Read-only state after marking complete ────────────────────────

describe("AC: After marking complete, view shows read-only state with status message", () => {
  beforeEach(() => {
    partyStatesFixture = {
      self: { privateCoachingCompletedAt: NOW },
      other: { role: "invitee", hasCompletedPC: false },
    };
  });

  it("does not render message input when private coaching is completed", () => {
    renderPage();
    const textarea = screen.queryByRole("textbox", {
      name: /message input/i,
    });
    expect(textarea).toBeNull();
  });

  it("does not render mark-complete footer when completed", () => {
    renderPage();
    expect(
      screen.queryByText(/mark private coaching complete/i),
    ).toBeNull();
  });

  it("shows a read-only status message", () => {
    renderPage();
    expect(
      screen.getByText(/completed private coaching/i),
    ).toBeDefined();
  });

  it("still renders existing chat messages in read-only state", () => {
    renderPage();
    expect(screen.getByText(USER_MSG.content)).toBeDefined();
    expect(screen.getByText(AI_MSG_COMPLETE.content)).toBeDefined();
  });

  it("shows 'both complete' message when other party also completed", () => {
    partyStatesFixture = {
      self: { privateCoachingCompletedAt: NOW },
      other: { role: "invitee", hasCompletedPC: true },
    };
    renderPage();
    expect(
      screen.getByText(/both parties have completed/i),
    ).toBeDefined();
  });
});

// ── AC 9: Reactive subscription ─────────────────────────────────────────

describe("AC: Subscribes to privateCoaching/myMessages reactive query; updates in real time", () => {
  it("renders new messages when query data updates", () => {
    messagesFixture = [USER_MSG];
    const { rerender } = renderPage();

    expect(screen.getByText(USER_MSG.content)).toBeDefined();
    expect(screen.queryByText(AI_MSG_COMPLETE.content)).toBeNull();

    // Simulate reactive update — query now returns an additional message
    messagesFixture = [USER_MSG, AI_MSG_COMPLETE];

    rerender(
      <MemoryRouter initialEntries={[`/cases/${CASE_ID}/private`]}>
        <CasePrivatePage />
      </MemoryRouter>,
    );

    expect(screen.getByText(AI_MSG_COMPLETE.content)).toBeDefined();
  });
});

// ── AC 10: AI error messages ────────────────────────────────────────────

describe("AC: AI error messages render inline with ERROR styling and Retry button", () => {
  beforeEach(() => {
    messagesFixture = [USER_MSG, AI_MSG_ERROR];
  });

  it("renders error message with error styling", () => {
    const { container } = renderPage();
    const errorBubble = container.querySelector("[data-status='ERROR']");
    expect(errorBubble).not.toBeNull();
    expect(errorBubble!.className).toMatch(/cc-bubble-error/);
  });

  it("renders a Retry button on error message", () => {
    renderPage();
    const retryButton = screen.getByRole("button", { name: /retry/i });
    expect(retryButton).toBeDefined();
  });

  it("calls retryLastAIResponse mutation when Retry is clicked", async () => {
    renderPage();
    const retryButton = screen.getByRole("button", { name: /retry/i });

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(mockRetryLastAIResponse).toHaveBeenCalledWith({
        caseId: CASE_ID,
      });
    });
  });

  it("shows fallback text when error message content is empty", () => {
    renderPage();
    // The bubble should show a fallback message for empty-content ERROR
    expect(
      screen.getByText(/encountered an error/i),
    ).toBeDefined();
  });
});

// ── Edge: Phase gating (read-only for non-PC statuses) ──────────────────

describe("Edge: Phase gating — read-only when case is not in private coaching phase", () => {
  it("renders read-only when case status is READY_FOR_JOINT", () => {
    caseFixture = { ...DEFAULT_CASE, status: "READY_FOR_JOINT" };
    renderPage();

    expect(
      screen.queryByRole("textbox", { name: /message input/i }),
    ).toBeNull();
    expect(
      screen.queryByText(/mark private coaching complete/i),
    ).toBeNull();
  });

  it("still shows chat history in read-only phase-gated state", () => {
    caseFixture = { ...DEFAULT_CASE, status: "READY_FOR_JOINT" };
    renderPage();
    expect(screen.getByText(USER_MSG.content)).toBeDefined();
  });
});

// ── Edge: Loading state ─────────────────────────────────────────────────

describe("Edge: Loading state while queries return undefined", () => {
  it("renders a loading indicator when messages query returns undefined", () => {
    messagesFixture = undefined;
    const { container } = renderPage();

    const spinner =
      container.querySelector("[role='status']") ??
      container.querySelector(".animate-spin") ??
      screen.queryByText(/loading/i);
    expect(spinner).not.toBeNull();
  });
});
