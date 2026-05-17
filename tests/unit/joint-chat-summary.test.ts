import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import schema from "../../convex/schema";
import { getMockClaudeResponse } from "../../convex/lib/claudeMock";

/**
 * WOR-146: Coach periodic / agreement summaries (US-10b)
 *
 * Tests for:
 * - AC1: PROGRESS classification triggers a summary-style Coach response
 * - AC2: Summary is visibly distinct from a normal Coach intervention
 * - AC3: Throttle mechanism prevents excessive summaries
 * - AC4: Timer path bypasses NORMAL_EXCHANGE suppression gate for summaries
 * - AC5: No redundant summary when no new agreement has emerged
 *
 * Uses convex-test with CLAUDE_MOCK=true.
 */

const api = anyApi;

// ── Helpers ─────────────────────────────────────────────────────────────

async function seedJointChatForSummary(opts?: {
  userMessageCount?: number;
  includeCoachMessage?: boolean;
  coachMessageTimestamp?: number;
}) {
  const t = convexTest(schema);

  const userAId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "usera@test.com",
      displayName: "User A",
      role: "USER",
      createdAt: Date.now(),
    }),
  );

  const userBId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "userb@test.com",
      displayName: "User B",
      role: "USER",
      createdAt: Date.now(),
    }),
  );

  const { versionId, caseId } = await t.run(async (ctx) => {
    const tplId = await ctx.db.insert("templates", {
      category: "workplace",
      name: "Workplace Template",
      createdAt: Date.now(),
      createdByUserId: userAId,
    });
    const vId = await ctx.db.insert("templateVersions", {
      templateId: tplId,
      version: 1,
      globalGuidance: "Guide parties toward constructive dialogue",
      coachInstructions:
        "Use de-escalation techniques when parties are frustrated",
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

    await ctx.db.insert("partyStates", {
      caseId: cId,
      userId: userAId,
      role: "INITIATOR",
      mainTopic: "Disagreement about project direction",
      description: "We cannot agree on the next steps",
      desiredOutcome: "Find common ground",
      formCompletedAt: Date.now(),
      synthesisText:
        "User A feels unheard in decision-making and wants a check-in process.",
      synthesisGeneratedAt: Date.now(),
    });

    await ctx.db.insert("partyStates", {
      caseId: cId,
      userId: userBId,
      role: "INVITEE",
      mainTopic: "Communication issues",
      description: "Feeling unheard in meetings",
      desiredOutcome: "Better collaboration",
      formCompletedAt: Date.now(),
      synthesisText:
        "User B values efficiency and wants acknowledgment of their perspective.",
      synthesisGeneratedAt: Date.now(),
    });

    // Seed joint messages
    const messageCount = opts?.userMessageCount ?? 8;
    for (let i = 0; i < messageCount; i++) {
      const authorUserId = i % 2 === 0 ? userAId : userBId;
      await ctx.db.insert("jointMessages", {
        caseId: cId,
        authorType: "USER",
        authorUserId,
        content: `Joint message ${i + 1} from ${i % 2 === 0 ? "User A" : "User B"}`,
        status: "COMPLETE",
        createdAt: 1000 + i * 1000,
      });
    }

    // Optionally seed a Coach message
    if (opts?.includeCoachMessage) {
      await ctx.db.insert("jointMessages", {
        caseId: cId,
        authorType: "COACH",
        content: "Earlier Coach response",
        status: "COMPLETE",
        createdAt: opts.coachMessageTimestamp ?? 500,
      });
    }

    // Seed private messages (for privacy filter context)
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userAId,
      role: "USER",
      content: "I feel frustrated that my ideas are being ignored in meetings",
      status: "COMPLETE",
      createdAt: 100,
    });
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userBId,
      role: "USER",
      content: "My partner never listens to my suggestions about deadlines",
      status: "COMPLETE",
      createdAt: 200,
    });

    return { versionId: vId, caseId: cId };
  });

  // Insert the triggering user message
  const triggeringMessageId = await t.run(async (ctx) =>
    ctx.db.insert("jointMessages", {
      caseId,
      authorType: "USER",
      authorUserId: userAId,
      content: "I think we are actually starting to agree on the timeline",
      status: "COMPLETE",
      createdAt: Date.now(),
    }),
  );

  return { t, userAId, userBId, versionId, caseId, triggeringMessageId };
}

// ── Environment management ──────────────────────────────────────────────

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {
    CLAUDE_MOCK: process.env.CLAUDE_MOCK,
    CLAUDE_MOCK_DELAY_MS: process.env.CLAUDE_MOCK_DELAY_MS,
    CLAUDE_MOCK_FAIL_COUNT: process.env.CLAUDE_MOCK_FAIL_COUNT,
    CLAUDE_MOCK_FAIL_STATUS: process.env.CLAUDE_MOCK_FAIL_STATUS,
    CLAUDE_MOCK_CLASSIFICATION: process.env.CLAUDE_MOCK_CLASSIFICATION,
  };
  process.env.CLAUDE_MOCK = "true";
  process.env.CLAUDE_MOCK_DELAY_MS = "10";
  delete process.env.CLAUDE_MOCK_FAIL_COUNT;
  delete process.env.CLAUDE_MOCK_FAIL_STATUS;
  delete process.env.CLAUDE_MOCK_CLASSIFICATION;
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

// ── AC1: PROGRESS classification triggers summary response ───────────────

