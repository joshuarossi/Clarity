import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import schema from "../../convex/schema";
import { assemblePrompt } from "../../convex/lib/prompts";
import type { PromptMessage } from "../../convex/lib/prompts";
import { getMockClaudeResponse } from "../../convex/lib/claudeMock";

/**
 * WOR-128: Draft coach AI action — generateResponse with readiness detection.
 *
 * Unit and integration tests for the generateResponse internal action,
 * its supporting internal mutations/queries, readiness detection,
 * privacy isolation, template integration, and streaming lifecycle.
 *
 * Uses convex-test with CLAUDE_MOCK=true to avoid external API calls.
 */

const api = anyApi;

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Seeds a two-party JOINT_ACTIVE environment with joint messages, both
 * syntheses, and private messages from both parties. Suitable for
 * Draft Coach AI action testing.
 */
async function seedDraftCoachEnv() {
  const t = convexTest(schema);

  const userAId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "partyA@test.com",
      displayName: "Party A",
      role: "USER",
      createdAt: Date.now(),
    }),
  );
  const userBId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "partyB@test.com",
      displayName: "Party B",
      role: "USER",
      createdAt: Date.now(),
    }),
  );

  const { caseId, versionId } = await t.run(async (ctx) => {
    const tplId = await ctx.db.insert("templates", {
      category: "workplace",
      name: "Workplace Template",
      createdAt: Date.now(),
      createdByUserId: userAId,
    });
    const vId = await ctx.db.insert("templateVersions", {
      templateId: tplId,
      version: 1,
      globalGuidance: "Global guidance for all roles",
      publishedAt: Date.now(),
      publishedByUserId: userAId,
    });
    await ctx.db.patch(tplId, { currentVersionId: vId });

    const cId = await ctx.db.insert("cases", {
      schemaVersion: 1,
      status: "JOINT_ACTIVE",
      isSolo: false,
      category: "workplace",
      templateVersionId: vId,
      initiatorUserId: userAId,
      inviteeUserId: userBId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Both partyStates with synthesis
    await ctx.db.insert("partyStates", {
      caseId: cId,
      userId: userAId,
      role: "INITIATOR",
      mainTopic: "Project direction disagreement",
      description: "We cannot agree on next steps",
      desiredOutcome: "Find common ground",
      formCompletedAt: Date.now(),
      privateCoachingCompletedAt: Date.now(),
      synthesisText:
        "User A synthesis: focus on clear communication about project decisions",
    });
    await ctx.db.insert("partyStates", {
      caseId: cId,
      userId: userBId,
      role: "INVITEE",
      mainTopic: "Communication issues",
      description: "Feeling unheard in meetings",
      desiredOutcome: "Better collaboration",
      formCompletedAt: Date.now(),
      privateCoachingCompletedAt: Date.now(),
      synthesisText:
        "User B synthesis: needs acknowledgment and inclusion in decision-making",
    });

    // Joint chat messages (visible to both parties)
    await ctx.db.insert("jointMessages", {
      caseId: cId,
      authorType: "USER",
      authorUserId: userAId,
      content: "I'd like to discuss how we handle project decisions.",
      status: "COMPLETE",
      createdAt: 1000,
    });
    await ctx.db.insert("jointMessages", {
      caseId: cId,
      authorType: "COACH",
      content: "That's a great starting point.",
      status: "COMPLETE",
      createdAt: 2000,
    });
    await ctx.db.insert("jointMessages", {
      caseId: cId,
      authorType: "USER",
      authorUserId: userBId,
      content: "I agree, I'd like to feel more included.",
      status: "COMPLETE",
      createdAt: 3000,
    });

    // Private messages (should NOT appear in Draft Coach context)
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userAId,
      role: "USER",
      content: "PRIVATE_A: I feel frustrated about being ignored",
      status: "COMPLETE",
      createdAt: 500,
    });
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userBId,
      role: "USER",
      content: "PRIVATE_B: I think they don't value my opinion",
      status: "COMPLETE",
      createdAt: 600,
    });

    return { caseId: cId, versionId: vId };
  });

  return { t, userAId, userBId, caseId, versionId };
}

