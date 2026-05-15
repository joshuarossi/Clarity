// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PrivacyBanner } from "../../src/components/ui/PrivacyBanner";

afterEach(cleanup);

// ── AC: PrivacyBanner renders with --private-tint background, Lock icon,
//    and customizable copy (e.g., "Private to you. Jordan will never see
//    any of it.") per StyleGuide §6.6 ─────────────────────────────────────

describe("AC: PrivacyBanner renders with --private-tint background, Lock icon, and customizable copy", () => {
  it("renders with .cc-banner-privacy CSS class", () => {
    const { container } = render(<PrivacyBanner copy="Private to you." />);
    const banner = container.querySelector(".cc-banner-privacy");
    expect(banner).not.toBeNull();
  });

  it("displays a Lock icon inside a button", () => {
    render(<PrivacyBanner copy="Private to you." />);
    const lockButton = screen.getByRole("button", {
      name: /learn more about privacy/i,
    });
    const svg = lockButton.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("shows provided plain-text copy", () => {
    render(
      <PrivacyBanner copy="Private to you. Jordan will never see any of it." />,
    );
    expect(
      screen.getByText(/Private to you\. Jordan will never see any of it\./),
    ).toBeDefined();
  });

  it("renders ReactNode copy with formatting preserved", () => {
    render(
      <PrivacyBanner
        copy={
          <>
            <strong>Private to you.</strong> Jordan will never see any of it.
          </>
        }
      />,
    );
    const strong = screen.getByText("Private to you.");
    expect(strong.tagName).toBe("STRONG");
  });

  it("lock icon button has aria-label for accessibility", () => {
    render(<PrivacyBanner copy="Private." />);
    const lockButton = screen.getByRole("button", {
      name: /learn more about privacy/i,
    });
    expect(lockButton.getAttribute("aria-label")).toBe(
      "Learn more about privacy",
    );
  });
});

// ── AC: PrivacyBanner lock icon click opens a modal explaining what's
//    private and why per DesignDoc §4.7 ──────────────────────────────────

describe("AC: PrivacyBanner lock icon click opens a modal explaining what is private", () => {
  it("clicking lock icon opens the privacy explanation dialog", () => {
    render(<PrivacyBanner copy="Private to you." />);
    const lockButton = screen.getByRole("button", {
      name: /learn more about privacy/i,
    });
    fireEvent.click(lockButton);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
  });

  it("modal contains content explaining privacy", () => {
    render(<PrivacyBanner copy="Private to you." />);
    fireEvent.click(
      screen.getByRole("button", { name: /learn more about privacy/i }),
    );
    const dialog = screen.getByRole("dialog");
    // Modal should explain that the conversation is private
    expect(dialog.textContent?.toLowerCase()).toContain("private");
  });

  it("modal uses .cc-dialog-content CSS class (max-width 480px, radius 20px)", () => {
    render(<PrivacyBanner copy="Private to you." />);
    fireEvent.click(
      screen.getByRole("button", { name: /learn more about privacy/i }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.classList.contains("cc-dialog-content")).toBe(true);
  });

  it("modal closes when close button is clicked", () => {
    render(<PrivacyBanner copy="Private to you." />);
    fireEvent.click(
      screen.getByRole("button", { name: /learn more about privacy/i }),
    );
    expect(screen.getByRole("dialog")).toBeDefined();

    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("modal closes when Escape key is pressed", () => {
    render(<PrivacyBanner copy="Private to you." />);
    fireEvent.click(
      screen.getByRole("button", { name: /learn more about privacy/i }),
    );
    expect(screen.getByRole("dialog")).toBeDefined();

    fireEvent.keyDown(screen.getByRole("dialog"), {
      key: "Escape",
      code: "Escape",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
