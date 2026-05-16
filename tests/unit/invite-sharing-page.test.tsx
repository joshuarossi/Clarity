// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  cleanup,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { InviteSharingPage } from "../../src/routes/InviteSharingPage";

// ── Mocks ────────────────────────────────────────────────────────────────

const {
  mockNavigate,
  mockUseQuery,
  mockUseConvexAuth,
  mockUseParams,
  mockUseLocation,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseQuery: vi.fn(),
  mockUseConvexAuth: vi.fn(
    () => ({ isLoading: false, isAuthenticated: true }) as const,
  ),
  mockUseParams: vi.fn(() => ({ caseId: "case123" })),
  mockUseLocation: vi.fn(() => ({
    pathname: "/cases/case123/invite",
    state: { otherPartyName: "Jordan" } as Record<string, string>,
    search: "",
    hash: "",
    key: "default",
  })),
}));

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
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
    useLocation: mockUseLocation,
  };
});

// ── We need MemoryRouter after the mock is set up ───────────────────────
import { MemoryRouter } from "react-router-dom";

// ── Mock clipboard API ──────────────────────────────────────────────────

const mockWriteText = vi.fn(() => Promise.resolve());

// ── Setup / Teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  mockNavigate.mockReset();
  mockUseQuery.mockReset();
  mockUseConvexAuth.mockReturnValue({
    isLoading: false,
    isAuthenticated: true,
  });
  mockUseParams.mockReturnValue({ caseId: "case123" });
  mockUseLocation.mockReturnValue({
    pathname: "/cases/case123/invite",
    state: { otherPartyName: "Jordan" },
    search: "",
    hash: "",
    key: "default",
  });
  mockWriteText.mockClear();

  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: mockWriteText },
    writable: true,
    configurable: true,
  });

  // Default query returns: case (non-solo), partyStates, invite URL
  const FN_NAME = Symbol.for("functionName");
  mockUseQuery.mockImplementation((queryRef: any) => {
    const name: string = queryRef?.[FN_NAME] ?? "";
    if (name.includes("cases:get") || name.includes("cases.get")) {
      return {
        _id: "case123",
        isSolo: false,
        status: "DRAFT_PRIVATE_COACHING",
        initiatorUserId: "user1",
      };
    }
    if (
      name.includes("cases:partyStates") ||
      name.includes("cases.partyStates")
    ) {
      return {
        self: { mainTopic: "project deadlines" },
        other: null,
      };
    }
    if (
      name.includes("invites:getForCase") ||
      name.includes("invites.getForCase")
    ) {
      return {
        token: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef",
        url: "http://localhost:5173/invite/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef",
      };
    }
    return undefined;
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

// ── Helpers ──────────────────────────────────────────────────────────────

function renderInviteSharingPage() {
  return render(
    <MemoryRouter initialEntries={["/cases/case123/invite"]}>
      <InviteSharingPage />
    </MemoryRouter>,
  );
}

const INVITE_URL =
  "http://localhost:5173/invite/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef";

// ── AC: Heading: "Your case is ready. Send this link to [name]." ────────

describe("AC: Heading shows other party's name", () => {
  it("renders heading including the other party name from router state", () => {
    renderInviteSharingPage();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toContain("Jordan");
    expect(heading.textContent).toMatch(/your case is ready/i);
  });
});

// ── AC: Invite link displayed in a large, monospace field with "Copy link" ──

describe("AC: Invite link in monospace field with Copy link button", () => {
  it("displays the invite URL in a monospace-styled element", () => {
    const { container } = renderInviteSharingPage();
    // The invite URL should be displayed in an element with font-mono class
    const monoElements = container.querySelectorAll(".font-mono");
    const urlElement = Array.from(monoElements).find((el) =>
      el.textContent?.includes(INVITE_URL),
    );
    expect(urlElement).not.toBeNull();
  });

  it("displays the invite URL verbatim without truncation", () => {
    renderInviteSharingPage();
    expect(screen.getByText(INVITE_URL)).toBeDefined();
  });

  it("renders a 'Copy link' primary button", () => {
    renderInviteSharingPage();
    const copyButton = screen.getByRole("button", { name: /copy link/i });
    expect(copyButton).toBeDefined();
  });
});

// ── AC: Three share options ─────────────────────────────────────────────

describe("AC: Three share options", () => {
  it("renders a 'Copy for email' option that opens a mailto link", () => {
    const { container } = renderInviteSharingPage();
    // "Copy for email" should be a mailto link
    const mailtoLink = container.querySelector("a[href^='mailto:']");
    expect(mailtoLink).not.toBeNull();
    expect(mailtoLink!.textContent).toMatch(/copy for email|email/i);
    // The mailto href should contain the invite URL in the body
    const href = mailtoLink!.getAttribute("href")!;
    expect(href).toContain(encodeURIComponent(INVITE_URL));
  });

  it("mailto link contains pre-written subject and body with name and topic", () => {
    const { container } = renderInviteSharingPage();
    const mailtoLink = container.querySelector("a[href^='mailto:']");
    expect(mailtoLink).not.toBeNull();
    const href = mailtoLink!.getAttribute("href")!;
    // Should have a subject
    expect(href).toMatch(/subject=/i);
    // Body should reference the other party name and topic
    expect(href).toContain(encodeURIComponent("Jordan"));
    expect(href).toContain(encodeURIComponent("project deadlines"));
  });

  it("renders a 'Copy for text' option that copies a short message to clipboard", async () => {
    renderInviteSharingPage();
    const textButton = screen.getByRole("button", { name: /copy for text/i });
    expect(textButton).toBeDefined();

    fireEvent.click(textButton);

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledTimes(1);
    });

    // The copied text should be the short SMS variant containing the URL
    // Verify the clipboard was called with a string containing the URL
    expect(mockWriteText).toHaveBeenCalledWith(
      expect.stringContaining(INVITE_URL),
    );
  });

  it("renders a 'Just copy the link' option that copies the raw URL", async () => {
    renderInviteSharingPage();
    const justCopyButton = screen.getByRole("button", {
      name: /just copy the link/i,
    });
    expect(justCopyButton).toBeDefined();

    fireEvent.click(justCopyButton);

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith(INVITE_URL);
    });
  });
});