// ── Environment management ──────────────────────────────────────────────

let savedClaudeMock: string | undefined;
let savedClaudeMockDelay: string | undefined;
let savedClaudeMockFailCount: string | undefined;
let savedClaudeMockFailStatus: string | undefined;

beforeEach(() => {
  savedClaudeMock = process.env.CLAUDE_MOCK;
  savedClaudeMockDelay = process.env.CLAUDE_MOCK_DELAY_MS;
  savedClaudeMockFailCount = process.env.CLAUDE_MOCK_FAIL_COUNT;
  savedClaudeMockFailStatus = process.env.CLAUDE_MOCK_FAIL_STATUS;
  process.env.CLAUDE_MOCK = "true";
  process.env.CLAUDE_MOCK_DELAY_MS = "10";
  delete process.env.CLAUDE_MOCK_FAIL_COUNT;
  delete process.env.CLAUDE_MOCK_FAIL_STATUS;
});

afterEach(() => {
  if (savedClaudeMock === undefined) {
    delete process.env.CLAUDE_MOCK;
  } else {
    process.env.CLAUDE_MOCK = savedClaudeMock;
  }
  if (savedClaudeMockDelay === undefined) {
    delete process.env.CLAUDE_MOCK_DELAY_MS;
  } else {
    process.env.CLAUDE_MOCK_DELAY_MS = savedClaudeMockDelay;
  }
  if (savedClaudeMockFailCount === undefined) {
    delete process.env.CLAUDE_MOCK_FAIL_COUNT;
  } else {
    process.env.CLAUDE_MOCK_FAIL_COUNT = savedClaudeMockFailCount;
  }
  if (savedClaudeMockFailStatus === undefined) {
    delete process.env.CLAUDE_MOCK_FAIL_STATUS;
  } else {
    process.env.CLAUDE_MOCK_FAIL_STATUS = savedClaudeMockFailStatus;
  }
});

// ── AC 1: DRAFT_COACH role via assemblePrompt ───────────────────────────

describe("generateResponse — prompt assembly (DRAFT_COACH role)", () => {
  it("assemblePrompt produces correct output when called with role DRAFT_COACH", () => {
    const draftHistory: PromptMessage[] = [
      { role: "user", content: "I want to tell them about the deadline" },
      { role: "assistant", content: "What tone do you want to set?" },
    ];

    const jointHistory: PromptMessage[] = [
      { role: "user", content: "Let's discuss the project timeline." },
      { role: "assistant", content: "That sounds like a good starting point." },
    ];

    const result = assemblePrompt({
      role: "DRAFT_COACH",
      caseId: "test-case-id",
      actingUserId: "test-user-id",
      recentHistory: draftHistory,
      context: {
        actingPartySynthesis: "Focus on clear communication",
        jointChatHistory: jointHistory,
      },
    });

    // System prompt must contain Draft Coach identity
    expect(result.system).toContain("Draft Coach");

    // Synthesis context should be included
    const allContent = result.messages.map((m) => m.content).join("\n");
    expect(allContent).toContain("Focus on clear communication");

    // Joint chat history should be included
    expect(allContent).toContain("Let's discuss the project timeline.");

    // Draft conversation history should be at the end
    const lastMessages = result.messages.slice(-2);
    expect(lastMessages).toEqual(draftHistory);
  });

  it("action creates a COMPLETE AI draftMessage when run in mock mode (integration)", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    const sessionId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "I want to tell them about the deadline",
        status: "COMPLETE",
        createdAt: 1000,
      });
      return sId;
    });

    await t.action(api.draftCoach.generateResponse, {
      sessionId,
      userId: userAId,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("draftMessages")
        .withIndex("by_draft_session", (q) => q.eq("draftSessionId", sessionId))
        .collect(),
    );

    const aiMessages = messages.filter((m) => m.role === "AI");
    expect(aiMessages).toHaveLength(1);
    expect(aiMessages[0].status).toBe("COMPLETE");
    expect(aiMessages[0].content.length).toBeGreaterThan(0);
  });
});

