// @vitest-environment jsdom

/**
 * WOR-143: Admin template create page — unit tests for the creation form
 * that renders at /admin/templates/new.
 *
 * At red state, the AdminTemplateCreatePage module does not exist (TS2307).
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

const { mockNavigate, mockUseMutation, mockUseQuery } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseMutation: vi.fn(),
  mockUseQuery: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Import the component under test.
// TS2307 at red state: src/routes/AdminTemplateCreatePage.tsx does not exist yet.
import { AdminTemplateCreatePage } from "../../src/routes/AdminTemplateCreatePage";

// ── Helpers ──────────────────────────────────────────────────────────────

function renderPage(initialRoute = "/admin/templates/new") {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route
          path="/admin/templates/new"
          element={<AdminTemplateCreatePage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

// ── Setup / Teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  mockNavigate.mockReset();
  mockUseQuery.mockReset();

  const mockCreateFn = vi.fn().mockResolvedValue("templates:newId123");
  mockUseMutation.mockReturnValue(mockCreateFn);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── AC1: When an admin navigates to /admin/templates/new, a template-creation
//    form renders (not a white screen or error) ───────────────────────────

describe("AC1: Create form renders at /admin/templates/new", () => {
  it("renders a heading indicating template creation", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: /new template|create template/i }),
    ).toBeDefined();
  });

  it("does not display an error or argument validation message", () => {
    renderPage();

    expect(screen.queryByText(/error|argumentvalidation/i)).toBeNull();
  });

  it("does not call useQuery for api.admin.get (no invalid ID fetch)", () => {
    renderPage();

    expect(mockUseQuery).not.toHaveBeenCalled();
  });
});

// ── AC2: The creation form includes fields for category, name, global guidance,
//    and role-specific instructions ───────────────────────────────────────

describe("AC2: Form fields present", () => {
  it("renders a Category input", () => {
    renderPage();

    expect(screen.getByLabelText(/category/i)).toBeDefined();
  });

  it("renders a Name input", () => {
    renderPage();

    expect(screen.getByLabelText(/name/i)).toBeDefined();
  });

  it("renders a Global Guidance textarea", () => {
    renderPage();

    const field = screen.getByLabelText(/global guidance/i);
    expect(field).toBeDefined();
  });

  it("renders a Coach Instructions textarea", () => {
    renderPage();

    expect(screen.getByLabelText("Coach Instructions")).toBeDefined();
  });

  it("renders a Draft Coach Instructions textarea", () => {
    renderPage();

    expect(screen.getByLabelText(/draft coach instructions/i)).toBeDefined();
  });
});

// ── AC3: Submitting the form calls api.admin.create with correct args ────

describe("AC3: Form submission calls api.admin.create", () => {
  it("submitting with valid inputs calls the create mutation", async () => {
    const mockCreateFn = vi.fn().mockResolvedValue("templates:newId123");
    mockUseMutation.mockReturnValue(mockCreateFn);

    renderPage();

    fireEvent.change(screen.getByLabelText(/category/i), {
      target: { value: "workplace" },
    });
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Test Template" },
    });
    fireEvent.change(screen.getByLabelText(/global guidance/i), {
      target: { value: "Test guidance" },
    });
    fireEvent.change(screen.getByLabelText("Coach Instructions"), {
      target: { value: "Coach instructions" },
    });
    fireEvent.change(screen.getByLabelText("Draft Coach Instructions"), {
      target: { value: "Draft coach instructions" },
    });

    const submitButton = screen.getByRole("button", { name: /create|submit/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockCreateFn).toHaveBeenCalledWith({
        category: "workplace",
        name: "Test Template",
        globalGuidance: "Test guidance",
        coachInstructions: "Coach instructions",
        draftCoachInstructions: "Draft coach instructions",
      });
    });
  });

  it("submit button is disabled when required fields are empty", () => {
    renderPage();

    const submitButton = screen.getByRole("button", { name: /create|submit/i });
    expect(submitButton).toHaveProperty("disabled", true);
  });
});

// ── AC4: After successful creation, user is redirected to the new template's
//    edit page ────────────────────────────────────────────────────────────

describe("AC4: Navigation after successful creation", () => {
  it("navigates to the new template edit page on success", async () => {
    const mockCreateFn = vi.fn().mockResolvedValue("templates:newId123");
    mockUseMutation.mockReturnValue(mockCreateFn);

    renderPage();

    fireEvent.change(screen.getByLabelText(/category/i), {
      target: { value: "workplace" },
    });
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Test Template" },
    });
    fireEvent.change(screen.getByLabelText(/global guidance/i), {
      target: { value: "Test guidance" },
    });

    const submitButton = screen.getByRole("button", { name: /create|submit/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        "/admin/templates/templates:newId123",
      );
    });
  });
});

// ── AC5: Existing edit flow regression guard is covered in
//    admin-template-edit-page.test.tsx ────────────────────────────────────

// ── AC6: Direct navigation to /admin/templates/new renders the create form
//    without errors ───────────────────────────────────────────────────────

describe("AC6: Direct URL navigation renders create form", () => {
  it("renders create form when navigating directly via URL bar", () => {
    renderPage("/admin/templates/new");

    expect(mockUseQuery).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /create|submit/i }),
    ).toBeDefined();
  });

  it("renders heading and form fields without needing to arrive from list page", () => {
    renderPage("/admin/templates/new");

    expect(
      screen.getByRole("heading", { name: /new template|create template/i }),
    ).toBeDefined();
    expect(screen.getByLabelText(/category/i)).toBeDefined();
    expect(screen.getByLabelText(/name/i)).toBeDefined();
    expect(screen.getByLabelText(/global guidance/i)).toBeDefined();
  });
});
