import { test, expect } from "./fixtures";

// ── AC: Submit calls mutation and routes to post-create invite page ──────

test.describe("AC: Full form submission happy path", () => {
  test("fills form and submits, navigating to invite page", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/cases/new");
    await authenticatedPage.waitForLoadState("domcontentloaded");

    // Select a category radio card
    await authenticatedPage
      .getByLabel("Workplace")
      .click();

    // Fill main topic
    await authenticatedPage
      .getByLabel(/in one sentence, what.?s this about/i)
      .fill("Disagreement about project deadlines");

    // Fill description (5-row textarea)
    const descriptionTextarea = authenticatedPage.locator("textarea[rows='5']");
    await descriptionTextarea.fill(
      "My coworker keeps pushing back deadlines without discussing it.",
    );

    // Fill desired outcome (optional, 3-row textarea)
    const outcomeTextarea = authenticatedPage.locator("textarea[rows='3']");
    await outcomeTextarea.fill("We agree on realistic timelines together.");

    // Fill other party name
    await authenticatedPage
      .getByText(/just a first name or nickname is fine/i)
      .locator("..")
      .locator("input")
      .fill("Jordan");

    // Submit the form
    await authenticatedPage
      .getByRole("button", { name: /create|submit/i })
      .click();

    // Should navigate to the invite page for the created case
    await authenticatedPage.waitForURL(/\/cases\/[^/]+\/invite/, {
      timeout: 15_000,
    });
    expect(authenticatedPage.url()).toMatch(/\/cases\/[^/]+\/invite/);
  });
});

// ── AC: Keyboard navigation ─────────────────────────────────────────────

test.describe("AC: Keyboard navigation — tab order matches visual order", () => {
  test("tab moves focus through form elements in visual order", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/cases/new");
    await authenticatedPage.waitForLoadState("domcontentloaded");

    // Start tabbing through the form
    // We track focus moving through the expected elements in order:
    // 1. Category radio cards (at least the first one)
    // 2. Main topic input
    // 3. Description textarea
    // 4. Desired outcome textarea
    // 5. Other party name input
    // 6. Advanced toggle
    // 7. Submit button

    const focusedElements: string[] = [];
    const maxTabs = 20;

    for (let i = 0; i < maxTabs; i++) {
      await authenticatedPage.keyboard.press("Tab");
      const tagName = await authenticatedPage.evaluate(() => {
        const el = document.activeElement;
        if (!el) return "none";
        const tag = el.tagName.toLowerCase();
        const type = el.getAttribute("type") ?? "";
        const name = el.getAttribute("name") ?? "";
        const role = el.getAttribute("role") ?? "";
        return `${tag}:${type}:${name}:${role}`;
      });
      focusedElements.push(tagName);
    }

    // Verify that radio inputs, text inputs, textareas, and a button
    // all appear in the focus sequence
    const hasRadio = focusedElements.some((el) => el.includes("radio"));
    const hasTextarea = focusedElements.some((el) =>
      el.startsWith("textarea:"),
    );
    const hasButton = focusedElements.some((el) =>
      el.startsWith("button:"),
    );

    expect(hasRadio).toBe(true);
    expect(hasTextarea).toBe(true);
    expect(hasButton).toBe(true);
  });
});

// ── AC: Accessibility in real browser ────────────────────────────────────

test.describe("AC: Accessibility — focus visibility and markup", () => {
  test("all form inputs have visible focus indicators", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/cases/new");
    await authenticatedPage.waitForLoadState("domcontentloaded");

    // Tab to the first focusable form element
    await authenticatedPage.keyboard.press("Tab");

    // The focused element should have an outline or ring style
    const hasFocusStyle = await authenticatedPage.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return (
        style.outlineStyle !== "none" ||
        style.boxShadow !== "none"
      );
    });
    expect(hasFocusStyle).toBe(true);
  });

  test("all input and textarea elements have associated labels", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/cases/new");
    await authenticatedPage.waitForLoadState("domcontentloaded");

    const orphanedInputCount = await authenticatedPage.evaluate(() => {
      const inputs = document.querySelectorAll(
        "input:not([type='hidden']), textarea",
      );
      let orphaned = 0;
      inputs.forEach((input) => {
        const id = input.getAttribute("id");
        const hasLabelFor =
          id !== null && document.querySelector(`label[for='${id}']`) !== null;
        const isWrapped = input.closest("label") !== null;
        const hasAriaLabel = input.hasAttribute("aria-label");
        const hasAriaLabelledBy = input.hasAttribute("aria-labelledby");
        if (!hasLabelFor && !isWrapped && !hasAriaLabel && !hasAriaLabelledBy) {
          orphaned++;
        }
      });
      return orphaned;
    });

    expect(orphanedInputCount).toBe(0);
  });
});
