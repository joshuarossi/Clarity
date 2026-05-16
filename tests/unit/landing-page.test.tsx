// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { LandingPage } from "../../src/routes/LandingPage";

// ── Mocks ────────────────────────────────────────────────────────────────

const { mockUseConvexAuth } = vi.hoisted(() => ({
  mockUseConvexAuth: vi.fn(
    (): { isLoading: boolean; isAuthenticated: boolean } => ({
      isLoading: false,
      isAuthenticated: false,
    }),
  ),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: mockUseConvexAuth,
}));

// ── Setup / Teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  mockUseConvexAuth.mockReturnValue({
    isLoading: false,
    isAuthenticated: false,
  });
});

afterEach(cleanup);

// ── Helpers ──────────────────────────────────────────────────────────────

function renderLandingPage() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// ── AC 1: Hero — tagline, subhead, "Start a case" CTA ───────────────────

describe("AC: Hero section", () => {
  it("renders the tagline text", () => {
    renderLandingPage();
    expect(
      screen.getByText(
        "A calm place to work through a difficult conversation.",
      ),
    ).toBeDefined();
  });

  it("renders a subhead element", () => {
    const { container } = renderLandingPage();
    // The hero section should contain at least two text elements: tagline + subhead
    const sections = container.querySelectorAll("section");
    expect(sections.length).toBeGreaterThan(0);
    const heroSection = sections[0];
    // Subhead is a secondary text element below the tagline
    const textElements = heroSection.querySelectorAll("p, h2, h3, span");
    expect(textElements.length).toBeGreaterThan(0);
  });

  it("renders 'Start a case' CTA linking to /login", () => {
    renderLandingPage();
    const cta = screen.getByRole("link", { name: /start a case/i });
    expect(cta).toBeDefined();
    expect(cta.getAttribute("href")).toBe("/login");
  });
});

// ── AC 2: Three-step explainer ───────────────────────────────────────────

describe("AC: Three-step explainer", () => {
  it("renders 'Private Coaching', 'Shared Conversation', 'Resolution' in order", () => {
    const { container } = renderLandingPage();

    const privateCoaching = screen.getByText("Private Coaching");
    const sharedConversation = screen.getByText("Shared Conversation");
    const resolution = screen.getByText("Resolution");

    expect(privateCoaching).toBeDefined();
    expect(sharedConversation).toBeDefined();
    expect(resolution).toBeDefined();

    // Verify DOM order
    const body = container.innerHTML;
    const indexPC = body.indexOf("Private Coaching");
    const indexSC = body.indexOf("Shared Conversation");
    const indexR = body.indexOf("Resolution");

    expect(indexPC).toBeLessThan(indexSC);
    expect(indexSC).toBeLessThan(indexR);
  });
});

// ── AC 3: Privacy section ────────────────────────────────────────────────

describe("AC: Privacy section", () => {
  it("renders privacy heading text", () => {
    renderLandingPage();
    expect(
      screen.getByText(
        "Your words are yours. Here's how we protect them.",
      ),
    ).toBeDefined();
  });

  it("contains a link to the privacy policy", () => {
    renderLandingPage();
    const privacyLink = screen.getAllByRole("link").find((link) => {
      const href = link.getAttribute("href");
      return href === "/privacy";
    });
    expect(privacyLink).toBeDefined();
  });
});

// ── AC 4: Footer ─────────────────────────────────────────────────────────

describe("AC: Footer links", () => {
  it("renders a footer with terms, privacy, and contact links", () => {
    const { container } = renderLandingPage();
    const footer = container.querySelector("footer");
    expect(footer).not.toBeNull();

    const links = footer!.querySelectorAll("a");
    const linkTexts = Array.from(links).map((l) =>
      l.textContent?.toLowerCase(),
    );

    expect(linkTexts.some((t) => t?.includes("terms"))).toBe(true);
    expect(linkTexts.some((t) => t?.includes("privacy"))).toBe(true);
    expect(linkTexts.some((t) => t?.includes("contact"))).toBe(true);
  });
});

// ── AC 5: No forbidden content ───────────────────────────────────────────

describe("AC: No testimonials, no pricing, no aggressive CTAs", () => {
  it("does not contain testimonial text", () => {
    const { container } = renderLandingPage();
    expect(container.innerHTML).not.toMatch(/testimonial/i);
  });

  it("does not contain pricing text", () => {
    const { container } = renderLandingPage();
    expect(container.innerHTML).not.toMatch(/pricing/i);
  });

  it("does not contain 'Get started free' text", () => {
    renderLandingPage();
    expect(screen.queryByText(/get started free/i)).toBeNull();
  });

  it("has only a single CTA", () => {
    renderLandingPage();
    const ctas = screen.getAllByRole("link", { name: /start a case/i });
    expect(ctas).toHaveLength(1);
  });
});

// ── AC 6: Logged-in users redirected to /dashboard ───────────────────────

describe("AC: Auth redirect for logged-in users", () => {
  it("redirects authenticated users to /dashboard", () => {
    mockUseConvexAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
    });

    renderLandingPage();

    // The landing page content should not be present
    expect(
      screen.queryByText(
        "A calm place to work through a difficult conversation.",
      ),
    ).toBeNull();
    // Should render the dashboard route
    expect(screen.getByText("Dashboard")).toBeDefined();
  });

  it("renders nothing while auth is loading", () => {
    mockUseConvexAuth.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
    });

    const { container } = renderLandingPage();

    // Should not render landing page content
    expect(
      screen.queryByText(
        "A calm place to work through a difficult conversation.",
      ),
    ).toBeNull();
    // Should not redirect to dashboard either
    expect(screen.queryByText("Dashboard")).toBeNull();
    // Container should be essentially empty (just the router wrapper)
    expect(container.textContent).toBe("");
  });
});
