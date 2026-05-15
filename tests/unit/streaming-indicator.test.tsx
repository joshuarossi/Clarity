// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { StreamingIndicator } from "../../src/components/chat/StreamingIndicator";

afterEach(cleanup);

// ── AC: StreamingIndicator is a 2px × 1em currentColor bar with 1s
//    steps(2) blink animation, removed when streaming completes ────────

describe("AC: StreamingIndicator rendering", () => {
  it("renders a span element", () => {
    const { container } = render(<StreamingIndicator />);
    const cursor = container.querySelector("span");
    expect(cursor).not.toBeNull();
  });

  it("has the cc-streaming-cursor CSS class", () => {
    const { container } = render(<StreamingIndicator />);
    const cursor = container.querySelector(".cc-streaming-cursor");
    expect(cursor).not.toBeNull();
  });

  it("renders as an inline element (span, not div)", () => {
    const { container } = render(<StreamingIndicator />);
    const cursor = container.querySelector(".cc-streaming-cursor");
    expect(cursor).not.toBeNull();
    expect(cursor!.tagName.toLowerCase()).toBe("span");
  });

  it("accepts an optional className prop", () => {
    const { container } = render(
      <StreamingIndicator className="custom-cursor" />,
    );
    const cursor = container.querySelector(".cc-streaming-cursor");
    expect(cursor).not.toBeNull();
    expect(cursor!.classList.contains("custom-cursor")).toBe(true);
  });
});
