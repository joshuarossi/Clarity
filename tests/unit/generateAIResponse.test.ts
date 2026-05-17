import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import schema from "../../convex/schema";
import {
  assemblePrompt,
  PRIVATE_COACH_SYSTEM_PROMPT,
} from "../../convex/lib/prompts";
import type { PromptMessage } from "../../convex/lib/prompts";
import { getMockClaudeResponse } from "../../convex/lib/claudeMock";

/**
 * WOR-118: Private coaching AI action — generateAIResponse with streaming.
 *
 * Integration and unit tests for the generateAIResponse internal action,
 * its supporting internal mutations (updateStreamingMessage,
 * finalizeStreamingMessage, markMessageError), and prompt assembly
 * behaviour specific to the PRIVATE_COACH role.
 *
 * Uses convex-test with CLAUDE_MOCK=true to avoid external API calls.
 */

const api = anyApi;

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Seeds a two-party environment with interleaved private messages from
 * both parties. Extends the base seedTwoPartyEnv pattern from
 * privateCoaching.test.ts with pre-seeded message history for prompt
 * assembly and privacy-isolation tests.
 */
async function seedTwoPartyEnvWithMessages() {
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
      globalGuidance: "Test guidance",
      publishedAt: Date.now(),
      publishedByUserId: userAId,
    });
    await ctx.db.patch(tplId, { currentVersionId: vId });

    const cId = await ctx.db.insert("cases", {
      schemaVersion: 1,
      status: "BOTH_PRIVATE_COACHING",
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
    });

    await ctx.db.insert("partyStates", {
      caseId: cId,
      userId: userBId,
      role: "INVITEE",
      mainTopic: "Communication issues",
      description: "Feeling unheard in meetings",
      desiredOutcome: "Better collaboration",
      formCompletedAt: Date.now(),
    });

    // Interleaved messages from both parties
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userAId,
      role: "USER",
      content: "I feel frustrated about the project direction",
      status: "COMPLETE",
      createdAt: 1000,
    });
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userAId,
      role: "AI",
      content: "Tell me more about what frustrates you",
      status: "COMPLETE",
      createdAt: 2000,
    });
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userBId,
      role: "USER",
      content: "I feel like my ideas are dismissed",
      status: "COMPLETE",
      createdAt: 3000,
    });
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userBId,
      role: "AI",
      content: "That sounds difficult. Can you give an example?",
      status: "COMPLETE",
      createdAt: 4000,
    });
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userAId,
      role: "USER",
      content: "The other person keeps changing plans without consulting me",
      status: "COMPLETE",
      createdAt: 5000,
    });

    return { versionId: vId, caseId: cId };
  });

  return { t, userAId, userBId, versionId, caseId };
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

// ── AC 1: Prompt assembly with PRIVATE_COACH role ───────────────────────

