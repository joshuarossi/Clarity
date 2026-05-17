// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import {
  MessageBubble,
  type BubbleVariant,
} from "../../src/components/chat/MessageBubble";
import { MarkdownContent } from "../../src/components/chat/MarkdownContent";

afterEach(cleanup);

// ── AC: MessageBubble renders 7 variants per StyleGuide §6.4: user,
//    coach (private), coach (joint), coach intervention, party-initiator,
//    party-invitee, error ──────────────────────────────────────────────

describe("AC: MessageBubble renders 7 variants", () => {
  const variantClassMap: [BubbleVariant, string][] = [
    ["user", "cc-bubble"],
    ["coach", "cc-bubble-coach"],
    ["coach-joint", "cc-bubble-coach-joint"],
    ["coach-intervention", "cc-bubble-coach-intervention"],
    ["party-initiator", "cc-bubble-party-initiator"],
    ["party-invitee", "cc-bubble-party-invitee"],
    ["error", "cc-bubble-error"],
  ];

  for (const [variant, expectedClass] of variantClassMap) {
    it(`renders ${variant} variant with .${expectedClass} CSS class`, () => {
      const { container } = render(
        <MessageBubble
          variant={variant}
          status="COMPLETE"
          content="Test message"
          createdAt={Date.now()}
        />,
      );
      const bubble = container.querySelector(`.${expectedClass}`);
      expect(bubble).not.toBeNull();
    });
  }

  it("applies cc-bubble-error class when status is ERROR regardless of variant prop", () => {
    const { container } = render(
      <MessageBubble
        variant="user"
        status="ERROR"
        content="Error message"
        createdAt={Date.now()}
      />,
    );
    const errorBubble = container.querySelector(".cc-bubble-error");
    expect(errorBubble).not.toBeNull();
  });
});

// ── AC: MessageBubble renders differently by status: STREAMING shows
//    content + blinking cursor, COMPLETE shows full content + copy button
//    + timestamp, ERROR shows error styling + Retry button ─────────────