// ── AC 2: Context privacy — only drafting user's data ────────────────────

describe("generateResponse — privacy isolation", () => {
  it("assemblePrompt with DRAFT_COACH includes acting party synthesis but excludes other party synthesis", () => {
    const result = assemblePrompt({
      role: "DRAFT_COACH",
      caseId: "test-case-id",
      actingUserId: "test-user-id",
      recentHistory: [{ role: "user", content: "Help me draft a message" }],
      context: {
        actingPartySynthesis: "Acting user's synthesis text",
        otherPartySynthesis:
          "SECRET other party synthesis that must not appear",
        jointChatHistory: [
          { role: "user", content: "Joint chat message visible to both" },
        ],
      },
    });

    const allContent = result.messages.map((m) => m.content).join("\n");
    expect(allContent).toContain("Acting user's synthesis text");
    expect(allContent).not.toContain("SECRET other party synthesis");
  });

  it("assemblePrompt with DRAFT_COACH excludes private messages from context", () => {
    const result = assemblePrompt({
      role: "DRAFT_COACH",
      caseId: "test-case-id",
      actingUserId: "test-user-id",
      recentHistory: [{ role: "user", content: "Draft help" }],
      context: {
        actingPartyPrivateMessages: [
          { role: "user", content: "ACTING_PRIVATE: my secret thoughts" },
        ],
        otherPartyPrivateMessages: [
          { role: "user", content: "OTHER_PRIVATE: their secret thoughts" },
        ],
      },
    });

    const allContent = result.messages.map((m) => m.content).join("\n");
    expect(allContent).not.toContain("ACTING_PRIVATE");
    expect(allContent).not.toContain("OTHER_PRIVATE");
  });

  it("action for User A does not create draft data under User B (integration)", async () => {
    const { t, userAId, userBId, caseId } = await seedDraftCoachEnv();

    const sessionId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "Help me draft something",
        status: "COMPLETE",
        createdAt: 1000,
      });
      return sId;
    });

    await t.action(api.draftCoach.generateResponse, {
      sessionId,
      userId: userAId,
    });

    // No draft sessions should exist for User B
    const userBSessions = await t.run(async (ctx) =>
      ctx.db
        .query("draftSessions")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userBId),
        )
        .collect(),
    );
    expect(userBSessions).toHaveLength(0);
  });
});

// ── AC 3: Category-specific template instructions ────────────────────────

describe("generateResponse — template instructions", () => {
  it("assemblePrompt with DRAFT_COACH applies draftCoachInstructions when available", () => {
    const result = assemblePrompt({
      role: "DRAFT_COACH",
      caseId: "test-case-id",
      actingUserId: "test-user-id",
      recentHistory: [{ role: "user", content: "Help" }],
      templateVersion: {
        globalGuidance: "Global fallback guidance",
        draftCoachInstructions: "Category-specific draft coaching instructions",
      },
      context: {},
    });

    expect(result.system).toContain(
      "Category-specific draft coaching instructions",
    );
    expect(result.system).not.toContain("Global fallback guidance");
  });

  it("assemblePrompt with DRAFT_COACH falls back to globalGuidance when draftCoachInstructions is absent", () => {
    const result = assemblePrompt({
      role: "DRAFT_COACH",
      caseId: "test-case-id",
      actingUserId: "test-user-id",
      recentHistory: [{ role: "user", content: "Help" }],
      templateVersion: {
        globalGuidance: "Global fallback guidance",
      },
      context: {},
    });

    expect(result.system).toContain("Global fallback guidance");
  });

  it("action reads template from case and applies instructions (integration)", async () => {
    const { t, userAId, caseId, versionId } = await seedDraftCoachEnv();

    // Add draftCoachInstructions to the template version
    await t.run(async (ctx) => {
      await ctx.db.patch(versionId, {
        draftCoachInstructions: "Workplace-specific draft coaching guidance",
      });
    });

    const sessionId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "I want to talk about the schedule",
        status: "COMPLETE",
        createdAt: 1000,
      });
      return sId;
    });

    await t.action(api.draftCoach.generateResponse, {
      sessionId,
      userId: userAId,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("draftMessages")
        .withIndex("by_draft_session", (q) => q.eq("draftSessionId", sessionId))
        .collect(),
    );

    const aiMessages = messages.filter((m) => m.role === "AI");
    expect(aiMessages).toHaveLength(1);
    expect(aiMessages[0].status).toBe("COMPLETE");
  });
});

