import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * WOR-103: Theme and style setup — token and CSS tests
 *
 * These tests parse the raw CSS and HTML files as strings to verify that
 * all design tokens, font references, typography scale, chat bubble
 * variants, and font smoothing rules are correctly declared.
 *
 * At red state the files under src/styles/ and index.html do not exist
 * yet, so readFileSync will throw — that is the expected red-state
 * failure. The tests themselves are valid TypeScript.
 */

// ── Helpers ──────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, "../..");

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf-8");
}

/**
 * Extracts the content of a CSS block matching the given selector.
 * Returns the text between the opening `{` and closing `}` for the
 * first rule whose selector matches `selectorPattern`.
 */
function extractCssBlock(css: string, selectorPattern: RegExp): string {
  const lines = css.split("\n");
  let depth = 0;
  let capturing = false;
  let block = "";

  for (const line of lines) {
    if (!capturing && selectorPattern.test(line)) {
      capturing = true;
      // Start after the opening brace on this line (if present)
      const braceIdx = line.indexOf("{");
      if (braceIdx !== -1) {
        block += line.slice(braceIdx + 1) + "\n";
        depth = 1;
      }
      continue;
    }
    if (capturing) {
      for (const ch of line) {
        if (ch === "{") depth++;
        if (ch === "}") depth--;
      }
      if (depth <= 0) {
        break;
      }
      block += line + "\n";
    }
  }
  return block;
}

// ── Canonical token lists (from StyleGuide §2.2) ─────────────────────

const COLOR_TOKENS = [
  // Neutrals
  "--bg-canvas",
  "--bg-surface",
  "--bg-surface-subtle",
  "--text-primary",
  "--text-secondary",
  "--text-tertiary",
  "--border-default",
  "--border-strong",
  // Accent (Sage)
  "--accent",
  "--accent-hover",
  "--accent-subtle",
  "--accent-on",
  // Coach (Dusty Lavender)
  "--coach-accent",
  "--coach-subtle",
  // Party Colors
  "--party-initiator",
  "--party-initiator-subtle",
  "--party-invitee",
  "--party-invitee-subtle",
  // Feedback
  "--danger",
  "--danger-subtle",
  "--warning",
  "--warning-subtle",
  "--success",
  // Tints
  "--private-tint",
];

// ── AC: globals.css declares all color tokens (light + dark) ─────────