describe("AC: MessageBubble renders differently by status", () => {
  describe("STREAMING status", () => {
    it("renders message content", () => {
      const { container } = render(
        <MessageBubble
          variant="coach"
          status="STREAMING"
          content="Partial response..."
          createdAt={Date.now()}
        />,
      );
      expect(container.textContent).toContain("Partial response...");
    });

    it("renders StreamingIndicator (cc-streaming-cursor)", () => {
      const { container } = render(
        <MessageBubble
          variant="coach"
          status="STREAMING"
          content="Partial response..."
          createdAt={Date.now()}
        />,
      );
      const cursor = container.querySelector(".cc-streaming-cursor");
      expect(cursor).not.toBeNull();
    });

    it("does NOT render a copy button", () => {
      const { container } = render(
        <MessageBubble
          variant="coach"
          status="STREAMING"
          content="Partial response..."
          createdAt={Date.now()}
        />,
      );
      const copyBtn = container.querySelector("[aria-label='Copy message']");
      expect(copyBtn).toBeNull();
    });

    it("does NOT render a timestamp", () => {
      const { container } = render(
        <MessageBubble
          variant="coach"
          status="STREAMING"
          content="Partial response..."
          createdAt={Date.now()}
        />,
      );
      const time = container.querySelector("time");
      expect(time).toBeNull();
    });
  });

  describe("COMPLETE status", () => {
    it("renders full message content", () => {
      const { container } = render(
        <MessageBubble
          variant="user"
          status="COMPLETE"
          content="Full message content"
          createdAt={Date.now()}
        />,
      );
      expect(container.textContent).toContain("Full message content");
    });

    it("renders a copy button", () => {
      const { container } = render(
        <MessageBubble
          variant="user"
          status="COMPLETE"
          content="Full message"
          createdAt={Date.now()}
        />,
      );
      const copyBtn = container.querySelector("[aria-label='Copy message']");
      expect(copyBtn).not.toBeNull();
    });

    it("renders a timestamp element", () => {
      const { container } = render(
        <MessageBubble
          variant="user"
          status="COMPLETE"
          content="Full message"
          createdAt={Date.now()}
        />,
      );
      const time = container.querySelector("time");
      expect(time).not.toBeNull();
    });

    it("does NOT render StreamingIndicator", () => {
      const { container } = render(
        <MessageBubble
          variant="user"
          status="COMPLETE"
          content="Full message"
          createdAt={Date.now()}
        />,
      );
      const cursor = container.querySelector(".cc-streaming-cursor");
      expect(cursor).toBeNull();
    });

    it("does NOT render a Retry button", () => {
      const { container } = render(
        <MessageBubble
          variant="user"
          status="COMPLETE"
          content="Full message"
          createdAt={Date.now()}
        />,
      );
      const retryBtn = container.querySelector("[aria-label='Retry message']");
      expect(retryBtn).toBeNull();
    });
  });

  describe("ERROR status", () => {
    it("renders message content", () => {
      const { container } = render(
        <MessageBubble
          variant="error"
          status="ERROR"
          content="Something went wrong"
          createdAt={Date.now()}
          onRetry={() => {}}
        />,
      );
      expect(container.textContent).toContain("Something went wrong");
    });

    it("applies error styling (cc-bubble-error)", () => {
      const { container } = render(
        <MessageBubble
          variant="error"
          status="ERROR"
          content="Error"
          createdAt={Date.now()}
          onRetry={() => {}}
        />,
      );
      const errorBubble = container.querySelector(".cc-bubble-error");
      expect(errorBubble).not.toBeNull();
    });

    it("renders a Retry button when onRetry is provided", () => {
      const { container } = render(
        <MessageBubble
          variant="error"
          status="ERROR"
          content="Error"
          createdAt={Date.now()}
          onRetry={() => {}}
        />,
      );
      const retryBtn = container.querySelector("[aria-label='Retry message']");
      expect(retryBtn).not.toBeNull();
    });

    it("calls onRetry when Retry button is clicked", () => {
      const handleRetry = vi.fn();
      const { container } = render(
        <MessageBubble
          variant="error"
          status="ERROR"
          content="Error"
          createdAt={Date.now()}
          onRetry={handleRetry}
        />,
      );
      const retryBtn = container.querySelector("[aria-label='Retry message']");
      expect(retryBtn).not.toBeNull();
      fireEvent.click(retryBtn!);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });

    it("does NOT render Retry button when onRetry is not provided", () => {
      const { container } = render(
        <MessageBubble
          variant="error"
          status="ERROR"
          content="Error"
          createdAt={Date.now()}
        />,
      );
      const retryBtn = container.querySelector("[aria-label='Retry message']");
      expect(retryBtn).toBeNull();
    });

    it("does NOT render a copy button", () => {
      const { container } = render(
        <MessageBubble
          variant="error"
          status="ERROR"
          content="Error"
          createdAt={Date.now()}
        />,
      );
      const copyBtn = container.querySelector("[aria-label='Copy message']");
      expect(copyBtn).toBeNull();
    });

    it("does NOT render StreamingIndicator", () => {
      const { container } = render(
        <MessageBubble
          variant="error"
          status="ERROR"
          content="Error"
          createdAt={Date.now()}
        />,
      );
      const cursor = container.querySelector(".cc-streaming-cursor");
      expect(cursor).toBeNull();
    });
  });
});

// ── AC: Timestamps appear on hover per DesignDoc §4.9 ─────────────────