describe("generateAIResponse — prompt assembly (PRIVATE_COACH role)", () => {
  it("assemblePrompt produces correct output when called with role PRIVATE_COACH, form fields, and acting user history", () => {
    const recentHistory: PromptMessage[] = [
      {
        role: "user",
        content: "I feel frustrated about the project direction",
      },
      { role: "assistant", content: "Tell me more about what frustrates you" },
      {
        role: "user",
        content: "The other person keeps changing plans without consulting me",
      },
    ];

    const result = assemblePrompt({
      role: "PRIVATE_COACH",
      caseId: "test-case-id",
      actingUserId: "test-user-id",
      recentHistory,
      context: {
        formFields: {
          mainTopic: "Disagreement about project direction",
          description: "We cannot agree on the next steps",
          desiredOutcome: "Find common ground",
        },
      },
    });

    // System prompt must be the PRIVATE_COACH constant
    expect(result.system).toBe(PRIVATE_COACH_SYSTEM_PROMPT);

    // Messages should contain form fields context then recentHistory
    expect(result.messages.length).toBe(recentHistory.length + 1);

    // First message is the form-fields context injection
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content).toContain("[Context — my situation]");
    expect(result.messages[0].content).toContain(
      "Disagreement about project direction",
    );
    expect(result.messages[0].content).toContain(
      "We cannot agree on the next steps",
    );
    expect(result.messages[0].content).toContain("Find common ground");

    // Remaining messages are the recentHistory verbatim
    expect(result.messages.slice(1)).toEqual(recentHistory);
  });

  it("action reads acting user's form fields and prior messages, then calls AI (integration)", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnvWithMessages();

    // Run the action — with CLAUDE_MOCK=true, it should produce a COMPLETE message
    await t.action(api.privateCoaching.generateAIResponse, {
      caseId,
      userId: userAId,
    });

    // Verify a new AI message was inserted for user A
    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userAId),
        )
        .collect(),
    );

    const aiMessages = messages.filter((m) => m.role === "AI");
    // There was already 1 AI message seeded (createdAt=2000); now there should be 2
    expect(aiMessages).toHaveLength(2);

    const newAiMessage = aiMessages.find((m) => m.createdAt > 5000);
    expect(newAiMessage).toBeDefined();
    expect(newAiMessage!.status).toBe("COMPLETE");
    expect(newAiMessage!.content.length).toBeGreaterThan(0);
  });
});

// ── AC 2: Context NEVER includes the other party's private messages ─────

describe("generateAIResponse — privacy isolation", () => {
  it("assemblePrompt with PRIVATE_COACH role ignores otherPartyPrivateMessages even if present in context", () => {
    const actingPartyHistory: PromptMessage[] = [
      { role: "user", content: "My concern is about project scope" },
    ];

    const result = assemblePrompt({
      role: "PRIVATE_COACH",
      caseId: "test-case-id",
      actingUserId: "test-user-id",
      recentHistory: actingPartyHistory,
      context: {
        formFields: { mainTopic: "Scope disagreement" },
        // Even if other party's messages are passed, they must NOT appear
        otherPartyPrivateMessages: [
          { role: "user", content: "SECRET content from the other party" },
          { role: "assistant", content: "SECRET reply to the other party" },
        ],
      },
    });

    // The assembled messages should contain only form fields context + acting party's history
    const allContent = result.messages.map((m) => m.content).join("\n");
    expect(allContent).not.toContain("SECRET");

    // Verify the messages count: 1 form-fields context + 1 recentHistory = 2
    expect(result.messages).toHaveLength(2);
  });

  it("action for party A never produces output containing party B's messages (integration)", async () => {
    const { t, userAId, userBId, caseId } = await seedTwoPartyEnvWithMessages();

    // Run the action for User A
    await t.action(api.privateCoaching.generateAIResponse, {
      caseId,
      userId: userAId,
    });

    // Verify no new messages were created under User B's userId
    const messagesB = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userBId),
        )
        .collect(),
    );

    // User B should still have exactly the 2 seeded messages (no new AI messages)
    expect(messagesB).toHaveLength(2);
    expect(messagesB.every((m) => m.createdAt <= 4000)).toBe(true);
  });
});

// ── AC 3: System prompt matches TechSpec §6.3.1 verbatim ────────────────

describe("generateAIResponse — system prompt", () => {
  it("PRIVATE_COACH_SYSTEM_PROMPT matches the TechSpec §6.3.1 verbatim text", () => {
    const expectedPrompt =
      "You are a calm, curious, non-judgmental listener helping a person articulate their perspective in an interpersonal conflict. Ask clarifying questions. Reflect what they say. Help them identify what they actually want, what they're feeling, and what the other person might be thinking. Do not take sides. Do not tell them they're right or wrong. Your only goal is to help them prepare to communicate with the other party clearly and calmly.";

    expect(PRIVATE_COACH_SYSTEM_PROMPT).toBe(expectedPrompt);
  });

  it("assemblePrompt with PRIVATE_COACH returns the verbatim system prompt", () => {
    const result = assemblePrompt({
      role: "PRIVATE_COACH",
      caseId: "test-case-id",
      actingUserId: "test-user-id",
      recentHistory: [{ role: "user", content: "test" }],
      context: {},
    });

    expect(result.system).toBe(PRIVATE_COACH_SYSTEM_PROMPT);
  });
});

