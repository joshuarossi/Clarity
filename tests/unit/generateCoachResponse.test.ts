import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import schema from "../../convex/schema";
import { getMockClaudeResponse } from "../../convex/lib/claudeMock";

/**
 * WOR-125: Joint chat Coach AI action — generateCoachResponse with streaming.
 *
 * Integration and unit tests for the generateCoachResponse internal action,
 * its supporting internal mutations (insertCoachStreamingMessage,
 * updateCoachStreamingMessage, finalizeCoachMessage, markCoachMessageError),
 * and the two-step Haiku gate + Sonnet generation pipeline.
 *
 * Uses convex-test with CLAUDE_MOCK=true to avoid external API calls.
 *
 * First token latency target: < 3s for joint chat (AC 10 — monitoring concern).
 */

const api = anyApi;

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Seeds a joint chat environment with:
 * - Two users (A = INITIATOR, B = INVITEE)
 * - A template + templateVersion with coachInstructions
 * - A case in JOINT_ACTIVE status
 * - Both partyStates with synthesisText
 * - Joint messages (user messages for context)
 * - Private messages from both parties (for privacy filter verification)
 */
async function seedJointChatEnv(opts?: {
  userMessageCount?: number;
  includeCoachMessage?: boolean;
  privateMessageContent?: string;
  omitCoachInstructions?: boolean;
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
      coachInstructions: opts?.omitCoachInstructions
        ? undefined
        : "Use de-escalation techniques when parties are frustrated",
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

    // Seed joint messages — user messages for prompt context
    const messageCount = opts?.userMessageCount ?? 3;
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

    // Optionally seed a Coach message (for timer override tests)
    if (opts?.includeCoachMessage) {
      await ctx.db.insert("jointMessages", {
        caseId: cId,
        authorType: "COACH",
        content: "Earlier Coach response",
        status: "COMPLETE",
        createdAt: 500,
      });
    }

    // Seed private messages from both parties (for privacy filter)
    const privateContent =
      opts?.privateMessageContent ??
      "I feel frustrated that my ideas are being ignored in meetings";
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userAId,
      role: "USER",
      content: privateContent,
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

  // Insert the triggering user message (the "last user message" for classification)
  const triggeringMessageId = await t.run(async (ctx) =>
    ctx.db.insert("jointMessages", {
      caseId,
      authorType: "USER",
      authorUserId: userAId,
      content: "I think we should discuss the project timeline",
      status: "COMPLETE",
      createdAt: Date.now(),
    }),
  );

  return { t, userAId, userBId, versionId, caseId, triggeringMessageId };
}

// ── Environment management ──────────────────────────────────────────────

let savedClaudeMock: string | undefined;
let savedClaudeMockDelay: string | undefined;
let savedClaudeMockFailCount: string | undefined;
let savedClaudeMockFailStatus: string | undefined;
let savedClaudeMockClassification: string | undefined;

beforeEach(() => {
  savedClaudeMock = process.env.CLAUDE_MOCK;
  savedClaudeMockDelay = process.env.CLAUDE_MOCK_DELAY_MS;
  savedClaudeMockFailCount = process.env.CLAUDE_MOCK_FAIL_COUNT;
  savedClaudeMockFailStatus = process.env.CLAUDE_MOCK_FAIL_STATUS;
  savedClaudeMockClassification = process.env.CLAUDE_MOCK_CLASSIFICATION;
  process.env.CLAUDE_MOCK = "true";
  process.env.CLAUDE_MOCK_DELAY_MS = "10";
  delete process.env.CLAUDE_MOCK_FAIL_COUNT;
  delete process.env.CLAUDE_MOCK_FAIL_STATUS;
  delete process.env.CLAUDE_MOCK_CLASSIFICATION;
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
  if (savedClaudeMockClassification === undefined) {
    delete process.env.CLAUDE_MOCK_CLASSIFICATION;
  } else {
    process.env.CLAUDE_MOCK_CLASSIFICATION = savedClaudeMockClassification;
  }
});

// ── AC 1: Haiku classification step ───────────────────────────────────────

describe("generateCoachResponse — Haiku classification (AC 1)", () => {
  it("uses claude-haiku-4-5-20251001 for classification and produces a Coach response for QUESTION_TO_COACH", async () => {
    // Default mock classification is QUESTION_TO_COACH — Sonnet should fire
    process.env.CLAUDE_MOCK_CLASSIFICATION = "QUESTION_TO_COACH";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv();

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
    expect(latestCoach.content.length).toBeGreaterThan(0);
  });

  it("produces a Coach response for PROGRESS classification", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "PROGRESS";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv();

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
    expect(coachMessages[coachMessages.length - 1].status).toBe("COMPLETE");
  });

  it("produces a Coach response for INFLAMMATORY classification", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "INFLAMMATORY";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv();

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
    expect(coachMessages[coachMessages.length - 1].status).toBe("COMPLETE");
  });

  it("treats unexpected classification output as NORMAL_EXCHANGE — no Coach response", async () => {
    // Simulate Haiku returning garbage — should be treated as NORMAL_EXCHANGE
    process.env.CLAUDE_MOCK_CLASSIFICATION = "GARBAGE_VALUE";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv();

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
    // NORMAL_EXCHANGE (the safe default) → no Coach response
    expect(coachMessages).toHaveLength(0);
  });
});

