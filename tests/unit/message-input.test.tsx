// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { MessageInput } from "../../src/components/chat/MessageInput";

afterEach(cleanup);

// ── AC: MessageInput implements Enter-to-send, Shift-Enter for newline,
//    Send button disabled while AI is responding, textarea enabled for
//    pre-typing ────────────────────────────────────────────────────────

describe("AC: MessageInput Enter-to-send and Shift-Enter for newline", () => {
  it("calls onSend with trimmed text when Enter is pressed", () => {
    const handleSend = vi.fn();
    const { container } = render(<MessageInput onSend={handleSend} />);
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    // Type text into the textarea
    fireEvent.change(textarea!, { target: { value: "Hello world" } });
    // Press Enter
    fireEvent.keyDown(textarea!, { key: "Enter", code: "Enter" });

    expect(handleSend).toHaveBeenCalledTimes(1);
    expect(handleSend).toHaveBeenCalledWith("Hello world");
  });

  it("clears textarea after sending", () => {
    const handleSend = vi.fn();
    const { container } = render(<MessageInput onSend={handleSend} />);
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    fireEvent.change(textarea!, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea!, { key: "Enter", code: "Enter" });

    expect(handleSend).toHaveBeenCalledTimes(1);
    // After send, textarea value should be cleared
    expect(textarea!.value).toBe("");
  });

  it("inserts newline on Shift+Enter (does not send)", () => {
    const handleSend = vi.fn();
    const { container } = render(<MessageInput onSend={handleSend} />);
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    fireEvent.change(textarea!, { target: { value: "Line 1" } });
    // Press Shift+Enter — should NOT trigger send
    fireEvent.keyDown(textarea!, {
      key: "Enter",
      code: "Enter",
      shiftKey: true,
    });

    expect(handleSend).not.toHaveBeenCalled();
  });

  it("does NOT call onSend when textarea is empty", () => {
    const handleSend = vi.fn();
    const { container } = render(<MessageInput onSend={handleSend} />);
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    // Press Enter with empty input
    fireEvent.keyDown(textarea!, { key: "Enter", code: "Enter" });

    expect(handleSend).not.toHaveBeenCalled();
  });

  it("does NOT call onSend when textarea contains only whitespace", () => {
    const handleSend = vi.fn();
    const { container } = render(<MessageInput onSend={handleSend} />);
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    fireEvent.change(textarea!, { target: { value: "   \n  " } });
    fireEvent.keyDown(textarea!, { key: "Enter", code: "Enter" });

    expect(handleSend).not.toHaveBeenCalled();
  });
});

describe("AC: Send button disabled while AI is responding", () => {
  it("Send button is enabled when isAiResponding is false", () => {
    const { container } = render(
      <MessageInput onSend={() => {}} isAiResponding={false} />,
    );
    const sendBtn = container.querySelector("button");
    expect(sendBtn).not.toBeNull();
    expect(sendBtn!.disabled).toBe(false);
  });

  it("Send button is disabled when isAiResponding is true", () => {
    const { container } = render(
      <MessageInput onSend={() => {}} isAiResponding={true} />,
    );
    const sendBtn = container.querySelector("button");
    expect(sendBtn).not.toBeNull();
    expect(sendBtn!.disabled).toBe(true);
  });

  it("textarea remains enabled when isAiResponding is true (pre-typing)", () => {
    const { container } = render(
      <MessageInput onSend={() => {}} isAiResponding={true} />,
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(textarea!.disabled).toBe(false);
  });

  it("does NOT send via Enter when isAiResponding is true", () => {
    const handleSend = vi.fn();
    const { container } = render(
      <MessageInput onSend={handleSend} isAiResponding={true} />,
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    fireEvent.change(textarea!, { target: { value: "Pre-typed message" } });
    fireEvent.keyDown(textarea!, { key: "Enter", code: "Enter" });

    expect(handleSend).not.toHaveBeenCalled();
  });
});

describe("AC: Send button disabled when input is empty", () => {
  it("Send button appears disabled when textarea is empty", () => {
    const { container } = render(<MessageInput onSend={() => {}} />);
    const sendBtn = container.querySelector("button");
    expect(sendBtn).not.toBeNull();
    expect(sendBtn!.disabled).toBe(true);
  });

  it("Send button becomes enabled when textarea has content", () => {
    const { container } = render(<MessageInput onSend={() => {}} />);
    const textarea = container.querySelector("textarea");
    const sendBtn = container.querySelector("button");
    expect(textarea).not.toBeNull();
    expect(sendBtn).not.toBeNull();

    fireEvent.change(textarea!, { target: { value: "Some text" } });

    expect(sendBtn!.disabled).toBe(false);
  });
});

describe("MessageInput send via button click", () => {
  it("calls onSend when Send button is clicked with text", () => {
    const handleSend = vi.fn();
    const { container } = render(<MessageInput onSend={handleSend} />);
    const textarea = container.querySelector("textarea");
    const sendBtn = container.querySelector("button");
    expect(textarea).not.toBeNull();
    expect(sendBtn).not.toBeNull();

    fireEvent.change(textarea!, { target: { value: "Click send" } });
    fireEvent.click(sendBtn!);

    expect(handleSend).toHaveBeenCalledTimes(1);
    expect(handleSend).toHaveBeenCalledWith("Click send");
  });
});

describe("MessageInput placeholder", () => {
  it("accepts an optional placeholder prop", () => {
    const { container } = render(
      <MessageInput onSend={() => {}} placeholder="Type here..." />,
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(textarea!.placeholder).toBe("Type here...");
  });
});
