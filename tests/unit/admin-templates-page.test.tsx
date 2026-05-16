// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { AdminTemplatesPage } from "../../src/routes/AdminTemplatesPage";

// ── Mocks ────────────────────────────────────────────────────────────────

const { mockNavigate, mockUseQuery } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseQuery: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { MemoryRouter } from "react-router-dom";

// ── Fixture data ─────────────────────────────────────────────────────────

const ACTIVE_TEMPLATE = {
  _id: "templates:abc123" as string,
  _creationTime: 1700000000000,
  category: "Workplace",
  name: "Conflict Resolution",
  currentVersionId: "templateVersions:v1" as string,
  createdAt: 1700000000000,
  createdByUserId: "users:admin1" as string,
  currentVersion: 3,
  pinnedCasesCount: 5,
};

const ARCHIVED_TEMPLATE = {
  _id: "templates:def456" as string,
  _creationTime: 1690000000000,
  category: "Family",
  name: "Family Mediation",
  currentVersionId: "templateVersions:v2" as string,
  archivedAt: 1695000000000,
  createdAt: 1690000000000,
  createdByUserId: "users:admin1" as string,
  currentVersion: 1,
  pinnedCasesCount: 2,
};

const TEMPLATE_NO_VERSION = {
  _id: "templates:ghi789" as string,
  _creationTime: 1680000000000,
  category: "Roommate",
  name: "Roommate Dispute",
  createdAt: 1680000000000,
  createdByUserId: "users:admin1" as string,
  currentVersion: null,
  pinnedCasesCount: 0,
};

// ── Setup / Teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  mockNavigate.mockReset();
  mockUseQuery.mockReset();
});

afterEach(cleanup);

// ── Helpers ──────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/templates"]}>
      <AdminTemplatesPage />
    </MemoryRouter>,
  );
}

// ── AC: Table columns: Category, Name, Current Version (number), Status
//    (Active/Archived badge), Pinned Cases Count ──────────────────────────

describe("AC: Table columns render correctly", () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue([ACTIVE_TEMPLATE, ARCHIVED_TEMPLATE]);
  });

  it("renders all five column headers", () => {
    renderPage();

    expect(screen.getByText("Category")).toBeDefined();
    expect(screen.getByText("Name")).toBeDefined();
    expect(screen.getByText("Current Version")).toBeDefined();
    expect(screen.getByText("Status")).toBeDefined();
    expect(screen.getByText("Pinned Cases")).toBeDefined();
  });

  it("renders category values in table cells", () => {
    renderPage();

    expect(screen.getByText("Workplace")).toBeDefined();
    expect(screen.getByText("Family")).toBeDefined();
  });

  it("renders template names in table cells", () => {
    renderPage();

    expect(screen.getByText("Conflict Resolution")).toBeDefined();
    expect(screen.getByText("Family Mediation")).toBeDefined();
  });

  it("renders current version numbers", () => {
    renderPage();

    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("1")).toBeDefined();
  });

  it("renders Active badge for non-archived templates", () => {
    renderPage();

    expect(screen.getByText("Active")).toBeDefined();
  });

  it("renders Archived badge for archived templates", () => {
    renderPage();

    expect(screen.getByText("Archived")).toBeDefined();
  });

  it("renders pinned cases count", () => {
    renderPage();

    expect(screen.getByText("5")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
  });

  it("uses a semantic table element", () => {
    const { container } = renderPage();

    const table = container.querySelector("table");
    expect(table).not.toBeNull();

    const headerCells = container.querySelectorAll("th");
    expect(headerCells.length).toBeGreaterThanOrEqual(5);
  });
});

// ── AC: + New Template button opens creation form ────────────────────────

describe("AC: + New Template button renders", () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue([ACTIVE_TEMPLATE]);
  });

  it("renders a button with accessible label for creating a new template", () => {
    renderPage();

    const button = screen.getByRole("button", { name: /new template/i });
    expect(button).toBeDefined();
  });

  it("button is visible during loading state", () => {
    mockUseQuery.mockReturnValue(undefined);
    renderPage();

    const button = screen.getByRole("button", { name: /new template/i });
    expect(button).toBeDefined();
  });
});