describe("joint-chat-summary — AC1: PROGRESS triggers summary", () => {
  it("generates a summary-style Coach response when classification is PROGRESS", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "PROGRESS";

    const { t, caseId, triggeringMessageId } = await seedJointChatForSummary();

    await t.action(api.jointChat.generateCoachResponse, {
      caseId,
      messageId: triggeringMessageId,
      triggerType: "message",
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    const coachMessages = messages.filter((m) => m.authorType === "COACH");
    expect(coachMessages.length).toBeGreaterThanOrEqual(1);

    const latestCoach = coachMessages[coachMessages.length - 1];
    expect(latestCoach.status).toBe("COMPLETE");
    // The summary path uses summaryMode: true, so the mock returns COACH_SUMMARY
    expect(latestCoach.content).toBe(getMockClaudeResponse("COACH", true));
  });
});

// ── AC2: Summary is distinct from normal Coach intervention ──────────────

describe("joint-chat-summary — AC2: Summary distinct from intervention", () => {
  it("summary response content differs from the generic COACH mock response", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "PROGRESS";

    const { t, caseId, triggeringMessageId } = await seedJointChatForSummary();

    await t.action(api.jointChat.generateCoachResponse, {
      caseId,
      messageId: triggeringMessageId,
      triggerType: "message",
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    const coachMessages = messages.filter((m) => m.authorType === "COACH");
    expect(coachMessages.length).toBeGreaterThanOrEqual(1);

    const summaryMessage = coachMessages[coachMessages.length - 1];
    // Summary content should NOT be the generic COACH response
    expect(summaryMessage.content).not.toBe(getMockClaudeResponse("COACH"));
    // Summary content should be the COACH_SUMMARY variant
    expect(summaryMessage.content).toBe(getMockClaudeResponse("COACH", true));
    // Summary is not an intervention
    expect(summaryMessage.isIntervention).toBeFalsy();
  });
});

// ── AC3: Throttle mechanism prevents excessive summaries ─────────────────

describe("joint-chat-summary — AC3: Throttle mechanism", () => {
  it("does not generate a summary when fewer than 6 user messages since last Coach message", async () => {
    // Seed with only 3 user messages after a Coach message — below the 6-message threshold
    const { t, caseId } = await seedJointChatForSummary({
      userMessageCount: 3,
      includeCoachMessage: true,
      coachMessageTimestamp: 900, // Coach message before user messages at 1000+
    });

    // The cron evaluateAndSummarize should skip this case due to insufficient activity
    await t.action(api.jointChat.evaluateAndSummarize, {
      caseId,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    // Only the pre-seeded Coach message should exist — no new summary
    const coachMessages = messages.filter(
      (m) => m.authorType === "COACH" && m.content !== "Earlier Coach response",
    );
    expect(coachMessages).toHaveLength(0);
  });

  it("generates a summary when 6+ user messages since last Coach message", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Seed with 8 user messages and a Coach message before them
    const { t, caseId } = await seedJointChatForSummary({
      userMessageCount: 8,
      includeCoachMessage: true,
      coachMessageTimestamp: 500, // Coach message well before user messages
    });

    await t.action(api.jointChat.evaluateAndSummarize, {
      caseId,
    });

    // Process scheduled generateCoachResponse (scheduled via ctx.scheduler.runAfter(0, ...))
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    const newCoachMessages = messages.filter(
      (m) => m.authorType === "COACH" && m.content !== "Earlier Coach response",
    );
    expect(newCoachMessages.length).toBeGreaterThanOrEqual(1);
    expect(newCoachMessages[newCoachMessages.length - 1].content).toBe(
      getMockClaudeResponse("COACH", true),
    );

    vi.useRealTimers();
  });
});

// ── AC4: Timer path bypasses NORMAL_EXCHANGE gate for summaries ──────────

describe("joint-chat-summary — AC4: Timer path bypasses suppression gate", () => {
  it("generates a summary-style response via triggerType timer even with NORMAL_EXCHANGE classification", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "NORMAL_EXCHANGE";

    const { t, caseId, triggeringMessageId } = await seedJointChatForSummary({
      userMessageCount: 8,
      includeCoachMessage: false,
    });

    // Timer trigger with summaryMode — bypasses the NORMAL_EXCHANGE gate
    await t.action(api.jointChat.generateCoachResponse, {
      caseId,
      messageId: triggeringMessageId,
      triggerType: "timer",
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    const coachMessages = messages.filter((m) => m.authorType === "COACH");
    expect(coachMessages.length).toBeGreaterThanOrEqual(1);

    const latestCoach = coachMessages[coachMessages.length - 1];
    expect(latestCoach.content).toBe(getMockClaudeResponse("COACH", true));
    // Timer-triggered summaries are NOT interventions
    expect(latestCoach.isIntervention).toBeFalsy();
  });
});

// ── AC5: No redundant summary when no new agreement ─────────────────────

describe("joint-chat-summary — AC5: No redundant summary", () => {
  it("does not post a summary when no new user messages since last Coach summary", async () => {
    const { t, caseId } = await seedJointChatForSummary({
      userMessageCount: 0,
      includeCoachMessage: true,
      coachMessageTimestamp: Date.now(), // Recent Coach message, no user activity after
    });

    await t.action(api.jointChat.evaluateAndSummarize, {
      caseId,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    // No new Coach messages should be created
    const coachMessagesAfterCron = messages.filter(
      (m) => m.authorType === "COACH" && m.content !== "Earlier Coach response",
    );
    expect(coachMessagesAfterCron).toHaveLength(0);
  });
});