// ── AC: Expandable "What should I tell them?" section ───────────────────

describe("AC: Expandable suggested language section", () => {
  it("renders 'What should I tell them?' as visible text", () => {
    renderInviteSharingPage();
    expect(screen.getByText(/what should i tell them/i)).toBeDefined();
  });

  it("suggested language content is collapsed by default", () => {
    renderInviteSharingPage();
    // The suggested language text must NOT be visible when collapsed
    expect(
      screen.queryByText(/I found this thing called Clarity/i),
    ).toBeNull();
  });

  it("clicking expands to show suggested language", async () => {
    renderInviteSharingPage();
    const toggle = screen.getByText(/what should i tell them/i);
    fireEvent.click(toggle);

    await waitFor(() => {
      // After expanding, the specific suggested language from DesignDoc §4.6 should be visible
      expect(
        screen.getByText(/I found this thing called Clarity/i),
      ).toBeDefined();
    });
  });
});

// ── AC: Secondary CTA ──────────────────────────────────────────────────

describe("AC: Secondary CTA links to private coaching", () => {
  it("renders a link/button with text about starting private coaching", () => {
    renderInviteSharingPage();
    const cta = screen.getByText(/start your private coaching/i);
    expect(cta).toBeDefined();
  });

  it("secondary CTA links to /cases/:caseId/private", () => {
    const { container } = renderInviteSharingPage();
    const link = container.querySelector(
      "a[href='/cases/case123/private']",
    );
    expect(link).not.toBeNull();
    expect(link!.textContent).toMatch(/private coaching/i);
  });
});

// ── AC: Copy feedback ("Copied!") for 2 seconds ────────────────────────

describe("AC: Copy button shows 'Copied!' feedback for 2 seconds", () => {
  it("shows 'Copied!' after clicking 'Copy link' button", async () => {
    renderInviteSharingPage();
    const copyButton = screen.getByRole("button", { name: /copy link/i });

    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByText(/copied!/i)).toBeDefined();
    });
  });

  it("reverts 'Copied!' back to original label after 2 seconds", async () => {
    renderInviteSharingPage();
    const copyButton = screen.getByRole("button", { name: /copy link/i });

    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByText(/copied!/i)).toBeDefined();
    });

    // Advance timers by 2 seconds
    vi.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(screen.queryByText(/copied!/i)).toBeNull();
      expect(
        screen.getByRole("button", { name: /copy link/i }),
      ).toBeDefined();
    });
  });

  it("has an aria-live region for screen reader announcement", () => {
    const { container } = renderInviteSharingPage();
    const ariaLive = container.querySelector("[aria-live='polite']");
    expect(ariaLive).not.toBeNull();
  });
});

