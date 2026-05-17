// @vitest-environment jsdom

/**
 * WOR-134: Admin template edit page — unit tests for form field rendering
 * and form pre-population with current version content.
 *
 * These tests verify the AdminTemplateEditPage React component renders
 * form fields correctly and pre-populates them from query data.
 *
 * At red state, the AdminTemplateEditPage module does not exist (TS2307).
 * Tests will fail because the import cannot resolve. That is the correct
 * red-state failure — the implementation has not been written yet.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ── Mocks ───────────────────────────────────────────────────────────────

const { mockUseQuery, mockUseMutation } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockUseMutation: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
}));

// Import the component under test.
// TS2307 at red state: src/routes/AdminTemplateEditPage.tsx does not exist yet.
import { AdminTemplateEditPage } from "../../src/routes/AdminTemplateEditPage";

// ── Test fixtures ────────────────────────────────────────────────────────

const TEMPLATE_GET_FIXTURE = {
  _id: "templates:abc123" as const,
  category: "workplace",
  name: "Conflict Resolution Guide",
  currentVersionId: "templateVersions:ver456" as const,
  createdAt: 1700000000000,
  createdByUserId: "users:admin1" as const,
  currentVersion: {
    _id: "templateVersions:ver456" as const,
    templateId: "templates:abc123" as const,
    version: 3,
    globalGuidance:
      "Help parties identify shared goals and communicate clearly.",
    coachInstructions: "Focus on active listening techniques.",
    draftCoachInstructions: "Suggest non-violent communication patterns.",
    notes: "Updated tone for v3 release",
    publishedAt: 1700000000000,
    publishedByUserId: "users:admin1" as const,
  },
  pinnedCasesCount: 5,
};

const VERSIONS_FIXTURE = [
  {
    _id: "templateVersions:ver456" as const,
    templateId: "templates:abc123" as const,
    version: 3,
    globalGuidance:
      "Help parties identify shared goals and communicate clearly.",
    coachInstructions: "Focus on active listening techniques.",
    draftCoachInstructions: "Suggest non-violent communication patterns.",
    notes: "Updated tone for v3 release",
    publishedAt: 1700000000000,
    publishedByUserId: "users:admin1" as const,
  },
  {
    _id: "templateVersions:ver789" as const,
    templateId: "templates:abc123" as const,
    version: 2,
    globalGuidance: "Guide parties through structured dialogue.",
    notes: "Initial rewrite",
    publishedAt: 1699000000000,
    publishedByUserId: "users:admin1" as const,
  },
  {
    _id: "templateVersions:ver012" as const,
    templateId: "templates:abc123" as const,
    version: 1,
    globalGuidance: "Original guidance text.",
    publishedAt: 1698000000000,
    publishedByUserId: "users:admin1" as const,
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/templates/abc123"]}>
      <Routes>
        <Route
          path="/admin/templates/:id"
          element={<AdminTemplateEditPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

// ── Setup / Teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  // useQuery is called twice: first for get (template data), second for listVersions
  let queryCallIndex = 0;
  mockUseQuery.mockImplementation(() => {
    queryCallIndex++;
    if (queryCallIndex % 2 === 1) return TEMPLATE_GET_FIXTURE;
    return VERSIONS_FIXTURE;
  });

  // useMutation returns a callable function for each mutation
  const mockPublish = vi.fn().mockResolvedValue("templateVersions:new");
  const mockArchive = vi.fn().mockResolvedValue(null);
  let mutationCallIndex = 0;
  mockUseMutation.mockImplementation(() => {
    mutationCallIndex++;
    if (mutationCallIndex % 2 === 1) return mockPublish;
    return mockArchive;
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── AC: Form fields: Category (select), Name (text), Global Guidance (large
//    textarea, markdown), Coach Instructions (textarea), Draft Coach
//    Instructions (textarea), Notes (textarea, admin-only changelog) ──────

describe("AC: Form fields render with correct input types", () => {
  it("renders Category as a select or read-only display", () => {
    renderPage();

    // Category is displayed (read-only per contract — not editable via publishNewVersion)
    expect(screen.getByText("workplace")).toBeDefined();
  });

  it("renders Name as text display", () => {
    renderPage();

    // Name is displayed (read-only per contract)
    expect(screen.getByText("Conflict Resolution Guide")).toBeDefined();
  });

  it("renders Global Guidance as a textarea", () => {
    renderPage();

    const textarea = screen.getByLabelText(/global guidance/i);
    expect(textarea.tagName.toLowerCase()).toBe("textarea");
  });

  it("renders Coach Instructions as a textarea", () => {
    renderPage();

    const textarea = screen.getByLabelText(/^coach instructions$/i);
    expect(textarea.tagName.toLowerCase()).toBe("textarea");
  });

  it("renders Draft Coach Instructions as a textarea", () => {
    renderPage();

    const textarea = screen.getByLabelText(/draft coach instructions/i);
    expect(textarea.tagName.toLowerCase()).toBe("textarea");
  });

  it("renders Notes as a textarea", () => {
    renderPage();

    const textarea = screen.getByLabelText(/notes/i);
    expect(textarea.tagName.toLowerCase()).toBe("textarea");
  });
});

// ── AC: Form pre-populated with current version's content when editing ───

describe("AC: Form pre-populated with current version content", () => {
  it("Global Guidance textarea contains current version text", () => {
    renderPage();

    const textarea = screen.getByLabelText(/global guidance/i);
    expect(textarea).toHaveProperty(
      "value",
      "Help parties identify shared goals and communicate clearly.",
    );
  });

  it("Coach Instructions textarea contains current version text", () => {
    renderPage();

    const textarea = screen.getByLabelText(/^coach instructions$/i);
    expect(textarea).toHaveProperty(
      "value",
      "Focus on active listening techniques.",
    );
  });

  it("Draft Coach Instructions textarea contains current version text", () => {
    renderPage();

    const textarea = screen.getByLabelText(/draft coach instructions/i);
    expect(textarea).toHaveProperty(
      "value",
      "Suggest non-violent communication patterns.",
    );
  });

  it("shows loading state when query data is undefined", () => {
    mockUseQuery.mockReturnValue(undefined);
    renderPage();

    // Should not show empty form fields — should show loading indicator
    expect(screen.queryByLabelText(/global guidance/i)).toBeNull();
  });
});

// ── AC: Publish New Version — unit: button calls mutation with correct args

describe("AC: Publish New Version button behavior", () => {
  it("renders Publish New Version as a primary button", () => {
    renderPage();

    const button = screen.getByRole("button", { name: /publish new version/i });
    expect(button).toBeDefined();
  });

  it("Publish button is disabled when Global Guidance is empty", () => {
    renderPage();

    const textarea = screen.getByLabelText(/global guidance/i);
    fireEvent.change(textarea, { target: { value: "" } });

    const button = screen.getByRole("button", { name: /publish new version/i });
    expect(button).toHaveProperty("disabled", true);
  });

  it("calls publishNewVersion mutation with form field values on click", async () => {
    const mockPublish = vi.fn().mockResolvedValue("templateVersions:new");
    let mutationCallIndex = 0;
    mockUseMutation.mockImplementation(() => {
      mutationCallIndex++;
      if (mutationCallIndex % 2 === 1) return mockPublish;
      return vi.fn();
    });

    renderPage();

    const button = screen.getByRole("button", { name: /publish new version/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockPublish).toHaveBeenCalledWith({
        templateId: expect.stringContaining("abc123"),
        globalGuidance:
          "Help parties identify shared goals and communicate clearly.",
        coachInstructions: "Focus on active listening techniques.",
        draftCoachInstructions: "Suggest non-violent communication patterns.",
        notes: expect.stringMatching(/.*/),
      });
    });
  });
});

