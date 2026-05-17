// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  cleanup,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { InviteAcceptPage } from "../../src/routes/InviteAcceptPage";

// ── Mocks ────────────────────────────────────────────────────────────────

const {
  mockNavigate,
  mockUseQuery,
  mockUseMutation,
  mockUseConvexAuth,
  mockUseParams,
  mockRedeem,
  mockDecline,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseQuery: vi.fn(),
  mockUseMutation: vi.fn(),
  mockUseConvexAuth: vi.fn(
    (): { isLoading: boolean; isAuthenticated: boolean } => ({
      isLoading: false,
      isAuthenticated: true,
    }),
  ),
  mockUseParams: vi.fn(() => ({ token: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef" })),
  mockRedeem: vi.fn(() => Promise.resolve({ caseId: "case-123" })),
  mockDecline: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
}));

vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: mockUseConvexAuth,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: mockUseParams,
  };
});

// ── We need MemoryRouter after the mock is set up ───────────────────────
import { MemoryRouter } from "react-router-dom";

// ── Constants ───────────────────────────────────────────────────────────

const TOKEN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef";

const ACTIVE_INVITE = {
  status: "ACTIVE" as const,
  initiatorName: "Alex",
  mainTopic: "How we split household chores",
  category: "personal",
  caseId: "case-123",
};

// ── Setup / Teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  mockNavigate.mockReset();
  mockUseQuery.mockReset();
  mockUseMutation.mockReset();
  mockRedeem.mockReset();
  mockDecline.mockReset();

  mockRedeem.mockReturnValue(Promise.resolve({ caseId: "case-123" }));
  mockDecline.mockReturnValue(Promise.resolve(null));

  mockUseConvexAuth.mockReturnValue({
    isLoading: false,
    isAuthenticated: true,
  });
  mockUseParams.mockReturnValue({ token: TOKEN });

  // Default: logged-in + active invite
  const FN_NAME = Symbol.for("functionName");
  mockUseQuery.mockImplementation(
    (queryRef: Record<string | symbol, unknown>) => {
      const name: string = (queryRef?.[FN_NAME] as string) ?? "";
      if (
        name.includes("invites:getByToken") ||
        name.includes("invites.getByToken")
      ) {
        return ACTIVE_INVITE;
      }
      return undefined;
    },
  );

  mockUseMutation.mockImplementation(
    (mutationRef: Record<string | symbol, unknown>) => {
      const name: string = (mutationRef?.[FN_NAME] as string) ?? "";
      if (
        name.includes("invites:redeem") ||
        name.includes("invites.redeem")
      ) {
        return mockRedeem;
      }
      if (
        name.includes("invites:decline") ||
        name.includes("invites.decline")
      ) {
        return mockDecline;
      }
      return vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
});

// ── Helpers ──────────────────────────────────────────────────────────────

function renderInviteAcceptPage() {
  return render(
    <MemoryRouter initialEntries={[`/invite/${TOKEN}`]}>
      <InviteAcceptPage />
    </MemoryRouter>,
  );
}

// ── AC 1: Logged-out view ───────────────────────────────────────────────

describe("AC: Logged-out view — centered card with heading, body, sign-in button", () => {
  beforeEach(() => {
    mockUseConvexAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
    });
  });

  it("renders heading containing initiator name and invitation text", () => {
    renderInviteAcceptPage();
    const heading = screen.getByRole("heading", {
      name: /invited you to work through something together/i,
    });
    expect(heading.textContent).toContain("Alex");
  });

  it("renders body text explaining Clarity", () => {
    renderInviteAcceptPage();
    expect(
      screen.getByText(
        /clarity is a private mediation tool/i,
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        /you.?ll each talk with an ai coach privately/i,
      ),
    ).toBeDefined();
  });

  it("renders a 'Sign in to continue' button", () => {
    renderInviteAcceptPage();
    const signInButton = screen.getByRole("button", {
      name: /sign in to continue/i,
    });
    expect(signInButton).toBeDefined();
  });

  it("'Sign in to continue' navigates to /login?redirect=/invite/:token", () => {
    renderInviteAcceptPage();
    const signInButton = screen.getByRole("button", {
      name: /sign in to continue/i,
    });
    fireEvent.click(signInButton);
    expect(mockNavigate).toHaveBeenCalledWith(
      `/login?redirect=/invite/${TOKEN}`,
    );
  });

  it("does NOT show Accept or Decline buttons when logged out", () => {
    renderInviteAcceptPage();
    expect(
      screen.queryByRole("button", { name: /accept invitation/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /decline/i }),
    ).toBeNull();
  });
});

