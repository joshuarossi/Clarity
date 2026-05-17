// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  cleanup,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import axe from "axe-core";
import { NewCasePage } from "../../src/routes/NewCasePage";

// ── Mocks ────────────────────────────────────────────────────────────────

const { mockNavigate, mockMutate, mockUseConvexAuth } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockMutate: vi.fn(),
  mockUseConvexAuth: vi.fn(
    () => ({ isLoading: false, isAuthenticated: true }) as const,
  ),
}));

vi.mock("convex/react", () => ({
  useMutation: () => mockMutate,
}));

vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: mockUseConvexAuth,
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

// ── We need MemoryRouter after the mock is set up ───────────────────────
// The partial mock above preserves MemoryRouter from the real module.
import { MemoryRouter } from "react-router-dom";

// ── Setup / Teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  mockNavigate.mockReset();
  mockMutate.mockReset();
  mockUseConvexAuth.mockReturnValue({
    isLoading: false,
    isAuthenticated: true,
  });
});

afterEach(cleanup);

// ── Helpers ──────────────────────────────────────────────────────────────

function renderNewCasePage() {
  return render(
    <MemoryRouter initialEntries={["/cases/new"]}>
      <NewCasePage />
    </MemoryRouter>,
  );
}

const CATEGORIES = [
  { value: "workplace", label: "Workplace" },
  { value: "family", label: "Family" },
  { value: "personal", label: "Personal relationship" },
  { value: "contractual", label: "Contractual / business" },
  { value: "other", label: "Other" },
];

// ── AC: Category selection uses radio cards (not dropdown) ───────────────

describe("AC: Category selection uses radio cards", () => {
  it("renders five radio card elements with correct labels", () => {
    renderNewCasePage();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);

    for (const cat of CATEGORIES) {
      expect(screen.getByLabelText(cat.label)).toBeDefined();
    }
  });

  it("does not render a <select> element for category", () => {
    const { container } = renderNewCasePage();
    expect(container.querySelector("select")).toBeNull();
  });

  it("clicking a radio card updates its checked state", () => {
    renderNewCasePage();
    for (const cat of CATEGORIES) {
      const radio = screen.getByLabelText(cat.label);
      fireEvent.click(radio);
      expect((radio as HTMLInputElement).checked).toBe(true);
    }
  });

  it("each radio input has name='category'", () => {
    renderNewCasePage();
    const radios = screen.getAllByRole("radio");
    for (const radio of radios) {
      expect(radio.getAttribute("name")).toBe("category");
    }
  });
});

// ── AC: Main topic field ─────────────────────────────────────────────────

describe("AC: Main topic field with label, helper text, and character counter", () => {
  it("renders label 'In one sentence, what's this about?'", () => {
    renderNewCasePage();
    expect(
      screen.getByLabelText(/in one sentence, what.?s this about/i),
    ).toBeDefined();
  });

  it("renders helper text mentioning visibility to the other person", () => {
    renderNewCasePage();
    expect(screen.getByText(/visible to the other person/i)).toBeDefined();
  });

  it("shows character counter '0/140' initially", () => {
    renderNewCasePage();
    expect(screen.getByText("0/140")).toBeDefined();
  });

  it("counter updates as user types and shows warning styling past 140 characters", () => {
    renderNewCasePage();
    const input = screen.getByLabelText(/in one sentence, what.?s this about/i);

    // Type exactly 140 characters
    const text140 = "a".repeat(140);
    fireEvent.change(input, { target: { value: text140 } });
    expect(screen.getByText("140/140")).toBeDefined();

    // Type 141 characters — counter should show warning
    const text141 = "a".repeat(141);
    fireEvent.change(input, { target: { value: text141 } });
    const counter = screen.getByText("141/140");
    expect(counter).toBeDefined();
    // Warning styling — check for a warning-related class
    const counterClasses = counter.className;
    expect(
      counterClasses.includes("warning") ||
        counterClasses.includes("amber") ||
        counterClasses.includes("red"),
    ).toBe(true);
  });

  it("does not hard-limit the input at 140 characters (no maxLength)", () => {
    renderNewCasePage();
    const input = screen.getByLabelText(/in one sentence, what.?s this about/i);
    expect(input.getAttribute("maxLength")).toBeNull();
  });
});

// ── AC: Description field with privacy lock and tooltip ──────────────────

