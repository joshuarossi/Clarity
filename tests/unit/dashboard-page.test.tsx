// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// The DashboardPage component does not exist yet — the TS2307 import error
// is the expected red-state signal. The contract says it will be created at
// src/routes/DashboardPage.tsx with a single named export.
import { DashboardPage } from "../../src/routes/DashboardPage";

// ── Mock react-router-dom's useNavigate ─────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Mock Convex hooks ───────────────────────────────────────────────────
// DashboardPage calls useQuery(api.cases.listForDashboard). We mock the
// convex/react module so we can control the query return value per test.
let mockQueryReturn: undefined | null | DashboardCase[];

interface DashboardCase {
  _id: string;
  status: string;
  isSolo: boolean;
  category: string;
  createdAt: number;
  updatedAt: number;
  otherPartyName: string | null;
  otherPartyRole: "initiator" | "invitee";
  statusVariant: "pill-turn" | "pill-waiting" | "pill-ready" | "pill-closed";
  statusLabel: string;
}

vi.mock("convex/react", () => ({
  useQuery: () => mockQueryReturn,
}));

afterEach(() => {
  cleanup();
  mockNavigate.mockReset();
});

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <DashboardPage />
    </MemoryRouter>,
  );
}

// ── Fixtures ────────────────────────────────────────────────────────────
const NOW = 1_700_000_000_000;

const activeCases: DashboardCase[] = [
  {
    _id: "case_active_1",
    status: "BOTH_PRIVATE_COACHING",
    isSolo: false,
    category: "workplace",
    createdAt: NOW - 86_400_000 * 3,
    updatedAt: NOW - 60_000,
    otherPartyName: "Jordan",
    otherPartyRole: "invitee",
    statusVariant: "pill-turn",
    statusLabel: "Your turn",
  },
  {
    _id: "case_active_2",
    status: "READY_FOR_JOINT",
    isSolo: false,
    category: "family",
    createdAt: NOW - 86_400_000 * 5,
    updatedAt: NOW - 3_600_000,
    otherPartyName: "Taylor",
    otherPartyRole: "invitee",
    statusVariant: "pill-ready",
    statusLabel: "Ready for joint",
  },
  {
    _id: "case_active_3",
    status: "DRAFT_PRIVATE_COACHING",
    isSolo: false,
    category: "personal",
    createdAt: NOW - 86_400_000,
    updatedAt: NOW - 7_200_000,
    otherPartyName: null,
    otherPartyRole: "invitee",
    statusVariant: "pill-waiting",
    statusLabel: "Waiting",
  },
];

const closedCases: DashboardCase[] = [
  {
    _id: "case_closed_1",
    status: "CLOSED_RESOLVED",
    isSolo: false,
    category: "workplace",
    createdAt: NOW - 86_400_000 * 10,
    updatedAt: NOW - 86_400_000 * 2,
    otherPartyName: "Morgan",
    otherPartyRole: "initiator",
    statusVariant: "pill-closed",
    statusLabel: "Closed",
  },
  {
    _id: "case_closed_2",
    status: "CLOSED_ABANDONED",
    isSolo: false,
    category: "family",
    createdAt: NOW - 86_400_000 * 15,
    updatedAt: NOW - 86_400_000 * 5,
    otherPartyName: "Riley",
    otherPartyRole: "invitee",
    statusVariant: "pill-closed",
    statusLabel: "Closed",
  },
];

const soloCases: DashboardCase[] = [
  {
    _id: "case_solo_1",
    status: "BOTH_PRIVATE_COACHING",
    isSolo: true,
    category: "workplace",
    createdAt: NOW - 86_400_000,
    updatedAt: NOW - 30_000,
    otherPartyName: "Me (Invitee)",
    otherPartyRole: "invitee",
    statusVariant: "pill-turn",
    statusLabel: "Your turn",
  },
];

const allCases = [...activeCases, ...closedCases];

// ── AC: "+ New Case" primary button top right, routes to /cases/new ─────

describe("AC: '+ New Case' button routes to /cases/new", () => {
  beforeEach(() => {
    mockQueryReturn = allCases;
  });

  it("renders a '+ New Case' button", () => {
    renderDashboard();
    const btn = screen.getByRole("button", { name: /new case/i });
    expect(btn).toBeDefined();
  });

  it("navigates to /cases/new on click", () => {
    renderDashboard();
    const btn = screen.getByRole("button", { name: /new case/i });
    fireEvent.click(btn);
    expect(mockNavigate).toHaveBeenCalledWith("/cases/new");
  });
});

// ── AC: Active Cases section shows cases not in CLOSED_* states,
//    sorted by last activity ─────────────────────────────────────────────

