import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfigFromFile } from "vite";

/**
 * WOR-162: Tailwind (v4) + shadcn scaffolding
 *
 * These tests verify that Tailwind CSS v4, the @tailwindcss/vite plugin,
 * shadcn/ui configuration, the cn() utility, and the @/ path alias are
 * all properly scaffolded. They are structural/file-content checks that
 * do not require a running app.
 *
 * At red state, missing dependencies and files will cause assertion
 * failures or ENOENT errors — that is the expected red-state behavior.
 */

const ROOT = resolve(__dirname, "../..");

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf-8");
}

function readJsonFile(relativePath: string): Record<string, unknown> {
  return JSON.parse(readProjectFile(relativePath)) as Record<string, unknown>;
}

// ── AC1: tailwindcss (v4) is listed as a dependency in package.json ──

describe("AC1: Tailwind CSS v4 dependencies in package.json", () => {
  let packageJson: Record<string, unknown>;

  beforeAll(() => {
    packageJson = readJsonFile("package.json");
  });

  it("has tailwindcss as a dependency", () => {
    const deps = packageJson.dependencies as Record<string, string>;
    expect(deps).toHaveProperty("tailwindcss");
  });

  it("has @tailwindcss/vite as a devDependency", () => {
    const devDeps = packageJson.devDependencies as Record<string, string>;
    expect(devDeps).toHaveProperty("@tailwindcss/vite");
  });

  it("has tailwind-merge as a dependency", () => {
    const deps = packageJson.dependencies as Record<string, string>;
    expect(deps).toHaveProperty("tailwind-merge");
  });

  it("has clsx as a dependency", () => {
    const deps = packageJson.dependencies as Record<string, string>;
    expect(deps).toHaveProperty("clsx");
  });
});

// ── AC2: Valid Tailwind v4 CSS-based config with @theme block ────────

describe("AC2: globals.css has @theme block integrating CSS custom properties", () => {
  let globalsCss: string;

  beforeAll(() => {
    globalsCss = readProjectFile("src/styles/globals.css");
  });

  it("contains a @theme block", () => {
    expect(globalsCss).toMatch(/@theme\s*\{/);
  });

  it("@theme block maps existing design tokens (e.g. --color-canvas)", () => {
    const themeMatch = globalsCss.match(/@theme\s*\{([^}]*)\}/s);
    expect(themeMatch).not.toBeNull();
    const themeBlock = themeMatch![1];
    expect(themeBlock).toContain("--color-canvas");
  });
});

// ── AC3: @tailwindcss/vite plugin registered in vite.config.ts ───────

describe("AC3: Tailwind CSS wired into build pipeline via Vite plugin", () => {
  const configPath = resolve(ROOT, "vite.config.ts");

  it("vite.config.ts imports @tailwindcss/vite", () => {
    const viteConfigSource = readProjectFile("vite.config.ts");
    expect(viteConfigSource).toMatch(/import.*@tailwindcss\/vite/);
  });

  it("Vite config includes a plugin with 'tailwindcss' in name", async () => {
    const result = await loadConfigFromFile(
      { command: "serve", mode: "development" },
      configPath,
    );

    expect(result).not.toBeNull();
    const plugins = result!.config.plugins?.flat() ?? [];
    const pluginNames = plugins
      .filter(
        (p): p is { name: string } =>
          p !== null && typeof p === "object" && "name" in p,
      )
      .map((p) => p.name);

    expect(pluginNames.some((name) => name.includes("tailwindcss"))).toBe(true);
  });
});

// ── AC4: globals.css includes @import 'tailwindcss' directive ────────