describe("AC: Description field has 'Private to you' label with lock icon and tooltip", () => {
  it("renders a 'Private to you' label for the description field", () => {
    renderNewCasePage();
    // There are two "Private to you" labels (description + desired outcome)
    const labels = screen.getAllByText(/private to you/i);
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it("renders tooltip text 'Only you and the AI coach will see this' for description", () => {
    renderNewCasePage();
    // Tooltip text should be present in the DOM (via title, aria-describedby target, or hidden element)
    const tooltipTexts = screen.getAllByText(
      /only you and the ai coach will see this/i,
    );
    expect(tooltipTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("renders a lock icon adjacent to the description 'Private to you' label", () => {
    const { container } = renderNewCasePage();
    // Lock icon should be an SVG (e.g. lucide-react Lock) with an accessible name or class
    const lockIcons = container.querySelectorAll(
      "svg[aria-label*='lock' i], svg[data-testid*='lock' i], svg.lucide-lock",
    );
    expect(lockIcons.length).toBeGreaterThanOrEqual(1);
  });

  it("description textarea has rows=5", () => {
    const { container } = renderNewCasePage();
    // Find textarea associated with the description field
    const textareas = container.querySelectorAll("textarea");
    const descriptionTextarea = Array.from(textareas).find(
      (ta) => ta.getAttribute("rows") === "5",
    );
    expect(descriptionTextarea).not.toBeNull();
  });
});

// ── AC: Desired outcome field ────────────────────────────────────────────

describe("AC: Desired outcome field has 'Private to you' label with lock icon, 3-row textarea", () => {
  it("renders 'Private to you' labels for both private fields", () => {
    renderNewCasePage();
    const labels = screen.getAllByText(/private to you/i);
    // Both description and desired outcome have "Private to you"
    expect(labels.length).toBeGreaterThanOrEqual(2);
  });

  it("renders lock icons for both private fields (description and desired outcome)", () => {
    const { container } = renderNewCasePage();
    // Both description and desired outcome have a lock icon — expect at least 2
    const lockIcons = container.querySelectorAll(
      "svg[aria-label*='lock' i], svg[data-testid*='lock' i], svg.lucide-lock",
    );
    expect(lockIcons.length).toBeGreaterThanOrEqual(2);
  });

  it("desired outcome textarea has rows=3", () => {
    const { container } = renderNewCasePage();
    const textareas = container.querySelectorAll("textarea");
    const outcomeTextarea = Array.from(textareas).find(
      (ta) => ta.getAttribute("rows") === "3",
    );
    expect(outcomeTextarea).not.toBeNull();
  });
});

// ── AC: Other party name field ───────────────────────────────────────────

describe("AC: Other party name field with helper text", () => {
  it("renders helper text 'Just a first name or nickname is fine'", () => {
    renderNewCasePage();
    expect(
      screen.getByText(/just a first name or nickname is fine/i),
    ).toBeDefined();
  });
});

// ── AC: Solo mode checkbox under Advanced disclosure ─────────────────────

describe("AC: Solo mode checkbox under 'Advanced' expandable disclosure", () => {
  it("does not show solo checkbox when Advanced is collapsed", () => {
    renderNewCasePage();
    // The checkbox should not be visible by default
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("expanding Advanced reveals solo mode checkbox", () => {
    const { container } = renderNewCasePage();
    // Find and click the Advanced disclosure toggle
    const summary =
      container.querySelector("summary") ?? screen.getByText(/advanced/i);
    fireEvent.click(summary);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDefined();
    expect(screen.getByText(/solo test case/i)).toBeDefined();
  });

  it("solo checkbox label contains 'I'll play both parties'", () => {
    const { container } = renderNewCasePage();
    const summary =
      container.querySelector("summary") ?? screen.getByText(/advanced/i);
    fireEvent.click(summary);

    expect(screen.getByText(/i.?ll play both parties/i)).toBeDefined();
  });
});

// ── AC: Submit calls cases/create mutation, routes to invite page ────────

describe("AC: Submit calls mutation and routes to post-create invite page", () => {
  it("calls mutation with correct args and navigates on success", async () => {
    mockMutate.mockResolvedValueOnce({
      caseId: "test123",
      inviteUrl: "http://localhost:5173/invite/abc",
    });

    renderNewCasePage();

    // Select category
    fireEvent.click(screen.getByLabelText("Workplace"));

    // Fill main topic
    const topicInput = screen.getByLabelText(
      /in one sentence, what.?s this about/i,
    );
    fireEvent.change(topicInput, {
      target: { value: "Disagreement about project deadlines" },
    });

    // Fill description
    const textareas = document.querySelectorAll("textarea");
    const descriptionTextarea = Array.from(textareas).find(
      (ta) => ta.getAttribute("rows") === "5",
    );
    fireEvent.change(descriptionTextarea!, {
      target: { value: "My coworker keeps pushing back deadlines." },
    });

    // Fill other party name — contract specifies helper text "Just a first name or nickname is fine"
    const nameInput = screen.getByLabelText(/other party/i);
    fireEvent.change(nameInput, { target: { value: "Jordan" } });

    // Submit the form
    fireEvent.click(screen.getByRole("button", { name: /create|submit/i }));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    const callArgs = mockMutate.mock.calls[0][0];
    expect(callArgs.category).toBe("workplace");
    expect(callArgs.mainTopic).toBe("Disagreement about project deadlines");
    expect(callArgs.description).toBe(
      "My coworker keeps pushing back deadlines.",
    );
    // otherPartyName must NOT be sent to mutation
    expect(callArgs.otherPartyName).toBeUndefined();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/cases/test123/invite", {
        state: { otherPartyName: "Jordan" },
      });
    });
  });

  it("includes isSolo in mutation args when solo checkbox is checked", async () => {
    mockMutate.mockResolvedValueOnce({
      caseId: "solo456",
      inviteUrl: null,
    });

    const { container } = renderNewCasePage();

    // Fill required fields
    fireEvent.click(screen.getByLabelText("Workplace"));
    fireEvent.change(
      screen.getByLabelText(/in one sentence, what.?s this about/i),
      { target: { value: "Test topic" } },
    );
    const textareas = container.querySelectorAll("textarea");
    const descriptionTextarea = Array.from(textareas).find(
      (ta) => ta.getAttribute("rows") === "5",
    );
    fireEvent.change(descriptionTextarea!, {
      target: { value: "Test description" },
    });

    // Expand Advanced and check solo
    const summary =
      container.querySelector("summary") ?? screen.getByText(/advanced/i);
    fireEvent.click(summary);
    fireEvent.click(screen.getByRole("checkbox"));

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /create|submit/i }));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    const callArgs = mockMutate.mock.calls[0][0];
    expect(callArgs.isSolo).toBe(true);
  });

  it("navigates to private coaching when isSolo is true", async () => {
    mockMutate.mockResolvedValueOnce({
      caseId: "solo789",
      inviteUrl: null,
    });

    const { container } = renderNewCasePage();

    // Fill required fields
    fireEvent.click(screen.getByLabelText("Family"));
    fireEvent.change(
      screen.getByLabelText(/in one sentence, what.?s this about/i),
      { target: { value: "Family matter" } },
    );
    const textareas = container.querySelectorAll("textarea");
    const descriptionTextarea = Array.from(textareas).find(
      (ta) => ta.getAttribute("rows") === "5",
    );
    fireEvent.change(descriptionTextarea!, {
      target: { value: "Family description" },
    });

    // Enable solo mode
    const summary =
      container.querySelector("summary") ?? screen.getByText(/advanced/i);
    fireEvent.click(summary);
    fireEvent.click(screen.getByRole("checkbox"));

    fireEvent.click(screen.getByRole("button", { name: /create|submit/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/cases/solo789/private");
    });
  });

  it("shows loading state on submit button while mutation is in flight", async () => {
    // Keep mutation pending (never resolves during the test)
    mockMutate.mockReturnValueOnce(new Promise(() => {}));

    const { container } = renderNewCasePage();

    // Fill required fields
    fireEvent.click(screen.getByLabelText("Workplace"));
    fireEvent.change(
      screen.getByLabelText(/in one sentence, what.?s this about/i),
      { target: { value: "Topic" } },
    );
    const textareas = container.querySelectorAll("textarea");
    const descriptionTextarea = Array.from(textareas).find(
      (ta) => ta.getAttribute("rows") === "5",
    );
    fireEvent.change(descriptionTextarea!, {
      target: { value: "Description" },
    });

    const submitButton = screen.getByRole("button", {
      name: /create|submit/i,
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        submitButton.hasAttribute("disabled") ||
          submitButton.textContent?.toLowerCase().includes("creating"),
      ).toBe(true);
    });
  });

  it("shows error message when mutation fails", async () => {
    mockMutate.mockRejectedValueOnce(new Error("No template found"));

    const { container } = renderNewCasePage();

    // Fill required fields
    fireEvent.click(screen.getByLabelText("Workplace"));
    fireEvent.change(
      screen.getByLabelText(/in one sentence, what.?s this about/i),
      { target: { value: "Topic" } },
    );
    const textareas = container.querySelectorAll("textarea");
    const descriptionTextarea = Array.from(textareas).find(
      (ta) => ta.getAttribute("rows") === "5",
    );
    fireEvent.change(descriptionTextarea!, {
      target: { value: "Description" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create|submit/i }));

    await waitFor(() => {
      const errorElement = container.querySelector("[role='alert']");
      expect(errorElement).not.toBeNull();
    });
  });
});