describe("AC: Active Cases section shows non-CLOSED cases sorted by updatedAt desc", () => {
  beforeEach(() => {
    mockQueryReturn = allCases;
  });

  it("renders an 'Active Cases' section heading", () => {
    renderDashboard();
    expect(screen.getByText(/active cases/i)).toBeDefined();
  });

  it("displays only non-CLOSED cases in the Active section", () => {
    renderDashboard();
    // Active cases should show these names
    expect(screen.getByText("Jordan")).toBeDefined();
    expect(screen.getByText("Taylor")).toBeDefined();
    // "Waiting for invite" for null otherPartyName case
    expect(screen.getByText(/waiting for invite/i)).toBeDefined();
  });

  it("renders active cases sorted by updatedAt descending", () => {
    const { container } = renderDashboard();
    // Gather all case row elements to verify order.
    // Active cases sorted by updatedAt desc: case_active_1 (most recent),
    // case_active_2, case_active_3.
    const caseRows = container.querySelectorAll("[data-testid^='case-row-']");
    const activeRowIds: string[] = [];
    caseRows.forEach((row) => {
      const id = row.getAttribute("data-testid")?.replace("case-row-", "");
      if (id && !id.startsWith("case_closed")) {
        activeRowIds.push(id);
      }
    });
    expect(activeRowIds).toEqual([
      "case_active_1",
      "case_active_2",
      "case_active_3",
    ]);
  });
});

// ── AC: Closed Cases section collapsed by default, shows CLOSED_* cases ─

describe("AC: Closed Cases section collapsed by default", () => {
  beforeEach(() => {
    mockQueryReturn = allCases;
  });

  it("renders a 'Closed Cases' section heading", () => {
    renderDashboard();
    expect(screen.getByText(/closed cases/i)).toBeDefined();
  });

  it("closed cases are not visible by default (collapsed)", () => {
    renderDashboard();
    // Morgan and Riley are in closed cases. Their names should not be
    // visible when the section is collapsed.
    const morgan = screen.queryByText("Morgan");
    const riley = screen.queryByText("Riley");
    // In a collapsed disclosure/details element, the content is hidden.
    // Either queryByText returns null or the element is not visible.
    const morganHidden =
      morgan === null || morgan.closest("[open]") === null;
    const rileyHidden =
      riley === null || riley.closest("[open]") === null;
    expect(morganHidden).toBe(true);
    expect(rileyHidden).toBe(true);
  });

  it("expanding the Closed Cases section reveals closed cases", () => {
    renderDashboard();
    // Click the disclosure toggle to expand
    const closedHeading = screen.getByText(/closed cases/i);
    fireEvent.click(closedHeading);
    expect(screen.getByText("Morgan")).toBeDefined();
    expect(screen.getByText("Riley")).toBeDefined();
  });
});

// ── AC: Each case row displays required fields ──────────────────────────

describe("AC: Case row displays all required fields", () => {
  beforeEach(() => {
    mockQueryReturn = [activeCases[0]];
  });

  it("displays other party name", () => {
    renderDashboard();
    expect(screen.getByText("Jordan")).toBeDefined();
  });

  it("displays category", () => {
    renderDashboard();
    expect(screen.getByText(/workplace/i)).toBeDefined();
  });

  it("displays StatusPill with correct label", () => {
    renderDashboard();
    expect(screen.getByText("Your turn")).toBeDefined();
  });

  it("displays a formatted created date", () => {
    const { container } = renderDashboard();
    const createdDate = new Date(activeCases[0].createdAt);
    const row = container.querySelector("[data-testid='case-row-case_active_1']");
    expect(row).not.toBeNull();
    const rowText = row!.textContent ?? "";
    // At minimum the row must contain the month and day from createdAt
    const month = createdDate.toLocaleDateString("en-US", { month: "short" });
    const day = String(createdDate.getDate());
    expect(rowText).toContain(month);
    expect(rowText).toContain(day);
  });

  it("displays a formatted last activity time", () => {
    const { container } = renderDashboard();
    const row = container.querySelector("[data-testid='case-row-case_active_1']");
    expect(row).not.toBeNull();
    const rowText = row!.textContent ?? "";
    // activeCases[0].updatedAt = NOW - 60_000 (1 minute before NOW).
    // The implementation may render as relative ("1 min ago") or absolute time.
    const updatedDate = new Date(activeCases[0].updatedAt);
    const updatedMonth = updatedDate.toLocaleDateString("en-US", { month: "short" });
    const updatedDay = String(updatedDate.getDate());
    expect(rowText).toContain(updatedMonth);
    expect(rowText).toContain(updatedDay);
  });

  it("displays a PartyAvatar", () => {
    const { container } = renderDashboard();
    // The case row for case_active_1 should contain a PartyAvatar element.
    // PartyAvatar typically renders with an initial letter of the other party's name.
    const row = container.querySelector("[data-testid='case-row-case_active_1']");
    expect(row).not.toBeNull();
    const rowText = row!.textContent ?? "";
    // Jordan's initial "J" should appear (from the PartyAvatar)
    expect(rowText).toContain("J");
  });

  it("displays an Enter button", () => {
    renderDashboard();
    expect(screen.getByRole("button", { name: /enter/i })).toBeDefined();
  });

  it("renders 'Waiting for invite' when otherPartyName is null", () => {
    mockQueryReturn = [activeCases[2]]; // null otherPartyName
    renderDashboard();
    expect(screen.getByText(/waiting for invite/i)).toBeDefined();
  });
});