// ── AC 4: Readiness detection ────────────────────────────────────────────

describe("generateResponse — readiness detection", () => {
  const readinessSignals = [
    "i'm ready",
    "draft it",
    "write the message",
    "looks good, write it",
  ];

  for (const signal of readinessSignals) {
    it(`detects readiness signal "${signal}" and sets finalDraft on session`, async () => {
      const { t, userAId, caseId } = await seedDraftCoachEnv();

      const sessionId = await t.run(async (ctx) => {
        const sId = await ctx.db.insert("draftSessions", {
          caseId,
          userId: userAId,
          status: "ACTIVE",
          createdAt: Date.now(),
        });
        // Prior coaching exchange
        await ctx.db.insert("draftMessages", {
          draftSessionId: sId,
          role: "USER",
          content: "I want to tell them about the schedule",
          status: "COMPLETE",
          createdAt: 1000,
        });
        await ctx.db.insert("draftMessages", {
          draftSessionId: sId,
          role: "AI",
          content: "What tone do you want to set?",
          status: "COMPLETE",
          createdAt: 2000,
        });
        // Readiness signal as the latest USER message
        await ctx.db.insert("draftMessages", {
          draftSessionId: sId,
          role: "USER",
          content: signal,
          status: "COMPLETE",
          createdAt: 3000,
        });
        return sId;
      });

      await t.action(api.draftCoach.generateResponse, {
        sessionId,
        userId: userAId,
      });

      const session = await t.run(async (ctx) => ctx.db.get(sessionId));
      expect(session).toBeDefined();
      // On readiness: finalDraft should be set (parsed from AI response)
      expect(session!.finalDraft).toBeDefined();
      expect(typeof session!.finalDraft).toBe("string");
      expect(session!.finalDraft!.length).toBeGreaterThan(0);
    });
  }

  it('detects canonical button message "Generate Draft" (exact match)', async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    const sessionId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "Generate Draft",
        status: "COMPLETE",
        createdAt: 1000,
      });
      return sId;
    });

    await t.action(api.draftCoach.generateResponse, {
      sessionId,
      userId: userAId,
    });

    const session = await t.run(async (ctx) => ctx.db.get(sessionId));
    expect(session).toBeDefined();
    expect(session!.finalDraft).toBeDefined();
    expect(typeof session!.finalDraft).toBe("string");
    expect(session!.finalDraft!.length).toBeGreaterThan(0);
  });

  it("detects readiness signals case-insensitively", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    const sessionId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "I'M READY",
        status: "COMPLETE",
        createdAt: 1000,
      });
      return sId;
    });

    await t.action(api.draftCoach.generateResponse, {
      sessionId,
      userId: userAId,
    });

    const session = await t.run(async (ctx) => ctx.db.get(sessionId));
    expect(session).toBeDefined();
    expect(session!.finalDraft).toBeDefined();
  });
});

// ── AC 5: On readiness — finalDraft written + AI message still stored ────

describe("generateResponse — readiness produces finalDraft AND stores AI message", () => {
  it("on readiness: AI message is COMPLETE and session.finalDraft is set", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    const sessionId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "draft it",
        status: "COMPLETE",
        createdAt: 1000,
      });
      return sId;
    });

    await t.action(api.draftCoach.generateResponse, {
      sessionId,
      userId: userAId,
    });

    // AI message should exist and be COMPLETE
    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("draftMessages")
        .withIndex("by_draft_session", (q) => q.eq("draftSessionId", sessionId))
        .collect(),
    );

    const aiMessages = messages.filter((m) => m.role === "AI");
    expect(aiMessages).toHaveLength(1);
    expect(aiMessages[0].status).toBe("COMPLETE");
    expect(aiMessages[0].content.length).toBeGreaterThan(0);

    // finalDraft should also be set on the session
    const session = await t.run(async (ctx) => ctx.db.get(sessionId));
    expect(session!.finalDraft).toBeDefined();
  });
});

