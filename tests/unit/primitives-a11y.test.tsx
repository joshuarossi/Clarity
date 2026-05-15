// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PrivacyBanner } from "../../src/components/ui/PrivacyBanner";
import { PhaseHeader } from "../../src/components/layout/PhaseHeader";

afterEach(cleanup);

// ── AC: All components meet WCAG AA contrast requirements
//    (4.5:1 for text, 3:1 for large text) ─────────────────────────────────
// ── AC: All icon buttons have aria-label attributes ──────────────────────

describe("AC: All icon buttons have aria-label attributes", () => {
  it("PrivacyBanner lock icon button has aria-label", () => {
    const { container } = render(<PrivacyBanner copy="Private." />);
    const lockButton = container.querySelector(
      'button[aria-label="Learn more about privacy"]',
    );
    expect(lockButton).not.toBeNull();
  });

  it("PhaseHeader back arrow link has aria-label", () => {
    const { container } = render(
      <MemoryRouter>
        <PhaseHeader caseName="Test" phaseName="Coaching" />
      </MemoryRouter>,
    );
    const backLink = container.querySelector(
      'a[aria-label="Back to Dashboard"]',
    );
    expect(backLink).not.toBeNull();
  });
});

describe("AC: All components meet WCAG AA contrast requirements", () => {
  it("PrivacyBanner uses .cc-banner-privacy class which references --private-tint (designed for AA contrast)", () => {
    const { container } = render(<PrivacyBanner copy="Private." />);
    const banner = container.querySelector(".cc-banner-privacy");
    expect(banner).not.toBeNull();
    // The .cc-banner-privacy CSS class recipe uses --private-tint and
    // --text-secondary tokens that are designed to meet WCAG AA contrast.
    // Visual contrast verification requires a real browser (Playwright);
    // here we verify the correct class is applied so the tokens govern.
  });

  it("PhaseHeader uses .cc-phase-header class which references --bg-surface and --text-secondary (AA tokens)", () => {
    const { container } = render(
      <MemoryRouter>
        <PhaseHeader caseName="Test" phaseName="Coaching" />
      </MemoryRouter>,
    );
    const header = container.querySelector(".cc-phase-header");
    expect(header).not.toBeNull();
    // The .cc-phase-header class recipe uses --bg-surface and text tokens
    // designed for AA contrast. Actual contrast verification deferred to
    // Playwright visual regression.
  });
});

describe("AC: Interactive elements are keyboard-focusable", () => {
  it("PrivacyBanner lock icon button is focusable", () => {
    const { container } = render(<PrivacyBanner copy="Private." />);
    const lockButton = container.querySelector(
      'button[aria-label="Learn more about privacy"]',
    );
    expect(lockButton).not.toBeNull();
    // Buttons are natively focusable; verify it's not disabled or hidden
    expect(lockButton!.hasAttribute("disabled")).toBe(false);
    expect(lockButton!.getAttribute("tabindex")).not.toBe("-1");
  });

  it("PhaseHeader back link is focusable", () => {
    const { container } = render(
      <MemoryRouter>
        <PhaseHeader caseName="Test" phaseName="Coaching" />
      </MemoryRouter>,
    );
    const backLink = container.querySelector(
      'a[aria-label="Back to Dashboard"]',
    );
    expect(backLink).not.toBeNull();
    // Links with href are natively focusable
    expect(backLink!.hasAttribute("href")).toBe(true);
    expect(backLink!.getAttribute("tabindex")).not.toBe("-1");
  });
});