// ── AC: Archived templates visually distinguished (muted/grayed styling) ─

describe("AC: Archived templates have muted/grayed styling", () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue([ACTIVE_TEMPLATE, ARCHIVED_TEMPLATE]);
  });

  it("archived row has a muted visual class or reduced opacity", () => {
    const { container } = renderPage();

    const rows = Array.from(container.querySelectorAll<HTMLElement>("tbody tr"));
    // Find the archived row (contains "Family Mediation")
    const archivedRow = rows.find((row) =>
      row.textContent?.includes("Family Mediation"),
    );

    expect(archivedRow).toBeDefined();
    if (!archivedRow) throw new Error("archivedRow not found");
    // The archived row should be visually distinguished — either via a CSS
    // class (e.g. "archived", "muted") or inline opacity style
    const hasArchivedClass =
      archivedRow.classList.contains("archived") ||
      archivedRow.classList.contains("muted") ||
      archivedRow.getAttribute("data-archived") === "true";
    const hasReducedOpacity =
      archivedRow.style.opacity !== "" &&
      archivedRow.style.opacity !== "1";

    expect(hasArchivedClass || hasReducedOpacity).toBe(true);
  });

  it("active row does not have muted styling", () => {
    const { container } = renderPage();

    const rows = Array.from(container.querySelectorAll("tbody tr"));
    const activeRow = rows.find((row) =>
      row.textContent?.includes("Conflict Resolution"),
    );

    expect(activeRow).toBeDefined();
    if (!activeRow) throw new Error("activeRow not found");
    const hasArchivedClass =
      activeRow.classList.contains("archived") ||
      activeRow.classList.contains("muted") ||
      activeRow.getAttribute("data-archived") === "true";

    expect(hasArchivedClass).toBe(false);
  });
});

// ── AC: Empty state message ──────────────────────────────────────────────

describe("AC: Empty state renders verbatim message", () => {
  it("shows the exact empty-state message when query returns empty array", () => {
    mockUseQuery.mockReturnValue([]);
    renderPage();

    const expectedMessage =
      "No templates yet. The app will use a built-in default baseline. " +
      "Create a template when you want to tune the Coach\u2019s behavior per category.";

    expect(screen.getByText(expectedMessage)).toBeDefined();
  });

  it("does not show table when there are no templates", () => {
    mockUseQuery.mockReturnValue([]);
    const { container } = renderPage();

    const table = container.querySelector("table");
    expect(table).toBeNull();
  });

  it("+ New Template button remains visible in empty state", () => {
    mockUseQuery.mockReturnValue([]);
    renderPage();

    const button = screen.getByRole("button", { name: /new template/i });
    expect(button).toBeDefined();
  });
});

// ── AC: Click on table row routes to /admin/templates/:id ────────────────

describe("AC: Row click navigates to /admin/templates/:id", () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue([ACTIVE_TEMPLATE]);
  });

  it("clicking a row calls navigate with the template _id", () => {
    const { container } = renderPage();

    const row = container.querySelector<HTMLElement>("tbody tr");
    expect(row).not.toBeNull();
    row!.click();

    expect(mockNavigate).toHaveBeenCalledWith(
      `/admin/templates/${ACTIVE_TEMPLATE._id}`,
    );
  });
});

// ── Loading state ────────────────────────────────────────────────────────

describe("Loading state", () => {
  it("renders skeleton rows when query returns undefined", () => {
    mockUseQuery.mockReturnValue(undefined);
    const { container } = renderPage();

    // Page header should be visible
    expect(screen.getByText("Templates")).toBeDefined();

    // Skeleton rows should be present (placeholder content)
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Null version handling ────────────────────────────────────────────────

describe("Edge case: template with null currentVersion", () => {
  it("renders gracefully when currentVersion is null", () => {
    mockUseQuery.mockReturnValue([TEMPLATE_NO_VERSION]);
    renderPage();

    expect(screen.getByText("Roommate Dispute")).toBeDefined();
    expect(screen.getByText("Roommate")).toBeDefined();
  });
});