// ── AC 6: Non-readiness — exploratory coaching ──────────────────────────

describe("generateResponse — non-readiness turns", () => {
  it("stores AI response as normal draftMessage without setting finalDraft", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    const sessionId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "I want to tell them about the deadline",
        status: "COMPLETE",
        createdAt: 1000,
      });
      return sId;
    });

    await t.action(api.draftCoach.generateResponse, {
      sessionId,
      userId: userAId,
    });

    // AI message created with COMPLETE status
    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("draftMessages")
        .withIndex("by_draft_session", (q) => q.eq("draftSessionId", sessionId))
        .collect(),
    );

    const aiMessages = messages.filter((m) => m.role === "AI");
    expect(aiMessages).toHaveLength(1);
    expect(aiMessages[0].status).toBe("COMPLETE");

    // finalDraft must NOT be set — this was not a readiness signal
    const session = await t.run(async (ctx) => ctx.db.get(sessionId));
    expect(session!.finalDraft).toBeUndefined();
  });

  it("session status remains ACTIVE after non-readiness turn", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    const sessionId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "How should I phrase my concern about the budget?",
        status: "COMPLETE",
        createdAt: 1000,
      });
      return sId;
    });

    await t.action(api.draftCoach.generateResponse, {
      sessionId,
      userId: userAId,
    });

    const session = await t.run(async (ctx) => ctx.db.get(sessionId));
    expect(session!.status).toBe("ACTIVE");
  });
});

// ── AC 7: Streaming behaviour ───────────────────────────────────────────

describe("generateResponse — streaming lifecycle", () => {
  it("inserts a STREAMING row before API call — visible as ERROR when both attempts fail", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    process.env.CLAUDE_MOCK_FAIL_COUNT = "2";

    const sessionId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "Help me draft something",
        status: "COMPLETE",
        createdAt: 1000,
      });
      return sId;
    });

    await t.action(api.draftCoach.generateResponse, {
      sessionId,
      userId: userAId,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("draftMessages")
        .withIndex("by_draft_session", (q) => q.eq("draftSessionId", sessionId))
        .collect(),
    );

    const aiMessage = messages.find((m) => m.role === "AI");
    // Row must exist — proves it was inserted before the API call
    expect(aiMessage).toBeDefined();
    // Empty content — STREAMING row was inserted with content=""
    expect(aiMessage!.content).toBe("");
    // After two failures, marked ERROR
    expect(aiMessage!.status).toBe("ERROR");
  });

  it("streams content and finalizes with status COMPLETE matching mock response", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    const sessionId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "I want to tell them about the deadline",
        status: "COMPLETE",
        createdAt: 1000,
      });
      return sId;
    });

    await t.action(api.draftCoach.generateResponse, {
      sessionId,
      userId: userAId,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("draftMessages")
        .withIndex("by_draft_session", (q) => q.eq("draftSessionId", sessionId))
        .collect(),
    );

    const aiMessage = messages.find((m) => m.role === "AI");
    expect(aiMessage).toBeDefined();
    expect(aiMessage!.status).toBe("COMPLETE");
    expect(aiMessage!.content).toBe(getMockClaudeResponse("DRAFT_COACH"));
  });

  it("batched streaming updates take measurable time — proving multiple update calls", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    process.env.CLAUDE_MOCK_DELAY_MS = "100";

    const sessionId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "Help me draft a message",
        status: "COMPLETE",
        createdAt: 1000,
      });
      return sId;
    });

    const start = Date.now();
    await t.action(api.draftCoach.generateResponse, {
      sessionId,
      userId: userAId,
    });
    const elapsed = Date.now() - start;

    // At least 2 chunk cycles (2 × 100ms) must have occurred
    expect(elapsed).toBeGreaterThanOrEqual(150);

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("draftMessages")
        .withIndex("by_draft_session", (q) => q.eq("draftSessionId", sessionId))
        .collect(),
    );

    const aiMessage = messages.find((m) => m.role === "AI");
    expect(aiMessage).toBeDefined();
    expect(aiMessage!.content).toBe(getMockClaudeResponse("DRAFT_COACH"));
    expect(aiMessage!.status).toBe("COMPLETE");
  });
});

