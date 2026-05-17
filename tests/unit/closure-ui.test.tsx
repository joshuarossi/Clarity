// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  cleanup,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";

import { ClosureModal } from "../../src/components/chat/ClosureModal";
import { ClosureConfirmBanner } from "../../src/components/chat/ClosureConfirmBanner";

// ── Setup / Teardown ───────────────────────────────────────────────────

afterEach(() => {
  cleanup();
});

// ── ClosureModal Tests ─────────────────────────────────────────────────

describe("ClosureModal — three-path closure flow", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onProposeClosure: vi.fn(() => Promise.resolve()),
    onUnilateralClose: vi.fn(() => Promise.resolve()),
    otherPartyName: "Jordan",
  };

  beforeEach(() => {
    defaultProps.onOpenChange.mockReset();
    defaultProps.onProposeClosure
      .mockReset()
      .mockReturnValue(Promise.resolve());
    defaultProps.onUnilateralClose
      .mockReset()
      .mockReturnValue(Promise.resolve());
  });

  // AC: Modal options: "Resolved" (primary flow), "Not resolved" (warning),
  //     "Take a break" (close tab, case stays JOINT_ACTIVE)
  describe("AC: Modal renders three option buttons when open", () => {
    it("shows Resolved, Not resolved, and Take a break options", () => {
      render(<ClosureModal {...defaultProps} />);

      expect(screen.getByRole("button", { name: /^resolved$/i })).toBeDefined();
      expect(
        screen.getByRole("button", { name: /not resolved/i }),
      ).toBeDefined();
      expect(
        screen.getByRole("button", { name: /take a break/i }),
      ).toBeDefined();
    });

    it("does not render content when open is false", () => {
      render(<ClosureModal {...defaultProps} open={false} />);

      expect(screen.queryByRole("button", { name: /^resolved$/i })).toBeNull();
    });
  });

  // AC: Resolved: textarea "Briefly describe what you agreed to" (required, 5 rows),
  //     message "Jordan will see this summary and confirm",
  //     "Propose Resolution" / "Cancel" buttons
  describe("AC: Resolved path — textarea, info message, Propose Resolution / Cancel", () => {
    it("shows textarea with 5 rows after selecting Resolved", () => {
      render(<ClosureModal {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /^resolved$/i }));

      const textarea = screen.getByRole("textbox");
      expect(textarea).toBeDefined();
      expect(textarea.getAttribute("rows")).toBe("5");
    });

    it("shows placeholder text about describing agreement", () => {
      render(<ClosureModal {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /^resolved$/i }));

      const textarea = screen.getByRole("textbox");
      const placeholder = textarea.getAttribute("placeholder") ?? "";
      expect(placeholder.toLowerCase()).toContain("agreed");
    });

    it("shows info message mentioning the other party name", () => {
      render(<ClosureModal {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /^resolved$/i }));

      expect(
        screen.getByText(/Jordan will see this summary and confirm/),
      ).toBeDefined();
    });

    it("shows Propose Resolution and Cancel buttons", () => {
      render(<ClosureModal {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /^resolved$/i }));

      expect(
        screen.getByRole("button", { name: /propose resolution/i }),
      ).toBeDefined();
      expect(screen.getByRole("button", { name: /cancel/i })).toBeDefined();
    });

    it("Propose Resolution button is disabled when textarea is empty", () => {
      render(<ClosureModal {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /^resolved$/i }));

      const proposeBtn = screen.getByRole("button", {
        name: /propose resolution/i,
      });
      expect(proposeBtn).toHaveProperty("disabled", true);
    });

    it("Propose Resolution button is disabled when textarea contains only whitespace", () => {
      render(<ClosureModal {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /^resolved$/i }));

      const textarea = screen.getByRole("textbox");
      fireEvent.change(textarea, { target: { value: "   \n  " } });

      const proposeBtn = screen.getByRole("button", {
        name: /propose resolution/i,
      });
      expect(proposeBtn).toHaveProperty("disabled", true);
    });

    it("Propose Resolution button is enabled when textarea has content", () => {
      render(<ClosureModal {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /^resolved$/i }));

      const textarea = screen.getByRole("textbox");
      fireEvent.change(textarea, {
        target: { value: "We agreed to meet weekly." },
      });

      const proposeBtn = screen.getByRole("button", {
        name: /propose resolution/i,
      });
      expect(proposeBtn).toHaveProperty("disabled", false);
    });

    it("clicking Propose Resolution calls onProposeClosure with summary text", async () => {
      render(<ClosureModal {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /^resolved$/i }));

      const textarea = screen.getByRole("textbox");
      fireEvent.change(textarea, {
        target: { value: "We agreed to meet weekly." },
      });

      fireEvent.click(
        screen.getByRole("button", { name: /propose resolution/i }),
      );

      await waitFor(() => {
        expect(defaultProps.onProposeClosure).toHaveBeenCalledWith(
          "We agreed to meet weekly.",
        );
      });
    });

    it("Cancel returns to the three-option view", () => {
      render(<ClosureModal {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /^resolved$/i }));

      // Verify we're in Resolved sub-view
      expect(screen.getByRole("textbox")).toBeDefined();

      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

      // Should be back to three-option view
      expect(
        screen.getByRole("button", { name: /take a break/i }),
      ).toBeDefined();
      expect(screen.queryByRole("textbox")).toBeNull();
    });
  });

  // AC: Not resolved: warning styling, optional textarea,
  //     "This closes the case immediately for both of you. Jordan will be notified.",
  //     "Close without resolution" / "Cancel" buttons
  describe("AC: Not resolved path — warning styling, optional textarea, Close without resolution / Cancel", () => {
    it("shows warning message after selecting Not resolved", () => {
      render(<ClosureModal {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /not resolved/i }));

      expect(
        screen.getByText(/this closes the case immediately for both of you/i),
      ).toBeDefined();
      expect(screen.getByText(/Jordan will be notified/i)).toBeDefined();
    });

    it("shows an optional textarea", () => {
      render(<ClosureModal {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /not resolved/i }));

      const textarea = screen.getByRole("textbox");
      expect(textarea).toBeDefined();
    });

    it("shows Close without resolution and Cancel buttons", () => {
      render(<ClosureModal {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /not resolved/i }));

      expect(
        screen.getByRole("button", { name: /close without resolution/i }),
      ).toBeDefined();
      expect(screen.getByRole("button", { name: /cancel/i })).toBeDefined();
    });

    it("Close without resolution button is enabled even when textarea is empty", () => {
      render(<ClosureModal {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /not resolved/i }));

      const closeBtn = screen.getByRole("button", {
        name: /close without resolution/i,
      });
      expect(closeBtn).toHaveProperty("disabled", false);
    });

    it("clicking Close without resolution calls onUnilateralClose", async () => {
      render(<ClosureModal {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /not resolved/i }));

      fireEvent.click(
        screen.getByRole("button", { name: /close without resolution/i }),
      );

      await waitFor(() => {
        expect(defaultProps.onUnilateralClose).toHaveBeenCalled();
      });
    });

    it("Cancel returns to the three-option view", () => {
      render(<ClosureModal {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /not resolved/i }));

      // Verify we're in Not resolved sub-view
      expect(
        screen.getByRole("button", { name: /close without resolution/i }),
      ).toBeDefined();

      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

      // Should be back to three-option view
      expect(
        screen.getByRole("button", { name: /take a break/i }),
      ).toBeDefined();
    });
  });

  // AC: Modal uses styled Dialog component (not browser confirm()),
  //     max-width 480px, radius 20px per StyleGuide §6.12
  describe("AC: Modal uses styled Dialog with max-width 480px and border-radius 20px", () => {
    it("renders with cc-dialog-content class (Radix Dialog, not browser confirm)", () => {
      render(<ClosureModal {...defaultProps} />);

      const dialogContent = document.querySelector(".cc-dialog-content");
      expect(dialogContent).not.toBeNull();
    });

    it("renders with cc-closure-modal class for max-width and border-radius styling", () => {
      render(<ClosureModal {...defaultProps} />);

      const closureModal = document.querySelector(".cc-closure-modal");
      expect(closureModal).not.toBeNull();
    });
  });

  // Edge case: Modal state resets on close
  describe("Edge case: Modal state resets on close", () => {
    it("reopening modal shows the initial three-option view", () => {
      const { rerender } = render(<ClosureModal {...defaultProps} />);

      // Navigate to Resolved sub-view
      fireEvent.click(screen.getByRole("button", { name: /^resolved$/i }));
      expect(screen.getByRole("textbox")).toBeDefined();

      // Close and reopen the modal
      rerender(<ClosureModal {...defaultProps} open={false} />);
      rerender(<ClosureModal {...defaultProps} open={true} />);

      // Should show the three-option view again
      expect(
        screen.getByRole("button", { name: /take a break/i }),
      ).toBeDefined();
    });
  });
});