// ── AC 3: Logged-in unredeemed view ─────────────────────────────────────

describe("AC: Logged-in unredeemed view — mainTopic, category, Accept, Decline", () => {
  it("displays the initiator's main topic text", () => {
    renderInviteAcceptPage();
    expect(
      screen.getByText("How we split household chores"),
    ).toBeDefined();
  });

  it("displays the category", () => {
    renderInviteAcceptPage();
    expect(screen.getByText(/personal/i)).toBeDefined();
  });

  it("renders 'Accept invitation' button", () => {
    renderInviteAcceptPage();
    const acceptButton = screen.getByRole("button", {
      name: /accept invitation/i,
    });
    expect(acceptButton).toBeDefined();
  });

  it("renders 'Decline' button", () => {
    renderInviteAcceptPage();
    const declineButton = screen.getByRole("button", {
      name: /decline/i,
    });
    expect(declineButton).toBeDefined();
  });
});

// ── AC 4: Privacy callout ───────────────────────────────────────────────

describe("AC: Privacy callout with initiator name", () => {
  it("renders callout text with initiator name and shared summary language", () => {
    renderInviteAcceptPage();
    expect(
      screen.getByText(
        /alex wrote this in the shared summary/i,
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        /you.?ll have your own private space to share your perspective/i,
      ),
    ).toBeDefined();
  });

  it("does not display description or desiredOutcome fields", () => {
    // Provide a mock that includes private fields to verify the component
    // does not render them even if the query were to return them
    const FN_NAME = Symbol.for("functionName");
    mockUseQuery.mockImplementation(
      (queryRef: Record<string | symbol, unknown>) => {
        const name: string = (queryRef?.[FN_NAME] as string) ?? "";
        if (
          name.includes("invites:getByToken") ||
          name.includes("invites.getByToken")
        ) {
          return {
            ...ACTIVE_INVITE,
            description: "Private initiator description text",
            desiredOutcome: "Private desired outcome text",
          };
        }
        return undefined;
      },
    );

    renderInviteAcceptPage();

    // These private fields must NOT appear in the rendered DOM
    expect(
      screen.queryByText(/private initiator description text/i),
    ).toBeNull();
    expect(
      screen.queryByText(/private desired outcome text/i),
    ).toBeNull();
  });
});

// ── AC 5: Accept flow — redeem mutation + navigation ────────────────────

describe("AC: Accept calls invites/redeem and routes to invitee form", () => {
  it("calls redeem with the token when Accept is clicked", async () => {
    renderInviteAcceptPage();
    const acceptButton = screen.getByRole("button", {
      name: /accept invitation/i,
    });

    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(mockRedeem).toHaveBeenCalledWith({ token: TOKEN });
    });
  });

  it("navigates to /cases/:caseId (case detail orchestrator) after successful redeem", async () => {
    renderInviteAcceptPage();
    const acceptButton = screen.getByRole("button", {
      name: /accept invitation/i,
    });

    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/cases/case-123");
    });
  });
});

// ── AC 6: Decline flow — decline mutation + navigation ──────────────────