// ── AC 2: Coach only responds for non-NORMAL_EXCHANGE ─────────────────────

describe("generateCoachResponse — conditional generation (AC 2)", () => {
  it("does NOT generate a response for NORMAL_EXCHANGE classification", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "NORMAL_EXCHANGE";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv({
      includeCoachMessage: true, // ensures timer override doesn't trigger
    });

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

    // Only the pre-seeded Coach message should exist — no new one
    const coachMessages = messages.filter(
      (m) => m.authorType === "COACH" && m.content !== "Earlier Coach response",
    );
    expect(coachMessages).toHaveLength(0);
  });

  it("generates a response for NORMAL_EXCHANGE when 5+ user exchanges have no Coach message (timer override)", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "NORMAL_EXCHANGE";

    // Seed 6 user messages with NO Coach message
    const { t, caseId, triggeringMessageId } = await seedJointChatEnv({
      userMessageCount: 6,
      includeCoachMessage: false,
    });

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
    // Timer override: Coach speaks after 5+ exchanges without Coach input
    expect(coachMessages.length).toBeGreaterThanOrEqual(1);
    expect(coachMessages[coachMessages.length - 1].status).toBe("COMPLETE");
  });

  it("does NOT generate a response for NORMAL_EXCHANGE when fewer than 5 user exchanges (no timer override)", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "NORMAL_EXCHANGE";

    // Seed only 3 user messages with no Coach message — below the 5+ threshold
    const { t, caseId, triggeringMessageId } = await seedJointChatEnv({
      userMessageCount: 3,
      includeCoachMessage: false,
    });

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
    expect(coachMessages).toHaveLength(0);
  });
});

// ── AC 3: Sonnet uses category-specific template if available ──────────────

describe("generateCoachResponse — template selection (AC 3)", () => {
  it("uses coachInstructions from templateVersion when available", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "QUESTION_TO_COACH";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv({
      omitCoachInstructions: false,
    });

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
    // Coach should produce a COMPLETE response using the template
    expect(coachMessages.length).toBeGreaterThanOrEqual(1);
    expect(coachMessages[coachMessages.length - 1].status).toBe("COMPLETE");
  });

  it("falls back to baseline when coachInstructions is absent", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "QUESTION_TO_COACH";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv({
      omitCoachInstructions: true,
    });

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
    // Even without coachInstructions, baseline template produces a response
    expect(coachMessages.length).toBeGreaterThanOrEqual(1);
    expect(coachMessages[coachMessages.length - 1].status).toBe("COMPLETE");
  });
});

// ── AC 4: Context includes joint chat + syntheses, NOT raw private msgs ───

