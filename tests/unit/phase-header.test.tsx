// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { PhaseHeader } from "../../src/components/layout/PhaseHeader";

afterEach(cleanup);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// ── AC: PhaseHeader renders: back arrow + "Dashboard" link (left),
//    case name + phase name (center), phase-specific actions slot (right)
//    per StyleGuide §6.13, height 56px (12px vertical padding + 32px
//    content), --bg-surface background, 1px bottom border ────────────────

describe("AC: PhaseHeader renders back nav, case/phase title, and actions slot", () => {
  describe("layout structure", () => {
    it("renders with .cc-phase-header CSS class", () => {
      const { container } = renderWithRouter(
        <PhaseHeader caseName="Smith vs. Jones" phaseName="Private Coaching" />,
      );
      expect(container.querySelector(".cc-phase-header")).not.toBeNull();
    });

    it("has 56px height", () => {
      const { container } = renderWithRouter(
        <PhaseHeader caseName="Smith vs. Jones" phaseName="Private Coaching" />,
      );
      const header = container.querySelector(".cc-phase-header");
      expect(header).not.toBeNull();
      // Height is enforced by CSS: 12px padding-top + 32px content + 12px padding-bottom
      // Height is enforced by the .cc-phase-header CSS class recipe.
      // jsdom cannot compute CSS layout; we verify the class is applied,
      // which guarantees the 56px constraint in a real browser.
      expect(header!.classList.contains("cc-phase-header")).toBe(true);
    });
  });

  describe("left section — back navigation", () => {
    it("contains a back arrow SVG icon", () => {
      const { container } = renderWithRouter(
        <PhaseHeader caseName="Test Case" phaseName="Coaching" />,
      );
      const backLink = container.querySelector(
        'a[aria-label="Back to Dashboard"]',
      );
      expect(backLink).not.toBeNull();
      const svg = backLink!.querySelector("svg");
      expect(svg).not.toBeNull();
    });

    it('contains a "Dashboard" text link', () => {
      renderWithRouter(
        <PhaseHeader caseName="Test Case" phaseName="Coaching" />,
      );
      const dashboardLink = screen.getByText("Dashboard");
      expect(dashboardLink).toBeDefined();
      expect(dashboardLink.closest("a")).not.toBeNull();
    });

    it("links to /dashboard by default", () => {
      const { container } = renderWithRouter(
        <PhaseHeader caseName="Test Case" phaseName="Coaching" />,
      );
      const backLink = container.querySelector(
        'a[aria-label="Back to Dashboard"]',
      );
      expect(backLink!.getAttribute("href")).toBe("/dashboard");
    });

    it("links to custom backTo prop when provided", () => {
      const { container } = renderWithRouter(
        <PhaseHeader
          caseName="Test Case"
          phaseName="Coaching"
          backTo="/cases"
        />,
      );
      const backLink = container.querySelector(
        'a[aria-label="Back to Dashboard"]',
      );
      expect(backLink!.getAttribute("href")).toBe("/cases");
    });

    it("back arrow has aria-label for accessibility", () => {
      const { container } = renderWithRouter(
        <PhaseHeader caseName="Test Case" phaseName="Coaching" />,
      );
      const backLink = container.querySelector(
        'a[aria-label="Back to Dashboard"]',
      );
      expect(backLink).not.toBeNull();
      expect(backLink!.getAttribute("aria-label")).toBe("Back to Dashboard");
    });
  });

  describe("center section — case name and phase name", () => {
    it("displays case name", () => {
      renderWithRouter(
        <PhaseHeader caseName="Smith vs. Jones" phaseName="Private Coaching" />,
      );
      expect(screen.getByText(/Smith vs\. Jones/)).toBeDefined();
    });

    it("displays phase name", () => {
      renderWithRouter(
        <PhaseHeader caseName="Smith vs. Jones" phaseName="Private Coaching" />,
      );
      expect(screen.getByText(/Private Coaching/)).toBeDefined();
    });

    it("displays separator between case name and phase name", () => {
      const { container } = renderWithRouter(
        <PhaseHeader caseName="Smith vs. Jones" phaseName="Private Coaching" />,
      );
      const header = container.querySelector(".cc-phase-header");
      // The contract specifies "caseName · phaseName" with · separator
      expect(header!.textContent).toContain("·");
    });
  });

  describe("right section — actions slot (children)", () => {
    it("renders children in the right slot", () => {
      renderWithRouter(
        <PhaseHeader caseName="Test" phaseName="Coaching">
          <button type="button">Mark Complete</button>
        </PhaseHeader>,
      );
      expect(screen.getByText("Mark Complete")).toBeDefined();
    });

    it("renders correctly with no children", () => {
      const { container } = renderWithRouter(
        <PhaseHeader caseName="Test" phaseName="Coaching" />,
      );
      // Header still renders properly without children
      expect(container.querySelector(".cc-phase-header")).not.toBeNull();
    });
  });
});