// ── AC 4: No template content applied to Private Coach ──────────────────

describe("generateAIResponse — no template content", () => {
  it("assemblePrompt with PRIVATE_COACH ignores templateVersion even when provided", () => {
    const result = assemblePrompt({
      role: "PRIVATE_COACH",
      caseId: "test-case-id",
      actingUserId: "test-user-id",
      recentHistory: [{ role: "user", content: "Hello" }],
      templateVersion: {
        globalGuidance: "This guidance should NOT appear",
        coachInstructions: "These instructions should NOT appear",
      },
      context: {},
    });

    // System prompt must be exactly the hardcoded constant, no template appended
    expect(result.system).toBe(PRIVATE_COACH_SYSTEM_PROMPT);
    expect(result.system).not.toContain("This guidance should NOT appear");
    expect(result.system).not.toContain("These instructions should NOT appear");
  });
});

// ── AC 5: Inserts STREAMING row with empty content ──────────────────────

describe("generateAIResponse — STREAMING row insertion", () => {
  it("inserts a STREAMING row before the API call — row exists with empty content when API fails", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnvWithMessages();

    // Force the mock to fail on both attempts so the action never streams
    // any content. If the implementation inserts a STREAMING row before
    // calling the API, it will exist and be marked ERROR with empty content.
    // An implementation that skips the STREAMING insert would have no row
    // to mark as ERROR, or would insert directly with non-empty content.
    process.env.CLAUDE_MOCK_FAIL_COUNT = "2";

    await t.action(api.privateCoaching.generateAIResponse, {
      caseId,
      userId: userAId,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userAId),
        )
        .collect(),
    );

    const newAiMessage = messages.find(
      (m) => m.role === "AI" && m.createdAt > 5000,
    );
    // Row must exist — proves it was inserted BEFORE the API call
    expect(newAiMessage).toBeDefined();
    // Content must be empty — the STREAMING row was inserted with content=""
    // and no streaming occurred because the mock failed immediately
    expect(newAiMessage!.content).toBe("");
    // After two failures, the row is marked ERROR
    expect(newAiMessage!.status).toBe("ERROR");
  });

  it("STREAMING row has role=AI and is associated with the acting user", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnvWithMessages();

    // Use the fail path to observe the row in its post-insert state
    process.env.CLAUDE_MOCK_FAIL_COUNT = "2";

    await t.action(api.privateCoaching.generateAIResponse, {
      caseId,
      userId: userAId,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userAId),
        )
        .collect(),
    );

    const newAiMessage = messages.find(
      (m) => m.role === "AI" && m.createdAt > 5000,
    );
    expect(newAiMessage).toBeDefined();
    expect(newAiMessage!.role).toBe("AI");
    expect(newAiMessage!.userId).toEqual(userAId);
    expect(newAiMessage!.caseId).toEqual(caseId);
  });
});

// ── AC 6: Tokens stream via batched mutation updates (~50ms) ────────────