// ── AC: Form validation ──────────────────────────────────────────────────

describe("AC: Form validation — category, main topic, description required", () => {
  it("shows validation errors for all required fields when submitting empty form", async () => {
    const { container } = renderNewCasePage();

    fireEvent.click(screen.getByRole("button", { name: /create|submit/i }));

    await waitFor(() => {
      const alerts = container.querySelectorAll("[role='alert']");
      // At least 3 validation errors: category, main topic, description
      expect(alerts.length).toBeGreaterThanOrEqual(3);
    });

    // Mutation should NOT have been called
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("does not show validation errors for optional fields (desiredOutcome, otherPartyName)", async () => {
    renderNewCasePage();

    // Fill only required fields
    fireEvent.click(screen.getByLabelText("Workplace"));
    fireEvent.change(
      screen.getByLabelText(/in one sentence, what.?s this about/i),
      { target: { value: "Test topic" } },
    );
    const textareas = document.querySelectorAll("textarea");
    const descriptionTextarea = Array.from(textareas).find(
      (ta) => ta.getAttribute("rows") === "5",
    );
    fireEvent.change(descriptionTextarea!, {
      target: { value: "Test description" },
    });

    mockMutate.mockResolvedValueOnce({
      caseId: "val123",
      inviteUrl: "http://localhost:5173/invite/xyz",
    });

    fireEvent.click(screen.getByRole("button", { name: /create|submit/i }));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });
  });

  it("shows error for main topic and description when only category is filled", async () => {
    const { container } = renderNewCasePage();

    fireEvent.click(screen.getByLabelText("Family"));
    fireEvent.click(screen.getByRole("button", { name: /create|submit/i }));

    await waitFor(() => {
      const alerts = container.querySelectorAll("[role='alert']");
      // At least 2 errors: main topic and description
      expect(alerts.length).toBeGreaterThanOrEqual(2);
    });

    expect(mockMutate).not.toHaveBeenCalled();
  });
});