describe("AC: Decline calls invites/decline and routes to dashboard", () => {
  it("calls decline with the token when Decline is clicked", async () => {
    renderInviteAcceptPage();
    const declineButton = screen.getByRole("button", {
      name: /decline/i,
    });

    fireEvent.click(declineButton);

    await waitFor(() => {
      expect(mockDecline).toHaveBeenCalledWith({ token: TOKEN });
    });
  });

  it("navigates to /dashboard after successful decline", async () => {
    renderInviteAcceptPage();
    const declineButton = screen.getByRole("button", {
      name: /decline/i,
    });

    fireEvent.click(declineButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
  });
});

// ── AC 7: Consumed token — error message ────────────────────────────────

describe("AC: Consumed token shows error message with navigation options", () => {
  beforeEach(() => {
    const FN_NAME = Symbol.for("functionName");
    mockUseQuery.mockImplementation(
      (queryRef: Record<string | symbol, unknown>) => {
        const name: string = (queryRef?.[FN_NAME] as string) ?? "";
        if (
          name.includes("invites:getByToken") ||
          name.includes("invites.getByToken")
        ) {
          return { status: "CONSUMED" };
        }
        return undefined;
      },
    );
  });

  it("displays error message for consumed token (logged in)", () => {
    renderInviteAcceptPage();
    expect(
      screen.getByText(/this invite has already been accepted/i),
    ).toBeDefined();
  });

  it("shows 'Go to dashboard' link when logged in", () => {
    renderInviteAcceptPage();
    expect(
      screen.getByText(/go to dashboard/i),
    ).toBeDefined();
  });

  it("shows 'Sign in' option when logged out with consumed token", () => {
    mockUseConvexAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
    });
    renderInviteAcceptPage();
    expect(
      screen.getByText(/sign in/i),
    ).toBeDefined();
  });

  it("does NOT show Accept or Decline buttons for consumed token", () => {
    renderInviteAcceptPage();
    expect(
      screen.queryByRole("button", { name: /accept invitation/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /decline/i }),
    ).toBeNull();
  });
});

// ── Edge: Invalid token (null) ──────────────────────────────────────────

describe("Edge case: Invalid token (getByToken returns null)", () => {
  beforeEach(() => {
    const FN_NAME = Symbol.for("functionName");
    mockUseQuery.mockImplementation(
      (queryRef: Record<string | symbol, unknown>) => {
        const name: string = (queryRef?.[FN_NAME] as string) ?? "";
        if (
          name.includes("invites:getByToken") ||
          name.includes("invites.getByToken")
        ) {
          return null;
        }
        return undefined;
      },
    );
  });

  it("displays error message for invalid token", () => {
    renderInviteAcceptPage();
    expect(
      screen.getByText(/this invite link is not valid/i),
    ).toBeDefined();
  });

  it("shows 'Go to dashboard' link when logged in with invalid token", () => {
    renderInviteAcceptPage();
    expect(
      screen.getByText(/go to dashboard/i),
    ).toBeDefined();
  });
});

// ── Edge: Loading state ─────────────────────────────────────────────────

describe("Edge case: Loading state", () => {
  it("renders a loading indicator when getByToken returns undefined", () => {
    const FN_NAME = Symbol.for("functionName");
    mockUseQuery.mockImplementation(
      (queryRef: Record<string | symbol, unknown>) => {
        const name: string = (queryRef?.[FN_NAME] as string) ?? "";
        if (
          name.includes("invites:getByToken") ||
          name.includes("invites.getByToken")
        ) {
          return undefined;
        }
        return undefined;
      },
    );

    const { container } = renderInviteAcceptPage();

    // Should show loading, not content
    expect(
      screen.queryByRole("button", { name: /accept invitation/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /sign in to continue/i }),
    ).toBeNull();

    const spinner =
      container.querySelector("[role='status']") ??
      container.querySelector(".animate-spin") ??
      screen.queryByText(/loading/i);
    expect(spinner).not.toBeNull();
  });

  it("renders a loading indicator when auth is loading", () => {
    mockUseConvexAuth.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
    });

    const { container } = renderInviteAcceptPage();

    const spinner =
      container.querySelector("[role='status']") ??
      container.querySelector(".animate-spin") ??
      screen.queryByText(/loading/i);
    expect(spinner).not.toBeNull();
  });
});
