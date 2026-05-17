import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * WOR-161: src/main.tsx must import src/styles/globals.css
 *
 * The deployed app renders completely unstyled because the Vite entry
 * point never imports the global stylesheet. These tests read source
 * files as strings and assert the import exists and the target file
 * contains the expected design tokens.
 */

const ROOT = resolve(__dirname, "../..");

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf-8");
}

// ── AC1: src/main.tsx imports src/styles/globals.css ────────────────

describe("AC1: src/main.tsx imports globals.css", () => {
  let mainTsxSource: string;

  beforeAll(() => {
    mainTsxSource = readProjectFile("src/main.tsx");
  });

  it("contains an import statement for styles/globals.css", () => {
    expect(mainTsxSource).toMatch(/import\s+['"]\.\/styles\/globals\.css['"]/);
  });
});

// ── AC2: Design-system fonts and CSS custom property tokens ─────────

describe("AC2: globals.css declares design tokens and font variables", () => {
  let mainTsxSource: string;
  let globalsCssSource: string;

  beforeAll(() => {
    mainTsxSource = readProjectFile("src/main.tsx");
    globalsCssSource = readProjectFile("src/styles/globals.css");
  });

  it("src/main.tsx imports globals.css (prerequisite for tokens reaching the build)", () => {
    expect(mainTsxSource).toMatch(/import\s+['"]\.\/styles\/globals\.css['"]/);
  });

  it("globals.css declares the --bg-canvas color token", () => {
    expect(globalsCssSource).toContain("--bg-canvas");
  });

  it("globals.css declares the --font-sans variable referencing Inter", () => {
    expect(globalsCssSource).toContain("--font-sans");
  });
});

// ── AC3: Dark mode via [data-theme="dark"] ──────────────────────────

describe("AC3: dark mode tokens are included via globals.css import", () => {
  let mainTsxSource: string;
  let globalsCssSource: string;

  beforeAll(() => {
    mainTsxSource = readProjectFile("src/main.tsx");
    globalsCssSource = readProjectFile("src/styles/globals.css");
  });

  it("src/main.tsx imports globals.css (prerequisite for dark mode working)", () => {
    expect(mainTsxSource).toMatch(/import\s+['"]\.\/styles\/globals\.css['"]/);
  });

  it('globals.css contains a [data-theme="dark"] selector block', () => {
    expect(globalsCssSource).toMatch(/\[data-theme=["']dark["']\]/);
  });
});