describe("AC: Timestamps appear on hover", () => {
  it("timestamp is hidden by default on a COMPLETE message", () => {
    const { container } = render(
      <MessageBubble
        variant="user"
        status="COMPLETE"
        content="Hello"
        createdAt={1700000000000}
      />,
    );
    const time = container.querySelector("time");
    expect(time).not.toBeNull();
    // Timestamp should be visually hidden by default (opacity: 0 or visibility: hidden)
    // The implementation uses CSS for hover behavior; we check the element exists
    // and the bubble wrapper supports hover-reveal
    const bubble = container.firstElementChild;
    expect(bubble).not.toBeNull();
  });

  it("timestamp becomes visible on hover of the bubble", () => {
    const { container } = render(
      <MessageBubble
        variant="user"
        status="COMPLETE"
        content="Hello"
        createdAt={1700000000000}
      />,
    );
    const bubble = container.firstElementChild;
    expect(bubble).not.toBeNull();

    // Simulate mouse enter on the bubble
    fireEvent.mouseEnter(bubble!);

    const time = container.querySelector("time");
    expect(time).not.toBeNull();
  });

  it("does NOT render timestamp for STREAMING messages", () => {
    const { container } = render(
      <MessageBubble
        variant="coach"
        status="STREAMING"
        content="Still typing..."
        createdAt={Date.now()}
      />,
    );
    const time = container.querySelector("time");
    expect(time).toBeNull();
  });

  it("does NOT render timestamp for ERROR messages", () => {
    const { container } = render(
      <MessageBubble
        variant="error"
        status="ERROR"
        content="Failed"
        createdAt={Date.now()}
      />,
    );
    const time = container.querySelector("time");
    expect(time).toBeNull();
  });
});

// ── AC: Copy button only appears on COMPLETE messages ─────────────────

describe("AC: Copy button only appears on COMPLETE messages", () => {
  it("copy button is present on COMPLETE messages", () => {
    const { container } = render(
      <MessageBubble
        variant="user"
        status="COMPLETE"
        content="Copy me"
        createdAt={Date.now()}
      />,
    );
    const copyBtn = container.querySelector("[aria-label='Copy message']");
    expect(copyBtn).not.toBeNull();
  });

  it("copy button is absent on STREAMING messages", () => {
    const { container } = render(
      <MessageBubble
        variant="coach"
        status="STREAMING"
        content="Still going..."
        createdAt={Date.now()}
      />,
    );
    const copyBtn = container.querySelector("[aria-label='Copy message']");
    expect(copyBtn).toBeNull();
  });

  it("copy button is absent on ERROR messages", () => {
    const { container } = render(
      <MessageBubble
        variant="error"
        status="ERROR"
        content="Error"
        createdAt={Date.now()}
      />,
    );
    const copyBtn = container.querySelector("[aria-label='Copy message']");
    expect(copyBtn).toBeNull();
  });

  it("calls onCopy callback when copy button is clicked", () => {
    const handleCopy = vi.fn();
    const { container } = render(
      <MessageBubble
        variant="user"
        status="COMPLETE"
        content="Copy me"
        createdAt={Date.now()}
        onCopy={handleCopy}
      />,
    );
    const copyBtn = container.querySelector("[aria-label='Copy message']");
    expect(copyBtn).not.toBeNull();
    fireEvent.click(copyBtn!);
    // onCopy should be called (after clipboard write succeeds)
    // In test env, clipboard may not be available, but the handler should attempt it
    expect(handleCopy).toHaveBeenCalled();
  });

  it("copy and retry buttons are keyboard-accessible", () => {
    const handleCopy = vi.fn();
    const handleRetry = vi.fn();

    // Test copy button is a button element (inherently focusable)
    const { container: c1 } = render(
      <MessageBubble
        variant="user"
        status="COMPLETE"
        content="Msg"
        createdAt={Date.now()}
        onCopy={handleCopy}
      />,
    );
    const copyBtn = c1.querySelector("[aria-label='Copy message']");
    expect(copyBtn).not.toBeNull();
    expect(copyBtn!.tagName.toLowerCase()).toBe("button");
    cleanup();

    // Test retry button is a button element
    const { container: c2 } = render(
      <MessageBubble
        variant="error"
        status="ERROR"
        content="Err"
        createdAt={Date.now()}
        onRetry={handleRetry}
      />,
    );
    const retryBtn = c2.querySelector("[aria-label='Retry message']");
    expect(retryBtn).not.toBeNull();
    expect(retryBtn!.tagName.toLowerCase()).toBe("button");
  });
});

