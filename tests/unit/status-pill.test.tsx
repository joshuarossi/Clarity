// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StatusPill } from "../../src/components/ui/StatusPill";

afterEach(cleanup);

// ── AC: StatusPill renders 4 variants per StyleGuide §6.7:
//    pill-turn (green filled circle), pill-waiting (gray hollow circle),
//    pill-ready (amber), pill-closed (neutral square) ────────────────────

describe("AC: StatusPill renders 4 variants", () => {
  describe("pill-turn variant (active, filled circle)", () => {
    it("renders the label text", () => {
      render(<StatusPill variant="pill-turn" label="Your Turn" />);
      expect(screen.getByText("Your Turn")).toBeDefined();
    });

    it("has the .cc-status-pill CSS class", () => {
      const { container } = render(
        <StatusPill variant="pill-turn" label="Your Turn" />,
      );
      expect(container.querySelector(".cc-status-pill")).not.toBeNull();
    });

    it("renders a filled circle dot indicator", () => {
      const { container } = render(
        <StatusPill variant="pill-turn" label="Your Turn" />,
      );
      const dot = container.querySelector(".cc-status-pill-dot");
      expect(dot).not.toBeNull();
      // pill-turn uses a filled circle — no border-only styling
      expect(dot!.classList.contains("pill-turn")).toBe(true);
    });
  });

  describe("pill-waiting variant (passive, hollow circle)", () => {
    it("renders the label text", () => {
      render(<StatusPill variant="pill-waiting" label="Waiting" />);
      expect(screen.getByText("Waiting")).toBeDefined();
    });

    it("renders a hollow circle dot indicator", () => {
      const { container } = render(
        <StatusPill variant="pill-waiting" label="Waiting" />,
      );
      const dot = container.querySelector(".cc-status-pill-dot");
      expect(dot).not.toBeNull();
      expect(dot!.classList.contains("pill-waiting")).toBe(true);
    });
  });

  describe("pill-ready variant (ready, filled circle amber)", () => {
    it("renders the label text", () => {
      render(<StatusPill variant="pill-ready" label="Ready" />);
      expect(screen.getByText("Ready")).toBeDefined();
    });

    it("renders a filled circle dot with ready styling", () => {
      const { container } = render(
        <StatusPill variant="pill-ready" label="Ready" />,
      );
      const dot = container.querySelector(".cc-status-pill-dot");
      expect(dot).not.toBeNull();
      expect(dot!.classList.contains("pill-ready")).toBe(true);
    });
  });

  describe("pill-closed variant (terminal, square)", () => {
    it("renders the label text", () => {
      render(<StatusPill variant="pill-closed" label="Closed" />);
      expect(screen.getByText("Closed")).toBeDefined();
    });

    it("renders a square dot indicator", () => {
      const { container } = render(
        <StatusPill variant="pill-closed" label="Closed" />,
      );
      const dot = container.querySelector(".cc-status-pill-dot");
      expect(dot).not.toBeNull();
      // pill-closed uses a square shape, distinct from circle variants
      expect(dot!.classList.contains("pill-closed")).toBe(true);
    });
  });

  it("each variant produces a distinct dot class", () => {
    const variants = [
      "pill-turn",
      "pill-waiting",
      "pill-ready",
      "pill-closed",
    ] as const;

    for (const variant of variants) {
      const { container } = render(
        <StatusPill variant={variant} label={variant} />,
      );
      const dot = container.querySelector(".cc-status-pill-dot");
      expect(dot).not.toBeNull();
      expect(dot!.classList.contains(variant)).toBe(true);
      cleanup();
    }
  });

  it("accepts an optional className prop", () => {
    const { container } = render(
      <StatusPill variant="pill-turn" label="Turn" className="extra-class" />,
    );
    const pill = container.querySelector(".cc-status-pill");
    expect(pill).not.toBeNull();
    expect(pill!.classList.contains("extra-class")).toBe(true);
  });
});