// ── AC 8: No auto-send ──────────────────────────────────────────────────

describe("generateResponse — draft generation does NOT send to joint chat", () => {
  it("no new jointMessages created when readiness signal triggers finalDraft", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    const sessionId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "draft it",
        status: "COMPLETE",
        createdAt: 10000,
      });
      return sId;
    });

    // Count joint messages before
    const beforeCount = await t.run(async (ctx) => {
      const msgs = await ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect();
      return msgs.length;
    });

    await t.action(api.draftCoach.generateResponse, {
      sessionId,
      userId: userAId,
    });

    // Count joint messages after — must be the same
    const afterCount = await t.run(async (ctx) => {
      const msgs = await ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect();
      return msgs.length;
    });

    expect(afterCount).toBe(beforeCount);
  });

  it("session status remains ACTIVE after generating a draft", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    const sessionId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "i'm ready",
        status: "COMPLETE",
        createdAt: 1000,
      });
      return sId;
    });

    await t.action(api.draftCoach.generateResponse, {
      sessionId,
      userId: userAId,
    });

    const session = await t.run(async (ctx) => ctx.db.get(sessionId));
    expect(session!.status).toBe("ACTIVE");
  });
});

// ── AC 9: Error handling — retry then ERROR ──────────────────────────────

describe("generateResponse — error handling", () => {
  it("retries once on API failure and succeeds on second attempt", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    process.env.CLAUDE_MOCK_FAIL_COUNT = "1";

    const sessionId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "Help me draft something",
        status: "COMPLETE",
        createdAt: 1000,
      });
      return sId;
    });

    await t.action(api.draftCoach.generateResponse, {
      sessionId,
      userId: userAId,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("draftMessages")
        .withIndex("by_draft_session", (q) => q.eq("draftSessionId", sessionId))
        .collect(),
    );

    const aiMessage = messages.find((m) => m.role === "AI");
    expect(aiMessage).toBeDefined();
    // Retry succeeded — message must be COMPLETE, not ERROR
    expect(aiMessage!.status).toBe("COMPLETE");
    expect(aiMessage!.content.length).toBeGreaterThan(0);
  });

  it("marks message as ERROR after two consecutive failures", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    process.env.CLAUDE_MOCK_FAIL_COUNT = "2";

    const sessionId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "Help me draft something",
        status: "COMPLETE",
        createdAt: 1000,
      });
      return sId;
    });

    await t.action(api.draftCoach.generateResponse, {
      sessionId,
      userId: userAId,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("draftMessages")
        .withIndex("by_draft_session", (q) => q.eq("draftSessionId", sessionId))
        .collect(),
    );

    const errorMessage = messages.find(
      (m) => m.role === "AI" && m.status === "ERROR",
    );
    expect(errorMessage).toBeDefined();
    // Content should still be empty — no streaming ever succeeded
    expect(errorMessage!.content).toBe("");
  });
});

// ── Internal mutations ──────────────────────────────────────────────────

describe("insertStreamingDraftMessage", () => {
  it("inserts a draftMessages row with role=AI, content='', status=STREAMING", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      }),
    );

    await t.mutation(api.draftCoach.insertStreamingDraftMessage, {
      draftSessionId: sessionId,
    });

    // Query the table directly to verify the inserted row
    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("draftMessages")
        .withIndex("by_draft_session", (q) => q.eq("draftSessionId", sessionId))
        .collect(),
    );

    expect(messages).toHaveLength(1);
    const msg = messages[0];
    expect(msg.role).toBe("AI");
    expect(msg.content).toBe("");
    expect(msg.status).toBe("STREAMING");
    expect(msg.draftSessionId).toEqual(sessionId);
  });
});