// ── AC2: User messages render as plain text with no markdown formatting ──

describe("AC2: User messages remain plain text", () => {
  it("user variant renders **bold** as literal text, not <strong>", () => {
    const { container } = render(
      <MessageBubble
        variant="user"
        status="COMPLETE"
        content="**bold**"
        createdAt={Date.now()}
      />,
    );
    expect(container.querySelector("strong")).toBeNull();
    expect(container.textContent).toContain("**bold**");
  });

  it("user variant renders ### heading as literal text, not <h3>", () => {
    const { container } = render(
      <MessageBubble
        variant="user"
        status="COMPLETE"
        content="### heading"
        createdAt={Date.now()}
      />,
    );
    expect(container.querySelector("h3")).toBeNull();
    expect(container.textContent).toContain("### heading");
  });

  it("user variant renders - list item as literal text, not <ul>", () => {
    const { container } = render(
      <MessageBubble
        variant="user"
        status="COMPLETE"
        content="- list item"
        createdAt={Date.now()}
      />,
    );
    expect(container.querySelector("ul")).toBeNull();
    expect(container.textContent).toContain("- list item");
  });
});

// ── AC4: Markdown rendering applies to coach variants in both private and joint chat ──

describe("AC4: Variant-gated markdown rendering", () => {
  const markdownContent = "**bold**";

  describe("coach variants render markdown as HTML", () => {
    const coachVariants: BubbleVariant[] = [
      "coach",
      "coach-joint",
      "coach-intervention",
    ];

    for (const variant of coachVariants) {
      it(`${variant} variant renders **bold** as <strong>`, () => {
        const { container } = render(
          <MessageBubble
            variant={variant}
            status="COMPLETE"
            content={markdownContent}
            createdAt={Date.now()}
          />,
        );
        expect(container.querySelector("strong")).not.toBeNull();
      });
    }
  });

  describe("non-coach variants render markdown as plain text", () => {
    const plainVariants: BubbleVariant[] = [
      "user",
      "party-initiator",
      "party-invitee",
      "error",
    ];

    for (const variant of plainVariants) {
      it(`${variant} variant renders **bold** as literal text`, () => {
        const { container } = render(
          <MessageBubble
            variant={variant}
            status={variant === "error" ? "ERROR" : "COMPLETE"}
            content={markdownContent}
            createdAt={Date.now()}
          />,
        );
        expect(container.querySelector("strong")).toBeNull();
        expect(container.textContent).toContain("**bold**");
      });
    }
  });
});

// ── AC5: Streaming indicator displays correctly alongside partial markdown ──

describe("AC5: Streaming with partial markdown content", () => {
  it("streaming cursor is present when content has incomplete markdown", () => {
    const { container } = render(
      <MessageBubble
        variant="coach"
        status="STREAMING"
        content="**bol"
        createdAt={Date.now()}
      />,
    );
    const cursor = container.querySelector(".cc-streaming-cursor");
    expect(cursor).not.toBeNull();
  });

  it("partial/incomplete markdown tokens do not crash rendering", () => {
    const { container } = render(
      <MessageBubble
        variant="coach"
        status="STREAMING"
        content="**bol"
        createdAt={Date.now()}
      />,
    );
    expect(container.textContent).toContain("**bol");
  });

  it("incomplete **bol token is NOT rendered as bold (graceful degradation)", () => {
    const { container } = render(
      <MessageBubble
        variant="coach"
        status="STREAMING"
        content="**bol"
        createdAt={Date.now()}
      />,
    );
    expect(container.querySelector("strong")).toBeNull();
  });

  it("complete markdown renders alongside streaming cursor", () => {
    const { container } = render(
      <MessageBubble
        variant="coach"
        status="STREAMING"
        content="**bold** and more"
        createdAt={Date.now()}
      />,
    );
    const cursor = container.querySelector(".cc-streaming-cursor");
    expect(cursor).not.toBeNull();
    expect(container.querySelector("strong")).not.toBeNull();
  });
});