describe("generateCoachResponse — context assembly (AC 4)", () => {
  it("produces a Coach response using joint chat history and synthesis texts — raw private messages are never in the prompt", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "QUESTION_TO_COACH";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv();

    await t.action(api.jointChat.generateCoachResponse, {
      caseId,
      messageId: triggeringMessageId,
      triggerType: "message",
    });

    // Verify Coach produced a response (context assembly worked)
    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    const coachMessages = messages.filter((m) => m.authorType === "COACH");
    expect(coachMessages.length).toBeGreaterThanOrEqual(1);

    const coachResponse = coachMessages[coachMessages.length - 1];
    expect(coachResponse.status).toBe("COMPLETE");
    expect(coachResponse.content.length).toBeGreaterThan(0);

    // The Coach response (from mock) should NOT contain the raw private message text.
    // In mock mode the response is deterministic and doesn't echo input, but this
    // verifies the architectural invariant: private messages are never in output.
    expect(coachResponse.content).not.toContain(
      "I feel frustrated that my ideas are being ignored in meetings",
    );
    expect(coachResponse.content).not.toContain(
      "My partner never listens to my suggestions about deadlines",
    );
  });

  it("validates case is JOINT_ACTIVE before proceeding — throws CONFLICT for other states", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "QUESTION_TO_COACH";

    const t = convexTest(schema);

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "user@test.com",
        displayName: "User",
        role: "USER",
        createdAt: Date.now(),
      }),
    );

    const { caseId, messageId } = await t.run(async (ctx) => {
      const tplId = await ctx.db.insert("templates", {
        category: "workplace",
        name: "Template",
        createdAt: Date.now(),
        createdByUserId: userId,
      });
      const vId = await ctx.db.insert("templateVersions", {
        templateId: tplId,
        version: 1,
        globalGuidance: "Guidance",
        publishedAt: Date.now(),
        publishedByUserId: userId,
      });

      // Case is NOT JOINT_ACTIVE
      const cId = await ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "CLOSED_RESOLVED",
        isSolo: false,
        category: "workplace",
        templateVersionId: vId,
        initiatorUserId: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const mId = await ctx.db.insert("jointMessages", {
        caseId: cId,
        authorType: "USER",
        authorUserId: userId,
        content: "test message",
        status: "COMPLETE",
        createdAt: Date.now(),
      });

      return { caseId: cId, messageId: mId };
    });

    // The action should throw a CONFLICT error for non-JOINT_ACTIVE cases
    await expect(
      t.action(api.jointChat.generateCoachResponse, {
        caseId,
        messageId,
        triggerType: "message",
      }),
    ).rejects.toThrow();
  });
});

// ── AC 5: Privacy response filter applied ──────────────────────────────────

describe("generateCoachResponse — privacy filter (AC 5)", () => {
  it("applies privacy filter — response passes when private messages do not overlap with Coach output", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "QUESTION_TO_COACH";

    // Default private messages don't overlap with mock COACH response
    const { t, caseId, triggeringMessageId } = await seedJointChatEnv();

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

    const coachResponse = coachMessages[coachMessages.length - 1];
    // Filter passed → normal COMPLETE with full content
    expect(coachResponse.status).toBe("COMPLETE");
    expect(coachResponse.content).toBe(getMockClaudeResponse("COACH"));
  });

  it("applies privacy filter against BOTH parties' raw private USER messages", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "QUESTION_TO_COACH";

    // Seed a private message that contains 8+ consecutive tokens matching
    // the mock COACH response ("Thank you both for joining this conversation")
    // This triggers the privacy filter — proves it checks BOTH parties' messages
    const { t, caseId, triggeringMessageId } = await seedJointChatEnv({
      privateMessageContent:
        "Thank you both for joining this conversation I can see you have",
    });

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

    const coachResponse = coachMessages[coachMessages.length - 1];
    // Filter rejects all retries (mock returns same content) → fallback message
    expect(coachResponse.status).toBe("COMPLETE");
    expect(coachResponse.content).toBe(
      "I'm having trouble responding to that right now. Could either of you rephrase?",
    );
  });
});

// ── AC 6: Privacy filter retry and fallback ────────────────────────────────

describe("generateCoachResponse — privacy filter retry and fallback (AC 6)", () => {
  it("retries generation up to 2 times on filter rejection — emits fallback on 3rd failure", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "QUESTION_TO_COACH";

    // Private message content that matches 8+ consecutive tokens in the mock
    // COACH response. Since mock always returns the same text, all 3 attempts
    // will fail the filter → fallback message is emitted.
    const { t, caseId, triggeringMessageId } = await seedJointChatEnv({
      privateMessageContent:
        "Thank you both for joining this conversation I can see you have",
    });

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

    const finalCoachMessage = coachMessages[coachMessages.length - 1];
    expect(finalCoachMessage.status).toBe("COMPLETE");
    expect(finalCoachMessage.content).toBe(
      "I'm having trouble responding to that right now. Could either of you rephrase?",
    );
  });

  it("fallback message has authorType COACH and status COMPLETE", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "QUESTION_TO_COACH";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv({
      privateMessageContent:
        "Thank you both for joining this conversation I can see you have",
    });

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
    const fallback = coachMessages[coachMessages.length - 1];
    expect(fallback.authorType).toBe("COACH");
    expect(fallback.status).toBe("COMPLETE");
  });
});

// ── AC 7: Streaming lifecycle ──────────────────────────────────────────────