// ── AC: Status indicator semantics ──────────────────────────────────────

describe("AC: Status indicator semantics — each variant renders correct label", () => {
  it("pill-turn renders 'Your turn'", () => {
    mockQueryReturn = [activeCases[0]];
    renderDashboard();
    expect(screen.getByText("Your turn")).toBeDefined();
  });

  it("pill-waiting renders 'Waiting'", () => {
    mockQueryReturn = [activeCases[2]];
    renderDashboard();
    expect(screen.getByText("Waiting")).toBeDefined();
  });

  it("pill-ready renders 'Ready for joint'", () => {
    mockQueryReturn = [activeCases[1]];
    renderDashboard();
    expect(screen.getByText("Ready for joint")).toBeDefined();
  });

  it("pill-closed renders 'Closed'", () => {
    // Use a mix of active and closed cases so the Closed section starts
    // collapsed per default behavior (avoids the all-closed auto-expand edge case).
    mockQueryReturn = [activeCases[0], closedCases[0]];
    renderDashboard();
    // Expand the collapsed Closed Cases section
    const closedHeading = screen.getByText(/closed cases/i);
    fireEvent.click(closedHeading);
    expect(screen.getByText("Closed")).toBeDefined();
  });
});

// ── AC: Click on case row routes to /cases/:caseId ──────────────────────

describe("AC: Click on case row navigates to /cases/:caseId", () => {
  beforeEach(() => {
    mockQueryReturn = [activeCases[0]];
  });

  it("clicking a case row navigates to /cases/:caseId", () => {
    renderDashboard();
    const caseRow = screen.getByTestId("case-row-case_active_1");
    fireEvent.click(caseRow);
    expect(mockNavigate).toHaveBeenCalledWith("/cases/case_active_1");
  });
});

// ── AC: Solo mode cases are visually distinct ───────────────────────────

describe("AC: Solo mode cases display a 'Solo' badge", () => {
  it("renders a 'Solo' badge on solo-mode cases", () => {
    mockQueryReturn = [soloCases[0]];
    renderDashboard();
    expect(screen.getByText(/solo/i)).toBeDefined();
  });

  it("does not render 'Solo' badge on two-party cases", () => {
    mockQueryReturn = [activeCases[0]];
    renderDashboard();
    expect(screen.queryByText(/solo/i)).toBeNull();
  });
});

// ── AC: Empty state ─────────────────────────────────────────────────────

describe("AC: Empty state displays verbatim message", () => {
  beforeEach(() => {
    mockQueryReturn = [];
  });

  it("renders the verbatim empty-state message", () => {
    renderDashboard();
    expect(
      screen.getByText(
        "No cases yet. When you're ready to work through something, start a new case.",
      ),
    ).toBeDefined();
  });

  it("does not render Active Cases or Closed Cases sections", () => {
    renderDashboard();
    expect(screen.queryByText(/active cases/i)).toBeNull();
    expect(screen.queryByText(/closed cases/i)).toBeNull();
  });
});

// ── AC: Skeleton loading state — 3 case row skeletons ───────────────────

describe("AC: Skeleton loading state renders exactly 3 skeleton rows", () => {
  beforeEach(() => {
    mockQueryReturn = undefined; // query in-flight
  });

  it("renders exactly 3 skeleton placeholders", () => {
    const { container } = renderDashboard();
    const skeletons = container.querySelectorAll(
      "[data-testid='case-row-skeleton']",
    );
    expect(skeletons.length).toBe(3);
  });

  it("does not render section headers during loading", () => {
    renderDashboard();
    expect(screen.queryByText(/active cases/i)).toBeNull();
    expect(screen.queryByText(/closed cases/i)).toBeNull();
  });

  it("still renders the '+ New Case' button during loading", () => {
    renderDashboard();
    expect(
      screen.getByRole("button", { name: /new case/i }),
    ).toBeDefined();
  });
});