describe("generateAIResponse — streaming token updates", () => {
  it("calls updateStreamingMessage multiple times during streaming — verified via action duration with chunked delays", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnvWithMessages();

    // Use a 100ms delay per chunk. The mock response (~800 chars) should
    // be split into multiple chunks at ~50ms flush intervals. With 100ms
    // delay per chunk, 2+ chunks take ≥200ms. A single-write
    // implementation that skips updateStreamingMessage and writes the
    // full content in one finalizeStreamingMessage call would complete
    // in <100ms because it never waits between chunks.
    process.env.CLAUDE_MOCK_DELAY_MS = "100";

    const start = Date.now();
    await t.action(api.privateCoaching.generateAIResponse, {
      caseId,
      userId: userAId,
    });
    const elapsed = Date.now() - start;

    // At least 2 chunk cycles (2 × 100ms) must have occurred.
    // This proves multiple updateStreamingMessage calls happened.
    expect(elapsed).toBeGreaterThanOrEqual(150);

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userAId),
        )
        .collect(),
    );

    const newAiMessage = messages.find(
      (m) => m.role === "AI" && m.createdAt > 5000,
    );
    expect(newAiMessage).toBeDefined();

    // Final content must still match the full mock response — all chunks
    // were flushed and then finalized
    const expectedContent = getMockClaudeResponse("PRIVATE_COACH");
    expect(newAiMessage!.content).toBe(expectedContent);
    expect(newAiMessage!.status).toBe("COMPLETE");
  });

  it("final content matches the complete mock PRIVATE_COACH response", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnvWithMessages();

    await t.action(api.privateCoaching.generateAIResponse, {
      caseId,
      userId: userAId,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userAId),
        )
        .collect(),
    );

    const newAiMessage = messages.find(
      (m) => m.role === "AI" && m.createdAt > 5000,
    );
    expect(newAiMessage).toBeDefined();
    expect(newAiMessage!.content).toBe(getMockClaudeResponse("PRIVATE_COACH"));
  });
});

// ── AC 7: Completion sets status=COMPLETE and records token count ────────

describe("generateAIResponse — completion", () => {
  it("sets status to COMPLETE and records token count > 0", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnvWithMessages();

    await t.action(api.privateCoaching.generateAIResponse, {
      caseId,
      userId: userAId,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userAId),
        )
        .collect(),
    );

    const newAiMessage = messages.find(
      (m) => m.role === "AI" && m.createdAt > 5000,
    );
    expect(newAiMessage).toBeDefined();
    expect(newAiMessage!.status).toBe("COMPLETE");
    expect(newAiMessage!.tokens).toBeDefined();
    expect(newAiMessage!.tokens).toBeGreaterThan(0);
  });

  it("final content is non-empty", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnvWithMessages();

    await t.action(api.privateCoaching.generateAIResponse, {
      caseId,
      userId: userAId,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userAId),
        )
        .collect(),
    );

    const newAiMessage = messages.find(
      (m) => m.role === "AI" && m.createdAt > 5000,
    );
    expect(newAiMessage).toBeDefined();
    expect(newAiMessage!.content.length).toBeGreaterThan(0);
  });
});

// ── AC 8: Retry on AI failure ───────────────────────────────────────────