// ── ClosureConfirmBanner Tests ─────────────────────────────────────────

describe("ClosureConfirmBanner — confirmation banner for proposed closure", () => {
  const defaultBannerProps = {
    summary: "We agreed to meet weekly to discuss progress.",
    proposerName: "Alex",
    onConfirm: vi.fn(),
    onReject: vi.fn(),
  };

  beforeEach(() => {
    defaultBannerProps.onConfirm.mockReset();
    defaultBannerProps.onReject.mockReset();
  });

  // AC: Confirmation banner shown to the other party when closure proposed:
  //     summary text, "Confirm" / "Reject and keep talking" buttons
  describe("AC: Banner renders summary text, proposer name, Confirm and Reject buttons", () => {
    it("displays the proposer name in the message", () => {
      render(<ClosureConfirmBanner {...defaultBannerProps} />);

      expect(
        screen.getByText(/Alex has proposed resolving this case/i),
      ).toBeDefined();
    });

    it("displays the summary text", () => {
      render(<ClosureConfirmBanner {...defaultBannerProps} />);

      expect(
        screen.getByText(/We agreed to meet weekly to discuss progress/),
      ).toBeDefined();
    });

    it("renders Confirm button", () => {
      render(<ClosureConfirmBanner {...defaultBannerProps} />);

      expect(screen.getByRole("button", { name: /confirm/i })).toBeDefined();
    });

    it("renders Reject and keep talking button", () => {
      render(<ClosureConfirmBanner {...defaultBannerProps} />);

      expect(
        screen.getByRole("button", { name: /reject and keep talking/i }),
      ).toBeDefined();
    });

    it("clicking Confirm calls onConfirm", () => {
      render(<ClosureConfirmBanner {...defaultBannerProps} />);

      fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
      expect(defaultBannerProps.onConfirm).toHaveBeenCalledOnce();
    });

    it("clicking Reject calls onReject", () => {
      render(<ClosureConfirmBanner {...defaultBannerProps} />);

      fireEvent.click(
        screen.getByRole("button", { name: /reject and keep talking/i }),
      );
      expect(defaultBannerProps.onReject).toHaveBeenCalledOnce();
    });
  });

  // NFR-A11Y: Confirmation banner Confirm button receives focus on mount
  describe("NFR-A11Y: Confirm button receives focus on mount", () => {
    it("Confirm button has focus after banner mounts", async () => {
      render(<ClosureConfirmBanner {...defaultBannerProps} />);

      await waitFor(() => {
        const confirmBtn = screen.getByRole("button", { name: /confirm/i });
        expect(document.activeElement).toBe(confirmBtn);
      });
    });
  });
});