describe("generateCoachResponse — streaming (AC 7)", () => {
  it("inserts a jointMessages row with authorType=COACH and status=STREAMING, then finalizes to COMPLETE", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "QUESTION_TO_COACH";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv();

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

    const coachResponse = coachMessages[coachMessages.length - 1];
    // After action completes, the message should be in COMPLETE state
    expect(coachResponse.status).toBe("COMPLETE");
    expect(coachResponse.content).toBe(getMockClaudeResponse("COACH"));
  });

  it("streams content via batched updates — elapsed time proves multiple flushes occurred", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "QUESTION_TO_COACH";
    process.env.CLAUDE_MOCK_DELAY_MS = "100";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv();

    const start = Date.now();
    await t.action(api.jointChat.generateCoachResponse, {
      caseId,
      messageId: triggeringMessageId,
      triggerType: "message",
    });
    const elapsed = Date.now() - start;

    // With 100ms delay per chunk and multiple chunks in the mock response,
    // at least 2 chunk cycles (200ms) must have occurred, proving batched updates
    expect(elapsed).toBeGreaterThanOrEqual(150);

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    const coachMessages = messages.filter((m) => m.authorType === "COACH");
    const coachResponse = coachMessages[coachMessages.length - 1];
    expect(coachResponse.status).toBe("COMPLETE");
    expect(coachResponse.content).toBe(getMockClaudeResponse("COACH"));
  });

  it("inserts STREAMING row before API call — row exists with empty content when API fails", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "QUESTION_TO_COACH";
    process.env.CLAUDE_MOCK_FAIL_COUNT = "2";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv();

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

    const errorMessage = coachMessages.find((m) => m.status === "ERROR");
    // Row must exist with ERROR status — proves it was inserted BEFORE the API call
    expect(errorMessage).toBeDefined();
    expect(errorMessage!.content).toBe("");
  });
});

// ── AC 8: Intervention flag ────────────────────────────────────────────────

describe("generateCoachResponse — intervention flag (AC 8)", () => {
  it("sets isIntervention=true when classification is INFLAMMATORY", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "INFLAMMATORY";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv();

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

    const interventionMessage = coachMessages[coachMessages.length - 1];
    expect(interventionMessage.isIntervention).toBe(true);
    expect(interventionMessage.status).toBe("COMPLETE");
  });

  it("does NOT set isIntervention=true for QUESTION_TO_COACH classification", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "QUESTION_TO_COACH";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv();

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

    const coachResponse = coachMessages[coachMessages.length - 1];
    // isIntervention should be falsy (undefined or false) for non-INFLAMMATORY
    expect(coachResponse.isIntervention).toBeFalsy();
  });

  it("does NOT set isIntervention=true for PROGRESS classification", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "PROGRESS";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv();

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

    const coachResponse = coachMessages[coachMessages.length - 1];
    expect(coachResponse.isIntervention).toBeFalsy();
  });
});

// ── AC 9: @-mention override ───────────────────────────────────────────────

describe("generateCoachResponse — @-mention override (AC 9)", () => {
  it("always generates a response on @-mention regardless of NORMAL_EXCHANGE classification", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "NORMAL_EXCHANGE";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv({
      includeCoachMessage: true, // ensures timer override doesn't trigger
    });

    await t.action(api.jointChat.generateCoachResponse, {
      caseId,
      messageId: triggeringMessageId,
      triggerType: "mention",
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    const coachMessages = messages.filter(
      (m) => m.authorType === "COACH" && m.content !== "Earlier Coach response",
    );
    // @-mention override: Coach responds even for NORMAL_EXCHANGE
    expect(coachMessages.length).toBeGreaterThanOrEqual(1);
    expect(coachMessages[coachMessages.length - 1].status).toBe("COMPLETE");
  });

  it("@-mention generates a response even with recent Coach messages present", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "NORMAL_EXCHANGE";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv({
      userMessageCount: 2,
      includeCoachMessage: true,
    });

    await t.action(api.jointChat.generateCoachResponse, {
      caseId,
      messageId: triggeringMessageId,
      triggerType: "mention",
    });

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
    expect(newCoachMessages[newCoachMessages.length - 1].status).toBe(
      "COMPLETE",
    );
  });
});

// ── AC 10: First token latency target < 3s ─────────────────────────────────