// ── AC: All form elements have proper labels, keyboard-navigable,
//    WCAG AA compliant ────────────────────────────────────────────────────

describe("AC: Accessibility — WCAG AA compliance", () => {
  it("has no axe-core WCAG AA violations", async () => {
    const { container } = renderNewCasePage();
    const results = await axe.run(container, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    });
    expect(results.violations).toHaveLength(0);
  });

  it("all text inputs and textareas have associated labels", () => {
    const { container } = renderNewCasePage();
    const inputs = container.querySelectorAll(
      "input:not([type='hidden']):not([type='radio']), textarea",
    );
    expect(inputs.length).toBeGreaterThan(0);

    inputs.forEach((input) => {
      const id = input.getAttribute("id");
      if (id) {
        const label = container.querySelector(`label[for='${id}']`);
        expect(label).not.toBeNull();
      } else {
        // Input must be wrapped in a label
        expect(input.closest("label")).not.toBeNull();
      }
    });
  });

  it("all radio inputs have associated labels", () => {
    const { container } = renderNewCasePage();
    const radios = container.querySelectorAll("input[type='radio']");
    expect(radios.length).toBe(5);

    radios.forEach((radio) => {
      const id = radio.getAttribute("id");
      if (id) {
        const label = container.querySelector(`label[for='${id}']`);
        expect(label).not.toBeNull();
      } else {
        expect(radio.closest("label")).not.toBeNull();
      }
    });
  });

  it("no interactive element has tabindex='-1'", () => {
    const { container } = renderNewCasePage();
    const interactives = container.querySelectorAll(
      "button, input, textarea, select, a[href], [tabindex]",
    );
    expect(interactives.length).toBeGreaterThan(0);
    interactives.forEach((el) => {
      expect(el.getAttribute("tabindex")).not.toBe("-1");
    });
  });
});

// ── AC: Empty state ──────────────────────────────────────────────────────

describe("Edge case: Empty state renders correctly", () => {
  it("loads with no radio card selected", () => {
    renderNewCasePage();
    const radios = screen.getAllByRole("radio");
    const checkedRadios = radios.filter((r) => (r as HTMLInputElement).checked);
    expect(checkedRadios).toHaveLength(0);
  });

  it("loads with character counter at 0/140", () => {
    renderNewCasePage();
    expect(screen.getByText("0/140")).toBeDefined();
  });

  it("loads with no validation errors visible", () => {
    const { container } = renderNewCasePage();
    const alerts = container.querySelectorAll("[role='alert']");
    expect(alerts).toHaveLength(0);
  });
});