// ── AC: Solo mode redirect ──────────────────────────────────────────────

describe("AC: Solo mode cases redirect to private coaching", () => {
  it("redirects to /cases/:caseId/private when case.isSolo is true", async () => {
    const FN_NAME = Symbol.for("functionName");
    mockUseQuery.mockImplementation((queryRef: any) => {
      const name: string = queryRef?.[FN_NAME] ?? "";
      if (name.includes("cases:get") || name.includes("cases.get")) {
        return {
          _id: "case123",
          isSolo: true,
          status: "DRAFT_PRIVATE_COACHING",
          initiatorUserId: "user1",
        };
      }
      if (
        name.includes("cases:partyStates") ||
        name.includes("cases.partyStates")
      ) {
        return { self: { mainTopic: "topic" }, other: null };
      }
      if (
        name.includes("invites:getForCase") ||
        name.includes("invites.getForCase")
      ) {
        return null;
      }
      return undefined;
    });

    renderInviteSharingPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/cases/case123/private", {
        replace: true,
      });
    });
  });

  it("does not render any invite sharing UI when case.isSolo is true", async () => {
    const FN_NAME = Symbol.for("functionName");
    mockUseQuery.mockImplementation((queryRef: any) => {
      const name: string = queryRef?.[FN_NAME] ?? "";
      if (name.includes("cases:get") || name.includes("cases.get")) {
        return {
          _id: "case123",
          isSolo: true,
          status: "DRAFT_PRIVATE_COACHING",
          initiatorUserId: "user1",
        };
      }
      return undefined;
    });

    renderInviteSharingPage();

    // The heading should NOT appear for solo cases
    expect(
      screen.queryByRole("heading", { name: /your case is ready/i }),
    ).toBeNull();
  });
});

// ── Edge: Loading state ──────────────────────────────────────────────────

describe("Edge case: Loading state", () => {
  it("renders a loading spinner when queries return undefined", () => {
    mockUseQuery.mockReturnValue(undefined);

    const { container } = renderInviteSharingPage();

    // Should show a loading indicator, not the main content
    expect(
      screen.queryByRole("heading", { name: /your case is ready/i }),
    ).toBeNull();

    // Check for a loading spinner or loading indicator
    const spinner =
      container.querySelector("[role='status']") ??
      container.querySelector(".animate-spin") ??
      screen.queryByText(/loading/i);
    expect(spinner).not.toBeNull();
  });
});

// ── Edge: Fallback name ──────────────────────────────────────────────────

describe("Edge case: Fallback name when router state is missing", () => {
  it("uses 'the other party' when otherPartyName is not in location state", () => {
    mockUseLocation.mockReturnValue({
      pathname: "/cases/case123/invite",
      state: {},
      search: "",
      hash: "",
      key: "default",
    });

    renderInviteSharingPage();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/the other party/i);
  });
});

// ── Edge: Token consumed ─────────────────────────────────────────────────

describe("Edge case: Token already consumed", () => {
  it("shows a message when getForCase returns null (token consumed)", () => {
    const FN_NAME = Symbol.for("functionName");
    mockUseQuery.mockImplementation((queryRef: any) => {
      const name: string = queryRef?.[FN_NAME] ?? "";
      if (name.includes("cases:get") || name.includes("cases.get")) {
        return {
          _id: "case123",
          isSolo: false,
          status: "DRAFT_PRIVATE_COACHING",
          initiatorUserId: "user1",
        };
      }
      if (
        name.includes("cases:partyStates") ||
        name.includes("cases.partyStates")
      ) {
        return { self: { mainTopic: "topic" }, other: null };
      }
      if (
        name.includes("invites:getForCase") ||
        name.includes("invites.getForCase")
      ) {
        return null;
      }
      return undefined;
    });

    renderInviteSharingPage();

    // Should show a message indicating the link has been used
    expect(
      screen.getByText(/link.*(used|already|joined)/i),
    ).toBeDefined();
  });
});