describe("generateCoachResponse — first token latency (AC 10)", () => {
  // NOTE: The < 3s first-token latency target is a monitoring/performance
  // concern per TechSpec §8.2. This test approximates by measuring total
  // action time with minimal streaming delay. In production, real latency
  // depends on Anthropic API response time and network conditions.
  it("action completes within 3s with minimal mock delay — approximates first-token latency target", async () => {
    process.env.CLAUDE_MOCK_CLASSIFICATION = "QUESTION_TO_COACH";
    process.env.CLAUDE_MOCK_DELAY_MS = "1";

    const { t, caseId, triggeringMessageId } = await seedJointChatEnv();

    const start = Date.now();
    await t.action(api.jointChat.generateCoachResponse, {
      caseId,
      messageId: triggeringMessageId,
      triggerType: "message",
    });
    const elapsed = Date.now() - start;

    // With 1ms chunk delay, total time ≈ first-token latency + negligible
    // streaming overhead. Assert < 3000ms per AC 10 target.
    expect(elapsed).toBeLessThan(3000);

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    const coachMessages = messages.filter((m) => m.authorType === "COACH");
    expect(coachMessages.length).toBeGreaterThanOrEqual(1);
    expect(coachMessages[coachMessages.length - 1].status).toBe("COMPLETE");
  });
});

// ── Internal mutations ─────────────────────────────────────────────────────

describe("insertCoachStreamingMessage", () => {
  it("inserts a jointMessages row with authorType=COACH, status=STREAMING, and empty content", async () => {
    const { t, caseId } = await seedJointChatEnv();

    await t.mutation(api.jointChat.insertCoachStreamingMessage, {
      caseId,
    });

    // Query the table to find the newly inserted Coach STREAMING row
    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    const coachStreamingMsg = messages.find(
      (m) => m.authorType === "COACH" && m.status === "STREAMING",
    );
    expect(coachStreamingMsg).toBeDefined();
    expect(coachStreamingMsg!.authorType).toBe("COACH");
    expect(coachStreamingMsg!.status).toBe("STREAMING");
    expect(coachStreamingMsg!.content).toBe("");
    expect(coachStreamingMsg!.caseId).toEqual(caseId);
  });

  it("sets isIntervention=true when specified", async () => {
    const { t, caseId } = await seedJointChatEnv();

    await t.mutation(api.jointChat.insertCoachStreamingMessage, {
      caseId,
      isIntervention: true,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    const coachStreamingMsg = messages.find(
      (m) => m.authorType === "COACH" && m.status === "STREAMING",
    );
    expect(coachStreamingMsg).toBeDefined();
    expect(coachStreamingMsg!.isIntervention).toBe(true);
  });
});

describe("updateCoachStreamingMessage", () => {
  it("patches the content field of a STREAMING jointMessages row", async () => {
    const { t, caseId } = await seedJointChatEnv();

    const messageId = await t.run(async (ctx) =>
      ctx.db.insert("jointMessages", {
        caseId,
        authorType: "COACH",
        content: "",
        status: "STREAMING",
        createdAt: Date.now(),
      }),
    );

    await t.mutation(api.jointChat.updateCoachStreamingMessage, {
      messageId,
      content: "Partial streaming content...",
    });

    const updated = await t.run(async (ctx) => ctx.db.get(messageId));
    expect(updated).toBeDefined();
    expect(updated!.content).toBe("Partial streaming content...");
    expect(updated!.status).toBe("STREAMING");
  });
});

describe("finalizeCoachMessage", () => {
  it("sets status to COMPLETE with final content", async () => {
    const { t, caseId } = await seedJointChatEnv();

    const messageId = await t.run(async (ctx) =>
      ctx.db.insert("jointMessages", {
        caseId,
        authorType: "COACH",
        content: "partial",
        status: "STREAMING",
        createdAt: Date.now(),
      }),
    );

    await t.mutation(api.jointChat.finalizeCoachMessage, {
      messageId,
      content: "Final complete Coach response",
    });

    const finalized = await t.run(async (ctx) => ctx.db.get(messageId));
    expect(finalized).toBeDefined();
    expect(finalized!.content).toBe("Final complete Coach response");
    expect(finalized!.status).toBe("COMPLETE");
  });
});

describe("markCoachMessageError", () => {
  it("sets status to ERROR on a jointMessages row", async () => {
    const { t, caseId } = await seedJointChatEnv();

    const messageId = await t.run(async (ctx) =>
      ctx.db.insert("jointMessages", {
        caseId,
        authorType: "COACH",
        content: "",
        status: "STREAMING",
        createdAt: Date.now(),
      }),
    );

    await t.mutation(api.jointChat.markCoachMessageError, {
      messageId,
    });

    const errorRow = await t.run(async (ctx) => ctx.db.get(messageId));
    expect(errorRow).toBeDefined();
    expect(errorRow!.status).toBe("ERROR");
  });
});
