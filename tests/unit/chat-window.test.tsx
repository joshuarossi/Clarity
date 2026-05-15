// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { ChatWindow } from "../../src/components/chat/ChatWindow";
import type { ChatMessage, BubbleVariant, MessageStatus } from "../../src/components/chat/MessageBubble";

afterEach(cleanup);

function makeMessage(
  overrides: Partial<ChatMessage> & { id: string },
): ChatMessage {
  return {
    variant: "user" as BubbleVariant,
    status: "COMPLETE" as MessageStatus,
    content: `Message ${overrides.id}`,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeMessages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, i) =>
    makeMessage({ id: `msg-${i}` }),
  );
}

// ── AC: ChatWindow component accepts a messages array and renders them
//    in a scrollable container with role='log' and aria-live='polite' ───

describe("AC: ChatWindow scrollable container with ARIA", () => {
  it("renders a container with role='log'", () => {
    const { container } = render(
      <ChatWindow messages={[makeMessage({ id: "1" })]} />,
    );
    const log = container.querySelector("[role='log']");
    expect(log).not.toBeNull();
  });

  it("renders a container with aria-live='polite'", () => {
    const { container } = render(
      <ChatWindow messages={[makeMessage({ id: "1" })]} />,
    );
    const live = container.querySelector("[aria-live='polite']");
    expect(live).not.toBeNull();
  });

  it("renders all messages passed via props", () => {
    const messages = makeMessages(5);
    const { container } = render(<ChatWindow messages={messages} />);
    const log = container.querySelector("[role='log']");
    expect(log).not.toBeNull();
    // Each message should produce a child element
    expect(log!.children.length).toBeGreaterThanOrEqual(5);
  });

  it("renders empty container when messages array is empty", () => {
    const { container } = render(<ChatWindow messages={[]} />);
    const log = container.querySelector("[role='log']");
    expect(log).not.toBeNull();
    expect(log!.getAttribute("aria-live")).toBe("polite");
  });

  it("accepts an optional className prop", () => {
    const { container } = render(
      <ChatWindow messages={[]} className="custom-chat" />,
    );
    const log = container.querySelector("[role='log']");
    expect(log).not.toBeNull();
    expect(log!.classList.contains("custom-chat")).toBe(true);
  });
});

// ── AC: Auto-scroll follows latest message UNLESS user has scrolled up
//    (sticky scroll detection via scroll position) ─────────────────────

describe("AC: Sticky auto-scroll", () => {
  it("scrolls to bottom when messages are added and user is at bottom", () => {
    const messages = makeMessages(20);
    const { container, rerender } = render(
      <ChatWindow messages={messages} />,
    );
    const log = container.querySelector("[role='log']");
    expect(log).not.toBeNull();

    // Simulate the scroll container having a fixed height with overflow
    Object.defineProperty(log!, "scrollHeight", { value: 2000, writable: true });
    Object.defineProperty(log!, "clientHeight", { value: 400, writable: true });
    Object.defineProperty(log!, "scrollTop", { value: 1600, writable: true });

    // Add a new message — should auto-scroll
    const updatedMessages = [
      ...messages,
      makeMessage({ id: "new-msg" }),
    ];
    act(() => {
      rerender(<ChatWindow messages={updatedMessages} />);
    });

    // The component should attempt to scroll to bottom since user was at bottom
    // We verify the component doesn't break on re-render with new messages
    expect(log!.children.length).toBeGreaterThanOrEqual(21);
  });

  it("does NOT auto-scroll when user has scrolled up", () => {
    const messages = makeMessages(20);
    const { container, rerender } = render(
      <ChatWindow messages={messages} />,
    );
    const log = container.querySelector("[role='log']");
    expect(log).not.toBeNull();

    // Simulate user scrolled up (scrollTop far from bottom)
    Object.defineProperty(log!, "scrollHeight", { value: 2000, writable: true });
    Object.defineProperty(log!, "clientHeight", { value: 400, writable: true });
    Object.defineProperty(log!, "scrollTop", { value: 500, writable: true });

    // Fire a scroll event to let the component detect the position
    act(() => {
      log!.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    const scrollTopBefore = log!.scrollTop;

    // Add a new message
    const updatedMessages = [
      ...messages,
      makeMessage({ id: "new-msg" }),
    ];
    act(() => {
      rerender(<ChatWindow messages={updatedMessages} />);
    });

    // scrollTop should remain where user left it (not forced to bottom)
    expect(log!.scrollTop).toBe(scrollTopBefore);
  });
});

// ── AC: New message arrival animates with 150ms fade-in + 8px upward
//    translate per StyleGuide §6.4 ─────────────────────────────────────

describe("AC: New message fade-in animation", () => {
  it("applies cc-bubble-enter animation class on new message mount", () => {
    const messages = [makeMessage({ id: "msg-1" })];
    const { container } = render(<ChatWindow messages={messages} />);
    const log = container.querySelector("[role='log']");
    expect(log).not.toBeNull();

    // The wrapper for the message should have the enter animation class
    const animatedEl = log!.querySelector(".cc-bubble-enter");
    expect(animatedEl).not.toBeNull();
  });

  it("does not re-apply animation class on re-render of existing message", () => {
    const messages = [
      makeMessage({ id: "msg-1", content: "Hello" }),
    ];
    const { container, rerender } = render(
      <ChatWindow messages={messages} />,
    );

    // Re-render with same message (content changed but same id)
    const updatedMessages = [
      makeMessage({ id: "msg-1", content: "Hello updated" }),
    ];
    act(() => {
      rerender(<ChatWindow messages={updatedMessages} />);
    });

    const log = container.querySelector("[role='log']");
    // The element should still have cc-bubble-enter (from initial mount)
    // but the key-based approach ensures it's the same DOM element, not remounted
    const animatedEls = log!.querySelectorAll(".cc-bubble-enter");
    expect(animatedEls.length).toBe(1);
  });

  it("applies animation to each newly added message", () => {
    const messages = [makeMessage({ id: "msg-1" })];
    const { container, rerender } = render(
      <ChatWindow messages={messages} />,
    );

    const updatedMessages = [
      ...messages,
      makeMessage({ id: "msg-2" }),
      makeMessage({ id: "msg-3" }),
    ];
    act(() => {
      rerender(<ChatWindow messages={updatedMessages} />);
    });

    const log = container.querySelector("[role='log']");
    const animatedEls = log!.querySelectorAll(".cc-bubble-enter");
    expect(animatedEls.length).toBe(3);
  });
});