describe("AC: globals.css color tokens for both light and dark themes", () => {
  let globalsCss: string;

  beforeAll(() => {
    globalsCss = readProjectFile("src/styles/globals.css");
  });

  it("declares all color tokens under :root (light theme)", () => {
    const rootBlock = extractCssBlock(globalsCss, /^\s*:root\s*\{/);
    for (const token of COLOR_TOKENS) {
      expect(
        rootBlock,
        `Missing ${token} in :root`,
      ).toContain(token);
    }
  });

  it('declares all color tokens under [data-theme="dark"]', () => {
    const darkBlock = extractCssBlock(
      globalsCss,
      /\[data-theme=["']dark["']\]/,
    );
    for (const token of COLOR_TOKENS) {
      expect(
        darkBlock,
        `Missing ${token} in [data-theme="dark"]`,
      ).toContain(token);
    }
  });

  it("every token declared in :root is also declared in dark theme (parity)", () => {
    // Extract all custom property names from :root
    const rootBlock = extractCssBlock(globalsCss, /^\s*:root\s*\{/);
    const rootTokens = [
      ...rootBlock.matchAll(/(--[\w-]+)\s*:/g),
    ].map((m) => m[1]);

    const darkBlock = extractCssBlock(
      globalsCss,
      /\[data-theme=["']dark["']\]/,
    );

    for (const token of rootTokens) {
      expect(
        darkBlock,
        `Token ${token} found in :root but missing in dark theme`,
      ).toContain(token);
    }
  });
});

// ── AC: Spacing, radius, shadow, and motion tokens ───────────────────

describe("AC: spacing, radius, shadow, and motion tokens", () => {
  let globalsCss: string;

  beforeAll(() => {
    globalsCss = readProjectFile("src/styles/globals.css");
  });

  const RADIUS_TOKENS = [
    "--radius-sm",
    "--radius-md",
    "--radius-lg",
    "--radius-xl",
    "--radius-full",
  ];

  const SHADOW_TOKENS = [
    "--shadow-0",
    "--shadow-1",
    "--shadow-2",
    "--shadow-3",
  ];

  const MOTION_TOKENS = [
    "--ease-out",
    "--dur-fast",
    "--dur-medium",
  ];

  it.each(RADIUS_TOKENS)(
    "declares radius token %s",
    (token) => {
      expect(globalsCss).toContain(token);
    },
  );

  it.each(SHADOW_TOKENS)(
    "declares shadow token %s",
    (token) => {
      expect(globalsCss).toContain(token);
    },
  );

  it.each(MOTION_TOKENS)(
    "declares motion token %s",
    (token) => {
      expect(globalsCss).toContain(token);
    },
  );
});

// ── AC: Google Fonts loaded (Inter + JetBrains Mono) ─────────────────

describe("AC: Google Fonts — Inter and JetBrains Mono", () => {
  let indexHtml: string;

  beforeAll(() => {
    indexHtml = readProjectFile("index.html");
  });

  it("references Inter font with weights 400, 500, 600", () => {
    expect(indexHtml).toMatch(/Inter/);
    // All three weights must be present somewhere in the font link/import
    expect(indexHtml).toMatch(/400/);
    expect(indexHtml).toMatch(/500/);
    expect(indexHtml).toMatch(/600/);
  });

  it("references JetBrains Mono font with weights 400, 500", () => {
    expect(indexHtml).toMatch(/JetBrains\+?Mono/i);
  });

  it("includes preconnect for Google Fonts", () => {
    expect(indexHtml).toMatch(/fonts\.googleapis\.com/);
    expect(indexHtml).toMatch(/fonts\.gstatic\.com/);
  });
});

// ── AC: Typography scale ─────────────────────────────────────────────

describe("AC: typography scale CSS variables", () => {
  let globalsCss: string;

  beforeAll(() => {
    globalsCss = readProjectFile("src/styles/globals.css");
  });

  const TYPOGRAPHY_ROLES = [
    "display",
    "h1",
    "h2",
    "h3",
    "body",
    "chat",
    "label",
    "meta",
    "timestamp",
  ];

  it.each(TYPOGRAPHY_ROLES)(
    "declares font-size variable for role: %s",
    (role) => {
      expect(globalsCss).toMatch(
        new RegExp(`--font-size-${role}\\s*:`),
      );
    },
  );

  it("declares font family variables for sans and mono", () => {
    expect(globalsCss).toMatch(/--font-sans\s*:/);
    expect(globalsCss).toMatch(/--font-mono\s*:/);
  });
});

// ── AC: Chat bubble variants in components.css ───────────────────────

describe("AC: chat bubble variants in components.css", () => {
  let componentsCss: string;

  beforeAll(() => {
    componentsCss = readProjectFile("src/styles/components.css");
  });

  const BUBBLE_CLASSES: Array<{
    selector: string;
    bgToken: string;
    border: string | null;
  }> = [
    {
      selector: ".cc-bubble",
      bgToken: "--bg-surface",
      border: "--border-default",
    },
    {
      selector: ".cc-bubble-coach",
      bgToken: "--accent-subtle",
      border: null,
    },
    {
      selector: ".cc-bubble-coach-joint",
      bgToken: "--coach-subtle",
      border: "--coach-accent",
    },
    {
      selector: ".cc-bubble-coach-intervention",
      bgToken: "--coach-subtle",
      border: "--coach-accent",
    },
    {
      selector: ".cc-bubble-party-initiator",
      bgToken: "--party-initiator-subtle",
      border: null,
    },
    {
      selector: ".cc-bubble-party-invitee",
      bgToken: "--party-invitee-subtle",
      border: null,
    },
    {
      selector: ".cc-bubble-error",
      bgToken: "--danger-subtle",
      border: "--danger",
    },
  ];

  it.each(BUBBLE_CLASSES)(
    "contains $selector class with correct background token",
    ({ selector, bgToken }) => {
      // The selector must appear as a CSS class definition
      const selectorEscaped = selector.replace(/\./g, "\\.");
      const selectorRegex = new RegExp(selectorEscaped);
      expect(componentsCss).toMatch(selectorRegex);

      // Extract the block for this selector and verify bg token
      const block = extractCssBlock(
        componentsCss,
        new RegExp(selectorEscaped + "\\s*\\{"),
      );
      expect(
        block,
        `${selector} should reference background token ${bgToken}`,
      ).toContain(bgToken);
    },
  );

  it.each(
    BUBBLE_CLASSES.filter((b) => b.border !== null),
  )(
    "contains $selector class with correct border token",
    ({ selector, border }) => {
      const selectorEscaped = selector.replace(/\./g, "\\.");
      const block = extractCssBlock(
        componentsCss,
        new RegExp(selectorEscaped + "\\s*\\{"),
      );
      expect(
        block,
        `${selector} should reference border token ${border}`,
      ).toContain(border!);
    },
  );

  it("defines @keyframes cc-blink animation", () => {
    expect(componentsCss).toMatch(/@keyframes\s+cc-blink/);
  });

  it("defines .cc-streaming-cursor class with cc-blink animation", () => {
    expect(componentsCss).toMatch(/\.cc-streaming-cursor/);
    const block = extractCssBlock(
      componentsCss,
      /\.cc-streaming-cursor\s*\{/,
    );
    expect(block).toContain("cc-blink");
  });
});

// ── AC: Font smoothing rules on html element ─────────────────────────

describe("AC: font smoothing rules on html element", () => {
  let globalsCss: string;

  beforeAll(() => {
    globalsCss = readProjectFile("src/styles/globals.css");
  });

  it("sets -webkit-font-smoothing: antialiased on html", () => {
    const htmlBlock = extractCssBlock(globalsCss, /^\s*html\s*\{/m);
    expect(htmlBlock).toContain("-webkit-font-smoothing: antialiased");
  });

  it("sets -moz-osx-font-smoothing: grayscale on html", () => {
    const htmlBlock = extractCssBlock(globalsCss, /^\s*html\s*\{/m);
    expect(htmlBlock).toContain("-moz-osx-font-smoothing: grayscale");
  });

  it("sets text-rendering: optimizeLegibility on html", () => {
    const htmlBlock = extractCssBlock(globalsCss, /^\s*html\s*\{/m);
    expect(htmlBlock).toContain("text-rendering: optimizeLegibility");
  });
});

// ── AC: globals.css imports components.css ────────────────────────────

describe("globals.css imports components.css", () => {
  let globalsCss: string;

  beforeAll(() => {
    globalsCss = readProjectFile("src/styles/globals.css");
  });

  it("contains @import for components.css", () => {
    expect(globalsCss).toMatch(/@import\s+['"]\.\/components\.css['"]/);
  });
});

// ── Invariant: focus-visible ring utility ────────────────────────────

describe("focus-visible ring utility", () => {
  let globalsCss: string;

  beforeAll(() => {
    globalsCss = readProjectFile("src/styles/globals.css");
  });

  it("declares a :focus-visible rule referencing --accent", () => {
    expect(globalsCss).toMatch(/:focus-visible/);
    // The focus ring should reference the accent token
    expect(globalsCss).toContain("--accent");
  });
});

// ── Invariant: prefers-reduced-motion wrapping in CSS ────────────────

describe("prefers-reduced-motion in globals.css", () => {
  let globalsCss: string;

  beforeAll(() => {
    globalsCss = readProjectFile("src/styles/globals.css");
  });

  it("contains @media (prefers-reduced-motion) declaration", () => {
    expect(globalsCss).toMatch(
      /@media\s*\(\s*prefers-reduced-motion/,
    );
  });
});

// ── Invariant: theme.ts values match CSS tokens ─────────────────────

describe("theme.ts token mirror", () => {
  let themeModule: { light: Record<string, string>; dark: Record<string, string> };

  beforeAll(async () => {
    // Dynamic import of the theme module — convert to Record via Object.fromEntries
    // so we can index with dynamic string keys in assertions below.
    const imported = await import("../../src/styles/theme");
    themeModule = {
      light: Object.fromEntries(Object.entries(imported.default.light)),
      dark: Object.fromEntries(Object.entries(imported.default.dark)),
    };
  });

  it("exports light and dark keys", () => {
    expect(themeModule).toHaveProperty("light");
    expect(themeModule).toHaveProperty("dark");
  });

  const EXPECTED_THEME_KEYS = [
    "bgCanvas",
    "bgSurface",
    "bgSurfaceSubtle",
    "textPrimary",
    "textSecondary",
    "textTertiary",
    "borderDefault",
    "borderStrong",
    "accent",
    "accentHover",
    "accentSubtle",
    "accentOn",
    "coachAccent",
    "coachSubtle",
    "partyInitiator",
    "partyInitiatorSubtle",
    "partyInvitee",
    "partyInviteeSubtle",
    "danger",
    "dangerSubtle",
    "warning",
    "warningSubtle",
    "success",
    "privateTint",
  ];

  it.each(EXPECTED_THEME_KEYS)(
    "light theme contains key: %s",
    (key) => {
      expect(themeModule.light).toHaveProperty(key);
      expect(typeof themeModule.light[key]).toBe("string");
    },
  );

  it.each(EXPECTED_THEME_KEYS)(
    "dark theme contains key: %s",
    (key) => {
      expect(themeModule.dark).toHaveProperty(key);
      expect(typeof themeModule.dark[key]).toBe("string");
    },
  );

  it("light.bgCanvas matches the StyleGuide value", () => {
    expect(themeModule.light.bgCanvas.toLowerCase()).toBe("#faf8f5");
  });

  it("dark.bgCanvas matches the StyleGuide value", () => {
    expect(themeModule.dark.bgCanvas.toLowerCase()).toBe("#1a1816");
  });

  it("light.accent matches the StyleGuide sage value", () => {
    expect(themeModule.light.accent.toLowerCase()).toBe("#6b8e7f");
  });

  it("dark.accent matches the StyleGuide sage value", () => {
    expect(themeModule.dark.accent.toLowerCase()).toBe("#89a99b");
  });
});
