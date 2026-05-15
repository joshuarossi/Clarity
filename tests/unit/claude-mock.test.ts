import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isClaudeMockEnabled,
  getMockClaudeResponse,
  MOCK_DELAY_MS,
} from "../../convex/lib/claudeMock";
import type { PromptRole } from "../../convex/lib/prompts";

/**
 * WOR-107: Claude mock module tests
 *
 * AC 4 — CLAUDE_MOCK=true makes AI actions use a deterministic stub
 *         responder with canned responses per role and configurable delay.
 * AC 5 — Stub responses are realistic enough to exercise UI (valid
 *         markdown for coaching roles, valid JSON for synthesis).
 *
 * At red state: convex/lib/claudeMock.ts does not exist yet, so the
 * import produces TS2307. That is the expected red-state error.
 */

// ── Environment variable save/restore ────────────────────────────────────

let savedClaudeMock: string | undefined;
let savedDelayMs: string | undefined;

beforeEach(() => {
  savedClaudeMock = process.env.CLAUDE_MOCK;
  savedDelayMs = process.env.CLAUDE_MOCK_DELAY_MS;
  delete process.env.CLAUDE_MOCK;
  delete process.env.CLAUDE_MOCK_DELAY_MS;
});

afterEach(() => {
  if (savedClaudeMock !== undefined) {
    process.env.CLAUDE_MOCK = savedClaudeMock;
  } else {
    delete process.env.CLAUDE_MOCK;
  }
  if (savedDelayMs !== undefined) {
    process.env.CLAUDE_MOCK_DELAY_MS = savedDelayMs;
  } else {
    delete process.env.CLAUDE_MOCK_DELAY_MS;
  }
});

// ── AC 4: CLAUDE_MOCK env var gating ─────────────────────────────────────

describe("WOR-107: isClaudeMockEnabled", () => {
  it("returns true when CLAUDE_MOCK is 'true'", () => {
    process.env.CLAUDE_MOCK = "true";
    expect(isClaudeMockEnabled()).toBe(true);
  });

  it("returns false when CLAUDE_MOCK is not set", () => {
    expect(isClaudeMockEnabled()).toBe(false);
  });

  it("returns false when CLAUDE_MOCK is a value other than 'true'", () => {
    process.env.CLAUDE_MOCK = "false";
    expect(isClaudeMockEnabled()).toBe(false);
  });

  it("returns false when CLAUDE_MOCK is empty string", () => {
    process.env.CLAUDE_MOCK = "";
    expect(isClaudeMockEnabled()).toBe(false);
  });
});

// ── AC 4: deterministic canned responses per role ────────────────────────

describe("WOR-107: getMockClaudeResponse", () => {
  const allRoles: PromptRole[] = [
    "PRIVATE_COACH",
    "COACH",
    "DRAFT_COACH",
    "SYNTHESIS",
  ];

  for (const role of allRoles) {
    it(`returns a non-empty string for ${role}`, () => {
      const response = getMockClaudeResponse(role);
      expect(typeof response).toBe("string");
      expect(response.length).toBeGreaterThan(0);
    });
  }

  it("is deterministic — same role always returns the same response", () => {
    const first = getMockClaudeResponse("PRIVATE_COACH");
    const second = getMockClaudeResponse("PRIVATE_COACH");
    expect(first).toBe(second);
  });

  it("returns different responses for different roles", () => {
    const privateCoach = getMockClaudeResponse("PRIVATE_COACH");
    const coach = getMockClaudeResponse("COACH");
    const draftCoach = getMockClaudeResponse("DRAFT_COACH");
    const synthesis = getMockClaudeResponse("SYNTHESIS");

    const responses = new Set([privateCoach, coach, draftCoach, synthesis]);
    expect(responses.size).toBe(4);
  });
});

// ── AC 5: response realism — markdown and JSON shapes ────────────────────

describe("WOR-107: stub response realism", () => {
  it("PRIVATE_COACH response is multi-line markdown with reflective questions", () => {
    const response = getMockClaudeResponse("PRIVATE_COACH");
    expect(response.split("\n").length).toBeGreaterThan(1);
    expect(response).toContain("?");
  });

  it("COACH response is multi-line markdown", () => {
    const response = getMockClaudeResponse("COACH");
    expect(response.split("\n").length).toBeGreaterThan(1);
  });

  it("DRAFT_COACH response is multi-line markdown", () => {
    const response = getMockClaudeResponse("DRAFT_COACH");
    expect(response.split("\n").length).toBeGreaterThan(1);
  });

  it("SYNTHESIS response is valid JSON with forInitiator and forInvitee keys", () => {
    const response = getMockClaudeResponse("SYNTHESIS");
    const parsed: { forInitiator: unknown; forInvitee: unknown } =
      JSON.parse(response);
    expect(parsed).toHaveProperty("forInitiator");
    expect(parsed).toHaveProperty("forInvitee");
    expect(typeof parsed.forInitiator).toBe("string");
    expect(typeof parsed.forInvitee).toBe("string");
  });

  it("SYNTHESIS response forInitiator and forInvitee are non-empty", () => {
    const response = getMockClaudeResponse("SYNTHESIS");
    const parsed: { forInitiator: string; forInvitee: string } =
      JSON.parse(response);
    expect(parsed.forInitiator.length).toBeGreaterThan(0);
    expect(parsed.forInvitee.length).toBeGreaterThan(0);
  });
});

// ── AC 4: configurable streaming delay ───────────────────────────────────

describe("WOR-107: MOCK_DELAY_MS", () => {
  it("defaults to 100 when CLAUDE_MOCK_DELAY_MS is not set", () => {
    expect(MOCK_DELAY_MS).toBe(100);
  });

  it("is a number", () => {
    expect(typeof MOCK_DELAY_MS).toBe("number");
  });
});