describe("updateStreamingDraftMessage", () => {
  it("patches content on a STREAMING draftMessages row", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      }),
    );

    const messageId = await t.run(async (ctx) =>
      ctx.db.insert("draftMessages", {
        draftSessionId: sessionId,
        role: "AI",
        content: "",
        status: "STREAMING",
        createdAt: Date.now(),
      }),
    );

    await t.mutation(api.draftCoach.updateStreamingDraftMessage, {
      messageId,
      content: "Partial streaming content...",
    });

    const updated = await t.run(async (ctx) => ctx.db.get(messageId));
    expect(updated!.content).toBe("Partial streaming content...");
    expect(updated!.status).toBe("STREAMING");
  });
});

describe("finalizeStreamingDraftMessage", () => {
  it("sets status=COMPLETE and final content (token count logged, not persisted)", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      }),
    );

    const messageId = await t.run(async (ctx) =>
      ctx.db.insert("draftMessages", {
        draftSessionId: sessionId,
        role: "AI",
        content: "",
        status: "STREAMING",
        createdAt: Date.now(),
      }),
    );

    await t.mutation(api.draftCoach.finalizeStreamingDraftMessage, {
      messageId,
      content: "Final complete draft coaching response",
      tokens: 200,
    });

    const finalized = await t.run(async (ctx) => ctx.db.get(messageId));
    expect(finalized!.content).toBe("Final complete draft coaching response");
    expect(finalized!.status).toBe("COMPLETE");
    // Note: draftMessages schema does not have a tokens field —
    // token count is logged but not persisted on the row
  });
});

describe("markDraftMessageError", () => {
  it("sets status=ERROR on a draftMessages row", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      }),
    );

    const messageId = await t.run(async (ctx) =>
      ctx.db.insert("draftMessages", {
        draftSessionId: sessionId,
        role: "AI",
        content: "",
        status: "STREAMING",
        createdAt: Date.now(),
      }),
    );

    await t.mutation(api.draftCoach.markDraftMessageError, {
      messageId,
    });

    const errorRow = await t.run(async (ctx) => ctx.db.get(messageId));
    expect(errorRow!.status).toBe("ERROR");
  });
});

describe("setSessionFinalDraft", () => {
  it("writes finalDraft to draftSession", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      }),
    );

    await t.mutation(api.draftCoach.setSessionFinalDraft, {
      sessionId,
      finalDraft: "Polished draft text ready for sending",
    });

    const session = await t.run(async (ctx) => ctx.db.get(sessionId));
    expect(session!.finalDraft).toBe("Polished draft text ready for sending");
  });
});

// ── retryLastDraftAIResponse ────────────────────────────────────────────

describe("retryLastDraftAIResponse", () => {
  it("deletes the ERROR draftMessage and re-schedules generateResponse", async () => {
    const { t, userAId, caseId } = await seedDraftCoachEnv();

    const sessionId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "Help me draft something",
        status: "COMPLETE",
        createdAt: 1000,
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "AI",
        content: "",
        status: "ERROR",
        createdAt: 2000,
      });
      return sId;
    });

    await t.withIdentity({ subject: userAId }).run(async (ctx) =>
      ctx.runMutation(api.draftCoach.retryLastDraftAIResponse, {
        sessionId,
      }),
    );

    // ERROR message should be deleted
    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("draftMessages")
        .withIndex("by_draft_session", (q) => q.eq("draftSessionId", sessionId))
        .collect(),
    );

    const errorMessages = messages.filter((m) => m.status === "ERROR");
    expect(errorMessages).toHaveLength(0);

    // generateResponse should be re-scheduled
    const scheduledFns = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );

    const generateResponseJob = scheduledFns.find(
      (job) =>
        typeof job.name === "string" &&
        job.name.includes("draftCoach") &&
        job.name.includes("generateResponse"),
    );
    expect(
      generateResponseJob,
      "Expected draftCoach.generateResponse to be re-scheduled after retry",
    ).toBeDefined();
  });
});
