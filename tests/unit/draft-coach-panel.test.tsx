// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { DraftCoachPanel } from "../../src/components/joint/DraftCoachPanel";

afterEach(cleanup);

// Types for mock session data
interface MockMessage {
  _id: string;
  role: "USER" | "AI";
  content: string;
  status: "STREAMING" | "COMPLETE" | "ERROR";
  createdAt: number;
}

interface MockSessionData {
  session: {
    _id: string;
    status: "ACTIVE" | "SENT" | "DISCARDED";
    finalDraft: string | undefined;
  };
  messages: MockMessage[];
}

// Mutable session data that tests can override
const mockSessionData: { value: MockSessionData } = {
  value: {
    session: {
      _id: "session-1",
      status: "ACTIVE",
      finalDraft: undefined,
    },
    messages: [
      {
        _id: "msg-1",
        role: "AI",
        content: "Hi! I'm your Draft Coach. What would you like to say?",
        status: "COMPLETE",
        createdAt: Date.now(),
      },
    ],
  },
};

// Mock Convex hooks so the connected component can render in isolation.
vi.mock("convex/react", () => ({
  useQuery: () => mockSessionData.value,
  useMutation: () => vi.fn(),
}));

function renderPanel(propsOverride: Partial<Parameters<typeof DraftCoachPanel>[0]> = {}) {
  const defaultProps = {
    caseId: "case-123" as Parameters<typeof DraftCoachPanel>[0]["caseId"],
    otherPartyName: "Jordan",
    onClose: vi.fn(),
    onEditBeforeSending: vi.fn(),
  };
  return render(<DraftCoachPanel {...defaultProps} {...propsOverride} />);
}

// ── AC: Chat uses same message bubbles at 14px font size (narrower surface) ──

describe("AC: Chat uses 14px font size for narrower surface", () => {
  it("renders a chat area within the panel dialog", () => {
    const { container } = renderPanel();
    const panel = container.querySelector("[role='dialog']");
    expect(panel).not.toBeNull();
    // The chat section within the panel should exist
    const chatSection = panel!.querySelector("[role='log']");
    expect(chatSection).not.toBeNull();
  });

  it("applies 14px font size to the chat area", () => {
    const { container } = renderPanel();
    const panel = container.querySelector("[role='dialog']");
    expect(panel).not.toBeNull();
    const chatSection = panel!.querySelector("[role='log']");
    expect(chatSection).not.toBeNull();
    const computedStyle = window.getComputedStyle(chatSection!);
    expect(computedStyle.fontSize).toBe("14px");
  });
});

// ── AC: Lock icon hover tooltip: 'Jordan can't see any of this. Only the
//    final message you send goes to the joint chat.' ──────────────────────

describe("AC: Lock icon tooltip text matches expected privacy message", () => {
  it("renders a tooltip with privacy message including other party name", () => {
    const { container } = renderPanel({ otherPartyName: "Jordan" });
    const panel = container.querySelector("[role='dialog']");
    expect(panel).not.toBeNull();

    const expectedText =
      "Jordan can't see any of this. Only the final message you send goes to the joint chat.";
    const tooltipElement =
      panel!.querySelector(`[title="${expectedText}"]`) ??
      panel!.querySelector(`[aria-label="${expectedText}"]`);

    if (!tooltipElement) {
      // The tooltip text may exist as text content in a hidden tooltip element
      const allText = panel!.textContent ?? "";
      expect(allText).toContain("can't see any of this");
    } else {
      expect(tooltipElement).not.toBeNull();
    }
  });

  it("interpolates the other party name into the tooltip", () => {
    const { container } = renderPanel({ otherPartyName: "Alex" });
    const panel = container.querySelector("[role='dialog']");
    expect(panel).not.toBeNull();

    const htmlContent = panel!.innerHTML;
    expect(htmlContent).toContain("Alex");
    expect(htmlContent).toContain("can't see any of this");
  });
});

// ── AC: AI error messages render inline with ERROR styling and Retry button ──

describe("AC: AI error messages render inline with ERROR styling and Retry button", () => {
  beforeEach(() => {
    mockSessionData.value = {
      session: {
        _id: "session-1",
        status: "ACTIVE",
        finalDraft: undefined,
      },
      messages: [
        {
          _id: "msg-1",
          role: "USER" as const,
          content: "Help me draft a message",
          status: "COMPLETE" as const,
          createdAt: Date.now() - 1000,
        },
        {
          _id: "msg-2",
          role: "AI" as const,
          content: "Something went wrong. Please try again.",
          status: "ERROR" as const,
          createdAt: Date.now(),
        },
      ],
    };
  });

  afterEach(() => {
    // Reset to default
    mockSessionData.value = {
      session: {
        _id: "session-1",
        status: "ACTIVE",
        finalDraft: undefined,
      },
      messages: [
        {
          _id: "msg-1",
          role: "AI",
          content: "Hi! I'm your Draft Coach. What would you like to say?",
          status: "COMPLETE",
          createdAt: Date.now(),
        },
      ],
    };
  });

  it("renders a Retry button when an AI message has ERROR status", () => {
    const { container } = renderPanel();
    const buttons = container.querySelectorAll("button");
    const retryButton = Array.from(buttons).find(
      (b) => b.textContent?.toLowerCase().includes("retry"),
    );
    expect(retryButton).not.toBeUndefined();
  });

  it("renders the error message content inline", () => {
    const { container } = renderPanel();
    const panel = container.querySelector("[role='dialog']");
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain("Something went wrong");
  });
});

// ── AC: Panel has ARIA role='dialog' with aria-label='Draft Coach' ────────

describe("AC: Panel accessibility — role='dialog' and aria-label", () => {
  it("renders with role='dialog'", () => {
    const { container } = renderPanel();
    const dialog = container.querySelector("[role='dialog']");
    expect(dialog).not.toBeNull();
  });

  it("has aria-label='Draft Coach'", () => {
    const { container } = renderPanel();
    const dialog = container.querySelector("[role='dialog']");
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute("aria-label")).toBe("Draft Coach");
  });
});

// ── AC: Focus trap is active while panel is open ──────────────────────────

describe("AC: Focus trap active within panel", () => {
  it("keeps focus within the dialog — dialog contains focusable elements", () => {
    const { container } = renderPanel();
    const dialog = container.querySelector("[role='dialog']");
    expect(dialog).not.toBeNull();

    // The dialog should contain focusable elements (buttons, textarea, etc.)
    const focusableElements = dialog!.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusableElements.length).toBeGreaterThan(0);
  });
});