describe("generateAIResponse — retry on AI failure", () => {
  it("retries once on non-429 API failure and succeeds on second attempt", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnvWithMessages();

    // CLAUDE_MOCK_FAIL_COUNT=1 tells the mock to throw a generic (non-429)
    // error on the first API call and succeed on the second. The action
    // must catch the error, wait 2s, retry, and finalize to COMPLETE.
    // A no-retry implementation would mark the message as ERROR.
    process.env.CLAUDE_MOCK_FAIL_COUNT = "1";

    await t.action(api.privateCoaching.generateAIResponse, {
      caseId,
      userId: userAId,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userAId),
        )
        .collect(),
    );

    const newAiMessage = messages.find(
      (m) => m.role === "AI" && m.createdAt > 5000,
    );
    expect(newAiMessage).toBeDefined();
    // Retry succeeded — message must be COMPLETE, not ERROR
    expect(newAiMessage!.status).toBe("COMPLETE");
    expect(newAiMessage!.content.length).toBeGreaterThan(0);
  });

  it("marks message as ERROR after two consecutive non-429 failures", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnvWithMessages();

    // CLAUDE_MOCK_FAIL_COUNT=2 makes both attempts fail with a generic
    // (non-429) error. The action must: attempt → fail → wait 2s →
    // retry → fail again → call markMessageError.
    process.env.CLAUDE_MOCK_FAIL_COUNT = "2";

    await t.action(api.privateCoaching.generateAIResponse, {
      caseId,
      userId: userAId,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userAId),
        )
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

// ── AC 9: Retry on 429 rate limit ───────────────────────────────────────

describe("generateAIResponse — retry on 429 rate limit", () => {
  it("retries with exponential backoff on 429 and succeeds if second attempt works", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnvWithMessages();

    // CLAUDE_MOCK_FAIL_COUNT=1 + CLAUDE_MOCK_FAIL_STATUS=429 tells the
    // mock to return a 429 rate-limit error on the first call and succeed
    // on the second. The action must use exponential backoff
    // (2s * 2^attempt) for 429 errors specifically. A no-retry or
    // non-429-aware implementation would mark the message as ERROR.
    process.env.CLAUDE_MOCK_FAIL_COUNT = "1";
    process.env.CLAUDE_MOCK_FAIL_STATUS = "429";

    await t.action(api.privateCoaching.generateAIResponse, {
      caseId,
      userId: userAId,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userAId),
        )
        .collect(),
    );

    const newAiMessage = messages.find(
      (m) => m.role === "AI" && m.createdAt > 5000,
    );
    expect(newAiMessage).toBeDefined();
    // Retry after 429 succeeded — message must be COMPLETE
    expect(newAiMessage!.status).toBe("COMPLETE");
    expect(newAiMessage!.content.length).toBeGreaterThan(0);
  });

  it("marks message as ERROR after two consecutive 429 responses", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnvWithMessages();

    // CLAUDE_MOCK_FAIL_COUNT=2 + CLAUDE_MOCK_FAIL_STATUS=429 makes both
    // attempts fail with 429. The action must: attempt → 429 → wait
    // 2s * 2^0 → retry → 429 → call markMessageError.
    // This is distinct from AC 8's persistent-failure test: the failure
    // type is 429 (rate limit), not a generic error.
    process.env.CLAUDE_MOCK_FAIL_COUNT = "2";
    process.env.CLAUDE_MOCK_FAIL_STATUS = "429";

    await t.action(api.privateCoaching.generateAIResponse, {
      caseId,
      userId: userAId,
    });

    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userAId),
        )
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

// ── AC 10: First token latency target < 2s ──────────────────────────────

describe("generateAIResponse — first token latency", () => {
  it("first token arrives within 2s — approximated by minimising streaming overhead", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnvWithMessages();

    // Set CLAUDE_MOCK_DELAY_MS=1 so per-chunk delay is negligible.
    // With ~1ms per chunk, streaming overhead for N chunks ≈ N ms.
    // Total action time ≈ (setup + prompt assembly + first DB write) + N ms.
    // This means total elapsed time closely approximates first-token
    // latency (the time from action start to the first non-empty
    // updateStreamingMessage call). If total time < 2000ms with 1ms
    // chunk delay, then first-token latency must be < 2000ms.
    process.env.CLAUDE_MOCK_DELAY_MS = "1";

    const start = Date.now();

    await t.action(api.privateCoaching.generateAIResponse, {
      caseId,
      userId: userAId,
    });

    const elapsed = Date.now() - start;

    // With 1ms chunk delay, total time ≈ first-token latency + negligible
    // streaming overhead. Assert < 2000ms per AC 10 target.
    expect(elapsed).toBeLessThan(2000);

    // Verify action completed successfully
    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userAId),
        )
        .collect(),
    );

    const newAiMessage = messages.find(
      (m) => m.role === "AI" && m.createdAt > 5000,
    );
    expect(newAiMessage).toBeDefined();
    expect(newAiMessage!.status).toBe("COMPLETE");
    expect(newAiMessage!.content.length).toBeGreaterThan(0);
  });

  it("action overhead is small relative to streaming time — proving setup is fast", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnvWithMessages();

    // Run with a 50ms chunk delay. The mock response splits into N chunks.
    // Total time = overhead + N * 50ms. Subtract approximate streaming
    // time to estimate overhead (≈ first-token latency).
    process.env.CLAUDE_MOCK_DELAY_MS = "50";

    const start = Date.now();
    await t.action(api.privateCoaching.generateAIResponse, {
      caseId,
      userId: userAId,
    });
    const elapsedWith50ms = Date.now() - start;

    // Run again with 1ms delay to measure near-zero streaming overhead
    const {
      t: t2,
      userAId: userAId2,
      caseId: caseId2,
    } = await seedTwoPartyEnvWithMessages();
    process.env.CLAUDE_MOCK_DELAY_MS = "1";

    const start2 = Date.now();
    await t2.action(api.privateCoaching.generateAIResponse, {
      caseId: caseId2,
      userId: userAId2,
    });
    const elapsedWith1ms = Date.now() - start2;

    // The difference (elapsedWith50ms - elapsedWith1ms) ≈ N * 49ms
    // (streaming overhead). The 1ms run ≈ first-token latency.
    // First-token latency must be < 2000ms.
    expect(elapsedWith1ms).toBeLessThan(2000);

    // Sanity: the 50ms run should be measurably longer (streaming happened)
    expect(elapsedWith50ms).toBeGreaterThan(elapsedWith1ms);
  });
});

