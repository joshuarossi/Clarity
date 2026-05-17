import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";

/**
 * WOR-108: CI pipeline — GitHub Actions (lint, typecheck, unit, e2e)
 *
 * These tests parse .github/workflows/ci.yml and validate the structural
 * contract for all seven acceptance criteria. The YAML file is the
 * implementation artifact; these tests validate its structure.
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

beforeAll(() => {
  const yamlPath = resolve(__dirname, "../../.github/workflows/ci.yml");
  const yamlContent = readFileSync(yamlPath, "utf-8");
  workflow = load(yamlContent) as Workflow;
});

describe("WOR-108: CI workflow triggers", () => {
  it("triggers on push to main", () => {
    expect(workflow.on.push?.branches).toContain("main");
  });

  it("triggers on pull_request to main", () => {
    expect(workflow.on.pull_request?.branches).toContain("main");
  });

  it("contains four jobs: lint, typecheck, unit, e2e", () => {
    const jobNames = Object.keys(workflow.jobs).sort();
    expect(jobNames).toEqual(["e2e", "lint", "typecheck", "unit"]);
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

describe("WOR-108: E2E job", () => {
  it("exists and depends on unit", () => {
    const e2e = workflow.jobs["e2e"];
    expect(e2e).toBeDefined();
    const needs = Array.isArray(e2e.needs) ? e2e.needs : [e2e.needs];
    expect(needs).toContain("unit");
  });

  it("sets CLAUDE_MOCK=true environment variable", () => {
    const e2e = workflow.jobs["e2e"];
    // Check job-level env or step-level env
    const jobEnvMock = e2e.env?.["CLAUDE_MOCK"] === "true";
    const stepEnvMock = e2e.steps.some(
      (s) => s.env?.["CLAUDE_MOCK"] === "true",
    );
    expect(jobEnvMock || stepEnvMock).toBe(true);
  });

  it("installs Playwright browsers", () => {
    const e2e = workflow.jobs["e2e"];
    const stepRuns = e2e.steps.filter((s) => s.run).map((s) => s.run);
    const hasPlaywrightInstall = stepRuns.some(
      (r) => r !== undefined && r.includes("playwright install"),
    );
    expect(hasPlaywrightInstall).toBe(true);
  });

  it("runs Playwright tests", () => {
    const e2e = workflow.jobs["e2e"];
    const stepRuns = e2e.steps.filter((s) => s.run).map((s) => s.run);
    const hasPlaywrightTest = stepRuns.some(
      (r) => r !== undefined && r.includes("playwright test"),
    );
    expect(hasPlaywrightTest).toBe(true);
  });

  it("provisions a Convex dev deployment", () => {
    const e2e = workflow.jobs["e2e"];
    const stepRuns = e2e.steps.filter((s) => s.run).map((s) => s.run);
    const hasConvexDeploy = stepRuns.some(
      (r) =>
        r !== undefined &&
        (r.includes("convex deploy") || r.includes("convex dev")),
    );
    expect(hasConvexDeploy).toBe(true);
  });

  it("seeds test data via --preview-run on the deploy step (AC1)", () => {
    const e2e = workflow.jobs["e2e"];
    const deployStep = e2e.steps.find(
      (s) => s.run !== undefined && s.run.includes("convex deploy"),
    );
    expect(deployStep, "e2e job must have a convex deploy step").toBeDefined();
    expect(deployStep!.run).toContain("--preview-run seed:seed");
  });

  it("does not use standalone convex run in any e2e step (AC2)", () => {
    const e2e = workflow.jobs["e2e"];
    const stepRuns = e2e.steps.filter((s) => s.run).map((s) => s.run!);
    // A standalone "convex run" is any step that invokes "convex run" outside
    // of "convex deploy". The deploy step may contain "convex deploy ... --preview-run"
    // which includes the substring "run" but is NOT standalone.
    const hasStandaloneRun = stepRuns.some(
      (r) => /\bconvex run\b/.test(r) && !r.includes("convex deploy"),
    );
    expect(hasStandaloneRun).toBe(false);
  });

  it("deploy step includes --preview-run so seed data is available before Playwright (AC3)", () => {
    const e2e = workflow.jobs["e2e"];
    const deployStep = e2e.steps.find(
      (s) => s.run !== undefined && s.run.includes("convex deploy"),
    );
    expect(deployStep, "e2e job must have a convex deploy step").toBeDefined();
    expect(deployStep!.run).toContain("convex deploy");
    expect(deployStep!.run).toContain("--preview-run seed:seed");
  });

  it("consolidates deploy and seed into a single convex deploy invocation (AC4)", () => {
    const e2e = workflow.jobs["e2e"];
    const deploySteps = e2e.steps.filter(
      (s) => s.run !== undefined && s.run.includes("convex deploy"),
    );
    expect(deploySteps.length).toBe(1);
    const deployRun = deploySteps[0].run!;
    expect(deployRun).toContain("--preview-run seed:seed");
    expect(deployRun).toContain("--cmd");
  });

  it("uses CONVEX_DEPLOY_KEY from secrets (no hardcoded secrets)", () => {
    const e2e = workflow.jobs["e2e"];
    const yamlPath = resolve(__dirname, "../../.github/workflows/ci.yml");
    const yamlContent = readFileSync(yamlPath, "utf-8");
    // Verify secrets reference exists in the raw YAML
    expect(yamlContent).toContain("secrets.CONVEX_DEPLOY_KEY");
    // Verify no hardcoded key values in step runs
    const stepRuns = e2e.steps
      .filter((s) => s.run)
      .map((s) => s.run)
      .join("\n");
    // A hardcoded deploy key would be a long alphanumeric string assigned directly
    expect(stepRuns).not.toMatch(/CONVEX_DEPLOY_KEY=["'][a-zA-Z0-9]{20,}["']/);
  });

  it("uploads artifacts on failure", () => {
    const e2e = workflow.jobs["e2e"];
    const uploadStep = e2e.steps.find(
      (s) => s.uses !== undefined && s.uses.includes("upload-artifact"),
    );
    expect(uploadStep).toBeDefined();
    expect(uploadStep?.if).toMatch(/failure\(\)/);
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

describe("WOR-108: Sequential job gating (needs chain)", () => {
  it("enforces lint -> typecheck -> unit -> e2e chain", () => {
    const typecheck = workflow.jobs["typecheck"];
    const unit = workflow.jobs["unit"];
    const e2e = workflow.jobs["e2e"];

    expect(typecheck, "typecheck job must exist").toBeDefined();
    expect(unit, "unit job must exist").toBeDefined();
    expect(e2e, "e2e job must exist").toBeDefined();

    // Guard: only check needs if jobs exist (above assertions fail first if not)
    if (!typecheck || !unit || !e2e) return;

    const typecheckNeeds = Array.isArray(typecheck.needs)
      ? typecheck.needs
      : [typecheck.needs];
    const unitNeeds = Array.isArray(unit.needs) ? unit.needs : [unit.needs];
    const e2eNeeds = Array.isArray(e2e.needs) ? e2e.needs : [e2e.needs];

    expect(typecheckNeeds).toContain("lint");
    expect(unitNeeds).toContain("typecheck");
    expect(e2eNeeds).toContain("unit");
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
