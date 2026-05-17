import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";

/**
 * WOR-108 + WOR-165: CI pipeline — GitHub Actions
 *
 * WOR-108 established the CI workflow with lint, typecheck, unit, and e2e jobs.
 * WOR-165 comments out the e2e job so CI passes without it, unblocking
 * the auto-deploy trigger. These tests parse .github/workflows/ci.yml
 * and validate its structure.
 */

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
  if?: string;
}

interface WorkflowJob {
  "runs-on": string;
  needs?: string | string[];
  steps: WorkflowStep[];
  env?: Record<string, string>;
}

interface Workflow {
  name: string;
  on: {
    push?: { branches: string[] };
    pull_request?: { branches: string[] };
  };
  jobs: Record<string, WorkflowJob>;
}

let workflow: Workflow;
let rawYamlContent: string;

beforeAll(() => {
  const yamlPath = resolve(__dirname, "../../.github/workflows/ci.yml");
  rawYamlContent = readFileSync(yamlPath, "utf-8");
  workflow = load(rawYamlContent) as Workflow;
});

describe("WOR-108: CI workflow triggers", () => {
  it("triggers on push to main", () => {
    expect(workflow.on.push?.branches).toContain("main");
  });

  it("triggers on pull_request to main", () => {
    expect(workflow.on.pull_request?.branches).toContain("main");
  });

  it("contains exactly three active jobs: lint, typecheck, unit (AC1)", () => {
    const jobNames = Object.keys(workflow.jobs).sort();
    expect(jobNames).toEqual(["lint", "typecheck", "unit"]);
  });

  it("does not contain an active e2e job (AC1)", () => {
    expect(workflow.jobs["e2e"]).toBeUndefined();
  });
});

describe("WOR-108: Lint job", () => {
  it("has a lint job that runs ESLint", () => {
    const lint = workflow.jobs["lint"];
    expect(lint).toBeDefined();
    const stepRuns = lint.steps.filter((s) => s.run).map((s) => s.run);
    const hasEslint = stepRuns.some(
      (r) =>
        r !== undefined && (r.includes("npm run lint") || r.includes("eslint")),
    );
    expect(hasEslint).toBe(true);
  });

  it("has a lint job that runs Prettier check", () => {
    const lint = workflow.jobs["lint"];
    const stepRuns = lint.steps.filter((s) => s.run).map((s) => s.run);
    const hasPrettier = stepRuns.some(
      (r) => r !== undefined && r.includes("prettier") && r.includes("--check"),
    );
    expect(hasPrettier).toBe(true);
  });
});

describe("WOR-108: Typecheck job", () => {
  it("exists and depends on lint", () => {
    const typecheck = workflow.jobs["typecheck"];
    expect(typecheck).toBeDefined();
    const needs = Array.isArray(typecheck.needs)
      ? typecheck.needs
      : [typecheck.needs];
    expect(needs).toContain("lint");
  });

  it("runs tsc --noEmit", () => {
    const typecheck = workflow.jobs["typecheck"];
    const stepRuns = typecheck.steps.filter((s) => s.run).map((s) => s.run);
    const hasTsc = stepRuns.some(
      (r) =>
        r !== undefined &&
        (r.includes("tsc --noEmit") || r.includes("npm run typecheck")),
    );
    expect(hasTsc).toBe(true);
  });
});

describe("WOR-108: Unit job", () => {
  it("exists and depends on typecheck", () => {
    const unit = workflow.jobs["unit"];
    expect(unit).toBeDefined();
    const needs = Array.isArray(unit.needs) ? unit.needs : [unit.needs];
    expect(needs).toContain("typecheck");
  });

  it("runs vitest", () => {
    const unit = workflow.jobs["unit"];
    const stepRuns = unit.steps.filter((s) => s.run).map((s) => s.run);
    const hasVitest = stepRuns.some(
      (r) =>
        r !== undefined &&
        (r.includes("vitest run") ||
          r.includes("npm test") ||
          r.includes("npm run test")),
    );
    expect(hasVitest).toBe(true);
  });
});

describe("WOR-165: E2e job commented out", () => {
  it("e2e job definition is present as comments in ci.yml (AC2)", () => {
    expect(rawYamlContent).toMatch(/^\s*#\s*e2e:/m);
  });

  it("commented-out block contains playwright test reference (AC2)", () => {
    expect(rawYamlContent).toMatch(/^\s*#.*playwright test/m);
  });

  it("e2e job is not parsed as an active job (AC4)", () => {
    expect(workflow.jobs["e2e"]).toBeUndefined();
  });
});

describe("WOR-108: Node.js LTS and caching", () => {
  it("every job uses actions/setup-node with LTS", () => {
    const jobNames = Object.keys(workflow.jobs);
    for (const name of jobNames) {
      const job = workflow.jobs[name];
      const setupNodeStep = job.steps.find(
        (s) => s.uses !== undefined && s.uses.includes("actions/setup-node"),
      );
      expect(
        setupNodeStep,
        `Job "${name}" must use actions/setup-node`,
      ).toBeDefined();
      const nodeVersion = String(setupNodeStep?.with?.["node-version"] ?? "");
      expect(nodeVersion, `Job "${name}" must use Node.js LTS`).toMatch(/lts/i);
    }
  });

  it("every job has npm caching enabled", () => {
    const jobNames = Object.keys(workflow.jobs);
    for (const name of jobNames) {
      const job = workflow.jobs[name];
      const setupNodeStep = job.steps.find(
        (s) => s.uses !== undefined && s.uses.includes("actions/setup-node"),
      );
      expect(
        setupNodeStep?.with?.["cache"],
        `Job "${name}" must have npm caching`,
      ).toBe("npm");
    }
  });
});

describe("WOR-165: Sequential job gating (needs chain)", () => {
  it("enforces lint -> typecheck -> unit chain (AC3)", () => {
    const typecheck = workflow.jobs["typecheck"];
    const unit = workflow.jobs["unit"];

    expect(typecheck, "typecheck job must exist").toBeDefined();
    expect(unit, "unit job must exist").toBeDefined();

    if (!typecheck || !unit) return;

    const typecheckNeeds = Array.isArray(typecheck.needs)
      ? typecheck.needs
      : [typecheck.needs];
    const unitNeeds = Array.isArray(unit.needs) ? unit.needs : [unit.needs];

    expect(typecheckNeeds).toContain("lint");
    expect(unitNeeds).toContain("typecheck");
    expect(workflow.jobs["e2e"]).toBeUndefined();
  });

  it("lint job has no dependencies (runs first)", () => {
    const lint = workflow.jobs["lint"];
    expect(lint, "lint job must exist").toBeDefined();
    if (!lint) return;
    expect(lint.needs).toBeUndefined();
  });
});

describe("WOR-108: Workflow performance prerequisites", () => {
  it("all jobs run on ubuntu-latest", () => {
    const jobNames = Object.keys(workflow.jobs);
    for (const name of jobNames) {
      expect(
        workflow.jobs[name]["runs-on"],
        `Job "${name}" must run on ubuntu-latest`,
      ).toBe("ubuntu-latest");
    }
  });

  it("all jobs install dependencies with npm ci", () => {
    const jobNames = Object.keys(workflow.jobs);
    for (const name of jobNames) {
      const job = workflow.jobs[name];
      const stepRuns = job.steps.filter((s) => s.run).map((s) => s.run);
      const hasNpmCi = stepRuns.some(
        (r) => r !== undefined && r.includes("npm ci"),
      );
      expect(hasNpmCi, `Job "${name}" must run npm ci`).toBe(true);
    }
  });
});
