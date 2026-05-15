// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  cleanup,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axe from "axe-core";
import { LoginPage } from "../../src/routes/LoginPage";

// ── Mocks ────────────────────────────────────────────────────────────────

const { mockSignIn, mockUseConvexAuth } = vi.hoisted(() => ({
  mockSignIn: vi.fn(() => Promise.resolve()),
  mockUseConvexAuth: vi.fn(
    () => ({ isLoading: false, isAuthenticated: false } as const),
  ),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: mockUseConvexAuth,
  useAuthActions: () => ({ signIn: mockSignIn }),
}));

// ── Setup / Teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  mockSignIn.mockImplementation(() => Promise.resolve());
  mockUseConvexAuth.mockReturnValue({
    isLoading: false,
    isAuthenticated: false,
  });
});

afterEach(cleanup);

// ── Helpers ──────────────────────────────────────────────────────────────

function renderLoginPage(route = "/login") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

// ── AC: Login page renders centered card (~400px wide) with
//    "Sign in to Clarity" heading ─────────────────────────────────────────

describe("AC: Login page renders centered card with heading", () => {
  it("renders 'Sign in to Clarity' heading", () => {
    renderLoginPage();
    expect(
      screen.getByRole("heading", { name: /sign in to clarity/i }),
    ).toBeDefined();
  });

  it("card container constrains width to approximately 400px", () => {
    const { container } = renderLoginPage();
    // The card should have a max-width style or a Tailwind max-w class
    const card =
      container.querySelector("[style*='max-width']") ??
      container.querySelector(".max-w-sm") ??
      container.querySelector(".max-w-md") ??
      container.querySelector("[class*='max-w']");
    expect(card).not.toBeNull();
  });
});

// ── AC: Email input + "Send magic link" primary button submits and shows
//    "Check your email..." confirmation state ─────────────────────────────

describe("AC: Magic-link submit and confirmation state", () => {
  it("renders email input and 'Send magic link' button", () => {
    renderLoginPage();
    expect(screen.getByLabelText(/email/i)).toBeDefined();
    expect(
      screen.getByRole("button", { name: /send magic link/i }),
    ).toBeDefined();
  });

  it("submitting email calls signIn with magic-link provider and shows confirmation", async () => {
    renderLoginPage();

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /send magic link/i }),
    );

    expect(mockSignIn).toHaveBeenCalledWith("magic-link", {
      email: "user@example.com",
    });

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeDefined();
    });
  });

  it("hides the email form after successful magic-link send", async () => {
    renderLoginPage();

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /send magic link/i }),
    );

    await waitFor(() => {
      expect(screen.queryByLabelText(/email/i)).toBeNull();
    });
  });
});

// ── AC: "Continue with Google" secondary button initiates Google OAuth
//    flow ──────────────────────────────────────────────────────────────────

describe("AC: Google OAuth button", () => {
  it("renders 'Continue with Google' button", () => {
    renderLoginPage();
    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeDefined();
  });

  it("clicking Google button calls signIn with 'google' provider", () => {
    renderLoginPage();
    fireEvent.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );
    expect(mockSignIn).toHaveBeenCalledWith("google");
  });
});

// ── AC: Fine print: "By signing in, you agree to our Terms and Privacy
//    Policy" ──────────────────────────────────────────────────────────────

describe("AC: Fine print terms and privacy text", () => {
  it("renders terms and privacy policy fine print", () => {
    renderLoginPage();
    expect(
      screen.getByText(
        /by signing in, you agree to our terms and privacy policy/i,
      ),
    ).toBeDefined();
  });
});

// ── AC: Error state: inline error message below email input ──────────────

describe("AC: Error state on magic-link failure", () => {
  it("shows inline error when signIn rejects", async () => {
    mockSignIn.mockRejectedValueOnce(new Error("Invalid email address"));
    const { container } = renderLoginPage();

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "fail@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /send magic link/i }),
    );

    await waitFor(() => {
      const errorElement = container.querySelector("[role='alert']");
      expect(errorElement).not.toBeNull();
      expect(errorElement!.textContent).toBeTruthy();
    });
  });

  it("keeps form interactive after error so user can retry", async () => {
    mockSignIn.mockRejectedValueOnce(new Error("Failed"));
    renderLoginPage();

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "retry@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /send magic link/i }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeDefined();
      expect(
        screen.getByRole("button", { name: /send magic link/i }),
      ).toBeDefined();
    });
  });
});

// ── AC: All form elements have proper labels, keyboard navigation works,
//    WCAG AA contrast met ─────────────────────────────────────────────────

describe("AC: Accessibility — WCAG AA compliance", () => {
  it("has no axe-core WCAG AA violations", async () => {
    const { container } = renderLoginPage();
    const results = await axe.run(container, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    });
    expect(results.violations).toHaveLength(0);
  });

  it("email input has an associated label element", () => {
    renderLoginPage();
    // getByLabelText throws if no associated label exists
    expect(screen.getByLabelText(/email/i)).toBeDefined();
  });

  it("no button is removed from keyboard tab order", () => {
    const { container } = renderLoginPage();
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((button) => {
      expect(button.getAttribute("tabindex")).not.toBe("-1");
    });
  });

  it("no password input is rendered (magic-link and OAuth only)", () => {
    const { container } = renderLoginPage();
    expect(container.querySelector("input[type='password']")).toBeNull();
  });
});