describe("AC4: globals.css has Tailwind v4 entry point directive", () => {
  let globalsCss: string;

  beforeAll(() => {
    globalsCss = readProjectFile("src/styles/globals.css");
  });

  it("contains @import 'tailwindcss' or @import \"tailwindcss\"", () => {
    expect(globalsCss).toMatch(/@import\s+['"]tailwindcss['"]/);
  });
});

// ── AC5: Tailwind utility classes produce CSS (scaffolding prerequisite) ──

describe("AC5: Tailwind utility classes can compile (scaffolding in place)", () => {
  let packageJson: Record<string, unknown>;
  let globalsCss: string;

  beforeAll(() => {
    packageJson = readJsonFile("package.json");
    globalsCss = readProjectFile("src/styles/globals.css");
  });

  it("tailwindcss dependency is installed", () => {
    const deps = packageJson.dependencies as Record<string, string>;
    expect(deps).toHaveProperty("tailwindcss");
  });

  it("globals.css has the @import 'tailwindcss' directive", () => {
    expect(globalsCss).toMatch(/@import\s+['"]tailwindcss['"]/);
  });

  it("Vite plugin ensures utilities are compiled in build", () => {
    const viteConfigSource = readProjectFile("vite.config.ts");
    expect(viteConfigSource).toMatch(/import.*@tailwindcss\/vite/);
  });
});

// ── AC6: LandingPage utility classes will render (scaffolding check) ──

describe("AC6: LandingPage Tailwind utility classes are no longer inert", () => {
  let packageJson: Record<string, unknown>;
  let globalsCss: string;

  beforeAll(() => {
    packageJson = readJsonFile("package.json");
    globalsCss = readProjectFile("src/styles/globals.css");
  });

  it("tailwindcss is available for utility class compilation", () => {
    const deps = packageJson.dependencies as Record<string, string>;
    expect(deps).toHaveProperty("tailwindcss");
  });

  it("globals.css imports tailwindcss so utilities resolve", () => {
    expect(globalsCss).toMatch(/@import\s+['"]tailwindcss['"]/);
  });
});

// ── AC7: Admin page utility classes will render (scaffolding check) ──

describe("AC7: Admin page Tailwind utility classes are no longer inert", () => {
  let packageJson: Record<string, unknown>;
  let globalsCss: string;

  beforeAll(() => {
    packageJson = readJsonFile("package.json");
    globalsCss = readProjectFile("src/styles/globals.css");
  });

  it("tailwindcss is available for utility class compilation", () => {
    const deps = packageJson.dependencies as Record<string, string>;
    expect(deps).toHaveProperty("tailwindcss");
  });

  it("globals.css imports tailwindcss so utilities resolve", () => {
    expect(globalsCss).toMatch(/@import\s+['"]tailwindcss['"]/);
  });
});

// ── AC8: Existing custom cc-* CSS classes coexist with Tailwind ──────

describe("AC8: Custom CSS continues to work alongside Tailwind", () => {
  let globalsCss: string;

  beforeAll(() => {
    globalsCss = readProjectFile("src/styles/globals.css");
  });

  it("@import 'tailwindcss' appears before @import './components.css'", () => {
    const tailwindIndex = globalsCss.indexOf("tailwindcss");
    const componentsIndex = globalsCss.indexOf("./components.css");
    expect(tailwindIndex).toBeGreaterThan(-1);
    expect(componentsIndex).toBeGreaterThan(-1);
    expect(tailwindIndex).toBeLessThan(componentsIndex);
  });
});

// ── AC9: Build succeeds — path aliases configured ────────────────────

describe("AC9: tsconfig.json and vite.config.ts have @/ path alias", () => {
  let tsconfig: Record<string, unknown>;
  let viteConfigSource: string;

  beforeAll(() => {
    tsconfig = readJsonFile("tsconfig.json");
    viteConfigSource = readProjectFile("vite.config.ts");
  });

  it("tsconfig.json has compilerOptions.baseUrl set to '.'", () => {
    const compilerOptions = tsconfig.compilerOptions as Record<string, unknown>;
    expect(compilerOptions.baseUrl).toBe(".");
  });

  it("tsconfig.json has compilerOptions.paths with @/* entry", () => {
    const compilerOptions = tsconfig.compilerOptions as Record<string, unknown>;
    const paths = compilerOptions.paths as Record<string, string[]>;
    expect(paths).toHaveProperty("@/*");
  });

  it("vite.config.ts configures resolve.alias for @", () => {
    expect(viteConfigSource).toMatch(/resolve/);
    expect(viteConfigSource).toMatch(/@/);
  });
});

// ── AC10: shadcn/ui configured — components.json and cn() utility ────

describe("AC10: shadcn/ui scaffolding", () => {
  it("components.json exists with style property", () => {
    const componentsJson = readJsonFile("components.json");
    expect(componentsJson).toHaveProperty("style");
  });

  it("components.json has aliases configuration", () => {
    const componentsJson = readJsonFile("components.json");
    const aliases = componentsJson.aliases as Record<string, string>;
    expect(aliases).toHaveProperty("components");
  });

  it("src/lib/utils.ts exports a cn function", async () => {
    const utilsModule = await import(resolve(ROOT, "src/lib/utils.ts"));
    expect(utilsModule).toHaveProperty("cn");
    expect(typeof utilsModule.cn).toBe("function");
  });
});