// ── Internal mutations: updateStreamingMessage ──────────────────────────

describe("updateStreamingMessage", () => {
  it("patches the content field of an existing privateMessages row", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnvWithMessages();

    // Insert a STREAMING message directly
    const messageId = await t.run(async (ctx) =>
      ctx.db.insert("privateMessages", {
        caseId,
        userId: userAId,
        role: "AI",
        content: "",
        status: "STREAMING",
        createdAt: Date.now(),
      }),
    );

    // Call updateStreamingMessage to patch the content
    await t.mutation(api.privateCoaching.updateStreamingMessage, {
      messageId,
      content: "Partial streaming content...",
    });

    const updated = await t.run(async (ctx) => ctx.db.get(messageId));
    expect(updated).toBeDefined();
    expect(updated!.content).toBe("Partial streaming content...");
    expect(updated!.status).toBe("STREAMING");
  });
});

// ── Internal mutations: finalizeStreamingMessage ────────────────────────

describe("finalizeStreamingMessage", () => {
  it("sets status to COMPLETE and records token count", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnvWithMessages();

    const messageId = await t.run(async (ctx) =>
      ctx.db.insert("privateMessages", {
        caseId,
        userId: userAId,
        role: "AI",
        content: "",
        status: "STREAMING",
        createdAt: Date.now(),
      }),
    );

    await t.mutation(api.privateCoaching.finalizeStreamingMessage, {
      messageId,
      content: "Final complete response content",
      tokens: 150,
    });

    const finalized = await t.run(async (ctx) => ctx.db.get(messageId));
    expect(finalized).toBeDefined();
    expect(finalized!.content).toBe("Final complete response content");
    expect(finalized!.status).toBe("COMPLETE");
    expect(finalized!.tokens).toBe(150);
  });
});

// ── Internal mutations: markMessageError ────────────────────────────────

describe("markMessageError", () => {
  it("sets status to ERROR on a privateMessages row", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnvWithMessages();

    const messageId = await t.run(async (ctx) =>
      ctx.db.insert("privateMessages", {
        caseId,
        userId: userAId,
        role: "AI",
        content: "",
        status: "STREAMING",
        createdAt: Date.now(),
      }),
    );

    await t.mutation(api.privateCoaching.markMessageError, {
      messageId,
    });

    const errorRow = await t.run(async (ctx) => ctx.db.get(messageId));
    expect(errorRow).toBeDefined();
    expect(errorRow!.status).toBe("ERROR");
  });
});
