// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { DraftReadyCard } from "../../src/components/joint/DraftReadyCard";

afterEach(cleanup);

// ── AC: When draft is ready: DraftReadyCard renders the polished draft in a
//    quoted card with 4 action buttons: 'Send this message' (primary),
//    'Edit before sending' (secondary), 'Keep refining with Coach' (ghost),
//    'Discard' (ghost/danger) ───────────────────────────────────────────────

describe("AC: DraftReadyCard renders draft in quoted card with 4 action buttons", () => {
  const defaultProps = {
    draftText: "I appreciate your perspective and would like to find common ground.",
    onSend: vi.fn(),
    onEdit: vi.fn(),
    onKeepRefining: vi.fn(),
    onDiscard: vi.fn(),
  };

  it("renders draft text in a quoted card with .cc-draft-ready class", () => {
    const { container } = render(<DraftReadyCard {...defaultProps} />);
    const card = container.querySelector(".cc-draft-ready");
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain(defaultProps.draftText);
  });

  it("renders 'Send this message' button", () => {
    const { container } = render(<DraftReadyCard {...defaultProps} />);
    const buttons = container.querySelectorAll("button");
    const sendButton = Array.from(buttons).find(
      (b) => b.textContent?.includes("Send this message"),
    );
    expect(sendButton).not.toBeUndefined();
  });

  it("renders 'Edit before sending' button", () => {
    const { container } = render(<DraftReadyCard {...defaultProps} />);
    const buttons = container.querySelectorAll("button");
    const editButton = Array.from(buttons).find(
      (b) => b.textContent?.includes("Edit before sending"),
    );
    expect(editButton).not.toBeUndefined();
  });

  it("renders 'Keep refining with Coach' button", () => {
    const { container } = render(<DraftReadyCard {...defaultProps} />);
    const buttons = container.querySelectorAll("button");
    const refineButton = Array.from(buttons).find(
      (b) => b.textContent?.includes("Keep refining with Coach"),
    );
    expect(refineButton).not.toBeUndefined();
  });

  it("renders 'Discard' button", () => {
    const { container } = render(<DraftReadyCard {...defaultProps} />);
    const buttons = container.querySelectorAll("button");
    const discardButton = Array.from(buttons).find(
      (b) => b.textContent?.includes("Discard"),
    );
    expect(discardButton).not.toBeUndefined();
  });

  it("renders all 4 buttons in correct order: Send, Edit, Keep refining, Discard", () => {
    const { container } = render(<DraftReadyCard {...defaultProps} />);
    const buttons = container.querySelectorAll("button");
    const buttonTexts = Array.from(buttons).map((b) => b.textContent?.trim());
    const sendIdx = buttonTexts.findIndex((t) => t?.includes("Send this message"));
    const editIdx = buttonTexts.findIndex((t) => t?.includes("Edit before sending"));
    const refineIdx = buttonTexts.findIndex((t) => t?.includes("Keep refining with Coach"));
    const discardIdx = buttonTexts.findIndex((t) => t?.includes("Discard"));

    expect(sendIdx).toBeGreaterThanOrEqual(0);
    expect(editIdx).toBeGreaterThan(sendIdx);
    expect(refineIdx).toBeGreaterThan(editIdx);
    expect(discardIdx).toBeGreaterThan(refineIdx);
  });
});

// ── AC: Each button callback fires correctly on click ─────────────────────

describe("AC: DraftReadyCard button callbacks", () => {
  it("calls onSend when 'Send this message' is clicked", () => {
    const onSend = vi.fn();
    const { container } = render(
      <DraftReadyCard
        draftText="Draft text"
        onSend={onSend}
        onEdit={vi.fn()}
        onKeepRefining={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const buttons = container.querySelectorAll("button");
    const sendButton = Array.from(buttons).find(
      (b) => b.textContent?.includes("Send this message"),
    );
    fireEvent.click(sendButton!);
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("calls onEdit when 'Edit before sending' is clicked", () => {
    const onEdit = vi.fn();
    const { container } = render(
      <DraftReadyCard
        draftText="Draft text"
        onSend={vi.fn()}
        onEdit={onEdit}
        onKeepRefining={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const buttons = container.querySelectorAll("button");
    const editButton = Array.from(buttons).find(
      (b) => b.textContent?.includes("Edit before sending"),
    );
    fireEvent.click(editButton!);
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("calls onKeepRefining when 'Keep refining with Coach' is clicked", () => {
    const onKeepRefining = vi.fn();
    const { container } = render(
      <DraftReadyCard
        draftText="Draft text"
        onSend={vi.fn()}
        onEdit={vi.fn()}
        onKeepRefining={onKeepRefining}
        onDiscard={vi.fn()}
      />,
    );
    const buttons = container.querySelectorAll("button");
    const refineButton = Array.from(buttons).find(
      (b) => b.textContent?.includes("Keep refining with Coach"),
    );
    fireEvent.click(refineButton!);
    expect(onKeepRefining).toHaveBeenCalledOnce();
  });

  it("calls onDiscard when 'Discard' is clicked", () => {
    const onDiscard = vi.fn();
    const { container } = render(
      <DraftReadyCard
        draftText="Draft text"
        onSend={vi.fn()}
        onEdit={vi.fn()}
        onKeepRefining={vi.fn()}
        onDiscard={onDiscard}
      />,
    );
    const buttons = container.querySelectorAll("button");
    const discardButton = Array.from(buttons).find(
      (b) => b.textContent?.includes("Discard"),
    );
    fireEvent.click(discardButton!);
    expect(onDiscard).toHaveBeenCalledOnce();
  });
});

// ── AC: Button disabled state during send (isSending) ─────────────────────

describe("AC: DraftReadyCard isSending disabled state", () => {
  it("disables 'Send this message' button when isSending is true", () => {
    const { container } = render(
      <DraftReadyCard
        draftText="Draft text"
        onSend={vi.fn()}
        onEdit={vi.fn()}
        onKeepRefining={vi.fn()}
        onDiscard={vi.fn()}
        isSending={true}
      />,
    );
    const buttons = container.querySelectorAll("button");
    const sendButton = Array.from(buttons).find(
      (b) => b.textContent?.includes("Send this message"),
    );
    expect(sendButton!.disabled).toBe(true);
  });

  it("does not disable 'Send this message' button when isSending is false", () => {
    const { container } = render(
      <DraftReadyCard
        draftText="Draft text"
        onSend={vi.fn()}
        onEdit={vi.fn()}
        onKeepRefining={vi.fn()}
        onDiscard={vi.fn()}
        isSending={false}
      />,
    );
    const buttons = container.querySelectorAll("button");
    const sendButton = Array.from(buttons).find(
      (b) => b.textContent?.includes("Send this message"),
    );
    expect(sendButton!.disabled).toBe(false);
  });

  it("does not disable 'Send this message' button when isSending is omitted", () => {
    const { container } = render(
      <DraftReadyCard
        draftText="Draft text"
        onSend={vi.fn()}
        onEdit={vi.fn()}
        onKeepRefining={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const buttons = container.querySelectorAll("button");
    const sendButton = Array.from(buttons).find(
      (b) => b.textContent?.includes("Send this message"),
    );
    expect(sendButton!.disabled).toBe(false);
  });
});