// ── AC5 (WOR-143): Existing edit flow for valid IDs continues to work — no
//    regression from the /admin/templates/new routing fix ─────────────────

describe("AC5: Edit page with valid ID works correctly (regression guard)", () => {
  it("calls useQuery to load template data for a valid ID", () => {
    renderPage();

    expect(mockUseQuery).toHaveBeenCalled();
  });

  it("pre-populates Global Guidance with current version value", () => {
    renderPage();

    const textarea = screen.getByLabelText(/global guidance/i);
    expect(textarea).toHaveProperty(
      "value",
      "Help parties identify shared goals and communicate clearly.",
    );
  });

  it("pre-populates Coach Instructions with current version value", () => {
    renderPage();

    const textarea = screen.getByLabelText(/^coach instructions$/i);
    expect(textarea).toHaveProperty(
      "value",
      "Focus on active listening techniques.",
    );
  });

  it("renders the template name and category", () => {
    renderPage();

    expect(screen.getByText("Conflict Resolution Guide")).toBeDefined();
    expect(screen.getByText("workplace")).toBeDefined();
  });

  it("renders the Publish New Version button (edit controls available)", () => {
    renderPage();

    expect(
      screen.getByRole("button", { name: /publish new version/i }),
    ).toBeDefined();
  });
});

// ── AC: No input controls if template is archived ────────────────────────

describe("Archived template shows no edit controls", () => {
  it("does not render form fields or action buttons when template is archived", () => {
    const archivedTemplate = {
      ...TEMPLATE_GET_FIXTURE,
      archivedAt: 1700500000000,
    };
    mockUseQuery.mockReturnValue(archivedTemplate);

    renderPage();

    expect(screen.queryByLabelText(/global guidance/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /publish new version/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /archive template/i }),
    ).toBeNull();
  });
});
