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
import { ProfilePage } from "../../src/routes/ProfilePage";

// ── Mocks ────────────────────────────────────────────────────────────────

const {
  mockSignOut,
  mockUseConvexAuth,
  mockUseQuery,
  mockMutate,
  mockUseMutation,
} = vi.hoisted(() => {
  const mutate = vi.fn(() => Promise.resolve(null));
  return {
    mockSignOut: vi.fn(() => Promise.resolve()),
    mockUseConvexAuth: vi.fn(
      () => ({ isLoading: false, isAuthenticated: true } as const),
    ),
    mockUseQuery: vi.fn(() => ({
      _id: "user123",
      email: "test@example.com",
      displayName: "Test User",
      role: "USER",
      createdAt: Date.now(),
    })),
    mockMutate: mutate,
    mockUseMutation: vi.fn(() => mutate),
  };
});

vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: mockUseConvexAuth,
  useAuthActions: () => ({ signOut: mockSignOut }),
}));

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
}));

// ── Setup / Teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  mockSignOut.mockImplementation(() => Promise.resolve());
  mockUseConvexAuth.mockReturnValue({
    isLoading: false,
    isAuthenticated: true,
  });
  mockUseQuery.mockReturnValue({
    _id: "user123",
    email: "test@example.com",
    displayName: "Test User",
    role: "USER",
    createdAt: Date.now(),
  });
  mockMutate.mockImplementation(() => Promise.resolve(null));
  mockUseMutation.mockReturnValue(mockMutate);
});

afterEach(cleanup);

// ── Helpers ──────────────────────────────────────────────────────────────

function renderProfilePage() {
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <ProfilePage />
    </MemoryRouter>,
  );
}

// ── AC: Profile page (/profile) shows display name (editable), email
//    (read-only), sign-out button ─────────────────────────────────────────

describe("AC: Profile page displays user info", () => {
  it("shows display name in an editable input", () => {
    renderProfilePage();
    const nameInput = screen.getByDisplayValue("Test User");
    expect(nameInput).toBeDefined();
    expect(nameInput.tagName).toBe("INPUT");
    expect((nameInput as HTMLInputElement).readOnly).toBe(false);
    expect((nameInput as HTMLInputElement).disabled).toBe(false);
  });

  it("shows email as read-only text", () => {
    renderProfilePage();
    expect(screen.getByText("test@example.com")).toBeDefined();

    // If email happens to be in an input, it must be disabled or readonly
    const emailInput = screen.queryByDisplayValue("test@example.com");
    if (emailInput) {
      const input = emailInput as HTMLInputElement;
      expect(input.readOnly || input.disabled).toBe(true);
    }
  });

  it("renders a sign-out button", () => {
    renderProfilePage();
    expect(
      screen.getByRole("button", { name: /sign out|log out/i }),
    ).toBeDefined();
  });
});

// ── AC: Display name save triggers updateDisplayName mutation ─────────────

describe("AC: Display name update", () => {
  it("changing display name and clicking save calls updateDisplayName mutation", async () => {
    renderProfilePage();
    const nameInput = screen.getByDisplayValue("Test User");

    fireEvent.change(nameInput, { target: { value: "New Name" } });

    const saveButton = screen.getByRole("button", { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({ displayName: "New Name" });
    });
  });
});

// ── AC: Sign-out button triggers signOut ─────────────────────────────────

describe("AC: Sign-out functionality", () => {
  it("clicking sign-out calls signOut from auth actions", async () => {
    renderProfilePage();
    fireEvent.click(
      screen.getByRole("button", { name: /sign out|log out/i }),
    );

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });
});

// ── AC: Accessibility — WCAG AA compliance ───────────────────────────────

describe("AC: Accessibility — WCAG AA compliance", () => {
  it("has no axe-core WCAG AA violations", async () => {
    const { container } = renderProfilePage();
    const results = await axe.run(container, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    });
    expect(results.violations).toHaveLength(0);
  });

  it("display name input has an associated label", () => {
    renderProfilePage();
    expect(screen.getByLabelText(/display name|name/i)).toBeDefined();
  });
});
