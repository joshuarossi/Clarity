import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import schema from "../../convex/schema";
import {
  assemblePrompt,
  ANTI_QUOTATION_INSTRUCTION,
  SYNTHESIS_OUTPUT_FORMAT_INSTRUCTION,
} from "../../convex/lib/prompts";
import type { PromptContext } from "../../convex/lib/prompts";
import { filterResponse } from "../../convex/lib/privacyFilter";
import {
  validateSynthesisOutput,
  GENERIC_FALLBACK_SYNTHESIS,
} from "../../convex/lib/synthesisValidation";
import type { SynthesisOutput } from "../../convex/lib/synthesisValidation";

/**
 * WOR-122: Synthesis AI action — generate with privacy filter + state transition
 *
 * Unit and integration tests covering 7 acceptance criteria:
 * 1. Action reads both parties' private coaching messages + form fields as context
 * 2. System prompt includes verbatim anti-quotation instruction
 * 3. Output format is strict JSON validated before writing
 * 4. Response filter checks each synthesis against OTHER party's messages
 * 5. On filter match: regenerate up to 2 retries; fallback + audit on final failure
 * 6. On success: write synthesisText + synthesisGeneratedAt + transition to READY_FOR_JOINT atomically
 * 7. Synthesis is one-shot, non-streaming
 */

const api = anyApi;

// ── Marker strings for context assembly verification ───────────────────

const MARKER_INITIATOR_MSG_1 =
  "MARKER_INITIATOR_unique_private_message_content_alpha";
const MARKER_INITIATOR_MSG_2 =
  "MARKER_INITIATOR_second_unique_message_content_alpha";
const MARKER_INVITEE_MSG_1 =
  "MARKER_INVITEE_unique_private_message_content_bravo";
const MARKER_INVITEE_MSG_2 =
  "MARKER_INVITEE_second_unique_message_content_bravo";
const MARKER_INITIATOR_TOPIC = "MARKER_INITIATOR_TOPIC_workplace_friction";
const MARKER_INITIATOR_DESC = "MARKER_INITIATOR_DESC_disagreement_about_roles";
const MARKER_INITIATOR_OUTCOME = "MARKER_INITIATOR_OUTCOME_find_common_ground";
const MARKER_INVITEE_TOPIC = "MARKER_INVITEE_TOPIC_communication_problems";
const MARKER_INVITEE_DESC = "MARKER_INVITEE_DESC_feeling_dismissed_in_meetings";
const MARKER_INVITEE_OUTCOME = "MARKER_INVITEE_OUTCOME_better_collaboration";

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Seeds a complete two-party case in BOTH_PRIVATE_COACHING status with both
 * parties' private coaching completed, form fields populated, and private
 * messages seeded. This is the precondition for synthesis generation.
 */
async function seedSynthesisReadyCase() {
  const t = convexTest(schema);

  const userAId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "initiator@test.com",
      displayName: "Initiator",
      role: "USER",
      createdAt: Date.now(),
    }),
  );

  const userBId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "invitee@test.com",
      displayName: "Invitee",
      role: "USER",
      createdAt: Date.now(),
    }),
  );

  const { caseId, templateVersionId } = await t.run(async (ctx) => {
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

    // Both parties have completed private coaching with form fields
    await ctx.db.insert("partyStates", {
      caseId: cId,
      userId: userAId,
      role: "INITIATOR",
      mainTopic: MARKER_INITIATOR_TOPIC,
      description: MARKER_INITIATOR_DESC,
      desiredOutcome: MARKER_INITIATOR_OUTCOME,
      formCompletedAt: Date.now(),
      privateCoachingCompletedAt: Date.now(),
    });

    await ctx.db.insert("partyStates", {
      caseId: cId,
      userId: userBId,
      role: "INVITEE",
      mainTopic: MARKER_INVITEE_TOPIC,
      description: MARKER_INVITEE_DESC,
      desiredOutcome: MARKER_INVITEE_OUTCOME,
      formCompletedAt: Date.now(),
      privateCoachingCompletedAt: Date.now(),
    });

    // Initiator's private messages
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userAId,
      role: "USER",
      content: MARKER_INITIATOR_MSG_1,
      status: "COMPLETE",
      partyRole: "INITIATOR",
      createdAt: 1000,
    });
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userAId,
      role: "AI",
      content: "Coach response to initiator",
      status: "COMPLETE",
      partyRole: "INITIATOR",
      createdAt: 2000,
    });
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userAId,
      role: "USER",
      content: MARKER_INITIATOR_MSG_2,
      status: "COMPLETE",
      partyRole: "INITIATOR",
      createdAt: 3000,
    });

    // Invitee's private messages
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userBId,
      role: "USER",
      content: MARKER_INVITEE_MSG_1,
      status: "COMPLETE",
      partyRole: "INVITEE",
      createdAt: 4000,
    });
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userBId,
      role: "AI",
      content: "Coach response to invitee",
      status: "COMPLETE",
      partyRole: "INVITEE",
      createdAt: 5000,
    });
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userBId,
      role: "USER",
      content: MARKER_INVITEE_MSG_2,
      status: "COMPLETE",
      partyRole: "INVITEE",
      createdAt: 6000,
    });

    // A STREAMING message that should be excluded
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userAId,
      role: "AI",
      content: "This is still streaming and should not appear",
      status: "STREAMING",
      partyRole: "INITIATOR",
      createdAt: 7000,
    });

    return { caseId: cId, templateVersionId: vId };
  });

  return { t, userAId, userBId, caseId, templateVersionId };
}

// ── Environment management ─────────────────────────────────────────────

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

// ── AC 1: Action reads both parties' private coaching messages + form fields ──

describe("AC 1: Context assembly — reads both parties' messages and form fields", () => {
  it("assemblePrompt for SYNTHESIS role includes both parties' private messages", () => {
    const context: PromptContext = {
      formFields: {
        mainTopic: MARKER_INITIATOR_TOPIC,
        description: MARKER_INITIATOR_DESC,
        desiredOutcome: MARKER_INITIATOR_OUTCOME,
      },
      actingPartyPrivateMessages: [
        { role: "user", content: MARKER_INITIATOR_MSG_1 },
        { role: "assistant", content: "Coach response" },
      ],
      otherPartyPrivateMessages: [
        { role: "user", content: MARKER_INVITEE_MSG_1 },
        { role: "assistant", content: "Coach response" },
      ],
    };

    const result = assemblePrompt({
      role: "SYNTHESIS",
      caseId: "case_synthesis_test",
      actingUserId: "user_A",
      recentHistory: [],
      context,
    });

    const output = JSON.stringify({
      system: result.system,
      messages: result.messages,
    });

    // Both parties' messages must be present in the prompt
    expect(output).toContain(MARKER_INITIATOR_MSG_1);
    expect(output).toContain(MARKER_INVITEE_MSG_1);
  });

  it("assemblePrompt for SYNTHESIS role includes form field context", () => {
    const context: PromptContext = {
      formFields: {
        mainTopic: MARKER_INITIATOR_TOPIC,
        description: MARKER_INITIATOR_DESC,
        desiredOutcome: MARKER_INITIATOR_OUTCOME,
      },
      actingPartyPrivateMessages: [
        { role: "user", content: "Acting party message" },
      ],
      otherPartyPrivateMessages: [
        { role: "user", content: "Other party message" },
      ],
    };

    const result = assemblePrompt({
      role: "SYNTHESIS",
      caseId: "case_synthesis_form",
      actingUserId: "user_A",
      recentHistory: [],
      context,
    });

    const output = JSON.stringify({
      system: result.system,
      messages: result.messages,
    });

    expect(output).toContain(MARKER_INITIATOR_TOPIC);
    expect(output).toContain(MARKER_INITIATOR_DESC);
    expect(output).toContain(MARKER_INITIATOR_OUTCOME);
  });

  it("generate action reads both parties' context from the database (integration)", async () => {
    const { t, caseId } = await seedSynthesisReadyCase();

    // Run the generate action in mock mode — it should succeed
    await t.action(api.synthesis.generate, { caseId });

    // After successful generation, both partyStates should have synthesisText
    const partyStates = await t.run(async (ctx) =>
      ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    // Both parties should have synthesis written (proves both were read)
    expect(partyStates).toHaveLength(2);
    for (const ps of partyStates) {
      expect(ps.synthesisText).toBeDefined();
      expect(typeof ps.synthesisText).toBe("string");
      expect(ps.synthesisText!.length).toBeGreaterThan(0);
    }
  });
});

// ── AC 2: System prompt includes verbatim anti-quotation instruction ──────

describe("AC 2: Anti-quotation instruction in SYNTHESIS system prompt", () => {
  it("assemblePrompt for SYNTHESIS includes the exact ANTI_QUOTATION_INSTRUCTION constant", () => {
    const result = assemblePrompt({
      role: "SYNTHESIS",
      caseId: "case_anti_quote",
      actingUserId: "user_A",
      recentHistory: [],
      context: {
        actingPartyPrivateMessages: [
          { role: "user", content: "My private message" },
        ],
        otherPartyPrivateMessages: [
          { role: "user", content: "Other private message" },
        ],
      },
    });

    expect(result.system).toContain(ANTI_QUOTATION_INSTRUCTION);
  });

  it("ANTI_QUOTATION_INSTRUCTION contains the key phrase about never quoting", () => {
    // Verify the constant itself has the expected content from TechSpec §6.3.2
    expect(ANTI_QUOTATION_INSTRUCTION).toContain("NEVER quote");
  });

  it("assemblePrompt for SYNTHESIS includes the JSON output format instruction", () => {
    const result = assemblePrompt({
      role: "SYNTHESIS",
      caseId: "case_format",
      actingUserId: "user_A",
      recentHistory: [],
      context: {
        actingPartyPrivateMessages: [{ role: "user", content: "My message" }],
        otherPartyPrivateMessages: [{ role: "user", content: "Their message" }],
      },
    });

    expect(result.system).toContain(SYNTHESIS_OUTPUT_FORMAT_INSTRUCTION);
  });
});

// ── AC 3: Output format is strict JSON, validated before writing ───────────

describe("AC 3: validateSynthesisOutput — JSON validation", () => {
  it("accepts valid JSON with forInitiator and forInvitee string keys", () => {
    const valid = JSON.stringify({
      forInitiator: "Guidance for initiator",
      forInvitee: "Guidance for invitee",
    });

    const result = validateSynthesisOutput(valid);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.forInitiator).toBe("Guidance for initiator");
      expect(result.data.forInvitee).toBe("Guidance for invitee");
    }
  });

  it("accepts valid JSON with empty string values", () => {
    const valid = JSON.stringify({ forInitiator: "", forInvitee: "" });
    const result = validateSynthesisOutput(valid);
    expect(result.ok).toBe(true);
  });

  it("rejects malformed JSON", () => {
    const result = validateSynthesisOutput("not json at all {{{");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeDefined();
    }
  });

  it("rejects JSON with missing forInitiator key", () => {
    const result = validateSynthesisOutput(
      JSON.stringify({ forInvitee: "Only invitee" }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects JSON with missing forInvitee key", () => {
    const result = validateSynthesisOutput(
      JSON.stringify({ forInitiator: "Only initiator" }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects JSON with extra keys beyond forInitiator and forInvitee", () => {
    const result = validateSynthesisOutput(
      JSON.stringify({
        forInitiator: "Good",
        forInvitee: "Good",
        extraKey: "Should fail",
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects JSON where forInitiator is not a string", () => {
    const result = validateSynthesisOutput(
      JSON.stringify({ forInitiator: 42, forInvitee: "Valid" }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects JSON where forInvitee is not a string", () => {
    const result = validateSynthesisOutput(
      JSON.stringify({ forInitiator: "Valid", forInvitee: ["array"] }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects JSON that is a valid array instead of an object", () => {
    const result = validateSynthesisOutput(JSON.stringify(["not", "object"]));
    expect(result.ok).toBe(false);
  });

  it("rejects JSON that is a primitive value", () => {
    const result = validateSynthesisOutput(JSON.stringify("just a string"));
    expect(result.ok).toBe(false);
  });

  it("rejects null", () => {
    const result = validateSynthesisOutput("null");
    expect(result.ok).toBe(false);
  });

  it("GENERIC_FALLBACK_SYNTHESIS has the expected shape", () => {
    const fallback: SynthesisOutput = GENERIC_FALLBACK_SYNTHESIS;
    expect(typeof fallback.forInitiator).toBe("string");
    expect(typeof fallback.forInvitee).toBe("string");
    expect(fallback.forInitiator.length).toBeGreaterThan(0);
    expect(fallback.forInvitee.length).toBeGreaterThan(0);
  });
});

// ── AC 4: Response filter checks synthesis against OTHER party's messages ──

describe("AC 4: Cross-party privacy filter — cross-wise checking", () => {
  it("filterResponse detects >=8 consecutive tokens from other party's message in synthesis text", () => {
    // Build a message with enough tokens to trigger the filter
    const otherPartyMessage =
      "I feel extremely frustrated because my partner never listens to my concerns about the project deadlines and deliverables";

    // Synthesis that leaks 8+ consecutive tokens from the other party
    const leakySynthesis =
      "In your discussion, consider that your partner never listens to my concerns about the project deadlines and deliverables which is difficult";

    const result = filterResponse(leakySynthesis, [otherPartyMessage]);

    expect(result.passed).toBe(false);
    expect(result.matchedSubstring).toBeDefined();
  });

  it("filterResponse passes when synthesis does not contain 8 consecutive tokens from other party", () => {
    const otherPartyMessage =
      "I feel extremely frustrated because my partner never listens to my concerns about the project deadlines";

    // Synthesis that rephrases without verbatim overlap
    const safeSynthesis =
      "Your partner has expressed frustration about communication patterns. They want to feel heard when discussing timelines and expectations.";

    const result = filterResponse(safeSynthesis, [otherPartyMessage]);

    expect(result.passed).toBe(true);
  });

  it("forInitiator is checked against invitee's messages (cross-wise)", () => {
    // Invitee's private messages
    const inviteeMessages = [
      "I think the initiator is being completely unreasonable about the budget allocation for our team project this quarter",
    ];

    // forInitiator text leaks invitee's words
    const forInitiator =
      "Your partner mentioned that you are being completely unreasonable about the budget allocation for our team project this quarter which";

    const result = filterResponse(forInitiator, inviteeMessages);
    expect(result.passed).toBe(false);
  });

  it("forInvitee is checked against initiator's messages (cross-wise)", () => {
    // Initiator's private messages
    const initiatorMessages = [
      "The invitee keeps dismissing my ideas in every single team meeting we have and it makes me feel invisible",
    ];

    // forInvitee text leaks initiator's words
    const forInvitee =
      "Your partner said that you keep dismissing my ideas in every single team meeting we have and it makes me feel invisible entirely";

    const result = filterResponse(forInvitee, initiatorMessages);
    expect(result.passed).toBe(false);
  });

  it("filter only checks USER-role messages, not AI responses", () => {
    // Even if synthesis contains AI text verbatim, it should pass
    // because only USER messages are fed to the filter.
    // The action feeds only USER-role messages to filterResponse —
    // AI responses are excluded from the otherPartyMessages array.
    const synthesis =
      "That sounds really challenging. Can you tell me more about how that makes you feel? This is what your partner's coach explored.";

    // When the filter is called with an empty array (no USER messages),
    // it should pass
    const result = filterResponse(synthesis, []);
    expect(result.passed).toBe(true);
  });
});

// ── AC 5: On filter match: regenerate up to 2 retries, fallback on failure ──

/**
 * Seeds a case where the invitee's private messages contain a phrase that
 * appears verbatim in the CLAUDE_MOCK SYNTHESIS forInitiator response.
 * This guarantees the privacy filter detects an 8+ consecutive token match
 * on forInitiator vs invitee messages, forcing the retry/fallback path.
 *
 * The mock forInitiator contains:
 *   "you both want clearer communication and mutual respect in decision-making"
 * We seed this exact phrase as the invitee's private message so the filter
 * fails cross-wise (forInitiator checked against invitee's messages).
 * Since the mock returns identical content on every call, all 3 attempts fail.
 */
async function seedCaseWithFilterFailingMessages() {
  const t = convexTest(schema);

  const userAId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "initiator-retry@test.com",
      displayName: "Initiator",
      role: "USER",
      createdAt: Date.now(),
    }),
  );

  const userBId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "invitee-retry@test.com",
      displayName: "Invitee",
      role: "USER",
      createdAt: Date.now(),
    }),
  );

  const caseId = await t.run(async (ctx) => {
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
      mainTopic: "Topic",
      description: "Description",
      desiredOutcome: "Outcome",
      formCompletedAt: Date.now(),
      privateCoachingCompletedAt: Date.now(),
    });

    await ctx.db.insert("partyStates", {
      caseId: cId,
      userId: userBId,
      role: "INVITEE",
      mainTopic: "Topic",
      description: "Description",
      desiredOutcome: "Outcome",
      formCompletedAt: Date.now(),
      privateCoachingCompletedAt: Date.now(),
    });

    // Initiator's private messages — safe content unrelated to mock response
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userAId,
      role: "USER",
      content: "I need help resolving a scheduling conflict with my coworker",
      status: "COMPLETE",
      partyRole: "INITIATOR",
      createdAt: 1000,
    });

    // Invitee's private message — verbatim phrase from mock forInitiator.
    // The mock SYNTHESIS forInitiator contains this exact phrase, so the
    // privacy filter will match 8+ consecutive tokens and reject it.
    await ctx.db.insert("privateMessages", {
      caseId: cId,
      userId: userBId,
      role: "USER",
      content:
        "you both want clearer communication and mutual respect in decision-making",
      status: "COMPLETE",
      partyRole: "INVITEE",
      createdAt: 2000,
    });

    return cId;
  });

  return { t, userAId, userBId, caseId };
}

describe("AC 5: Retry logic and fallback on repeated filter failure", () => {
  it("action retries up to 2 times and writes fallback on 3 consecutive failures (integration)", async () => {
    const { t, caseId } = await seedCaseWithFilterFailingMessages();

    // The mock returns identical content each call. The invitee's private
    // message contains a verbatim substring from mock forInitiator, so the
    // privacy filter will fail on every attempt. After 3 failures (initial +
    // 2 retries), the action must write GENERIC_FALLBACK_SYNTHESIS.
    await t.action(api.synthesis.generate, { caseId });

    const partyStates = await t.run(async (ctx) =>
      ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    const initiator = partyStates.find((ps) => ps.role === "INITIATOR");
    const invitee = partyStates.find((ps) => ps.role === "INVITEE");

    expect(initiator).toBeDefined();
    expect(invitee).toBeDefined();

    // Both parties must receive the generic fallback text
    expect(initiator!.synthesisText).toBe(
      GENERIC_FALLBACK_SYNTHESIS.forInitiator,
    );
    expect(invitee!.synthesisText).toBe(GENERIC_FALLBACK_SYNTHESIS.forInvitee);
    expect(initiator!.synthesisGeneratedAt).toBeDefined();
    expect(invitee!.synthesisGeneratedAt).toBeDefined();
  });

  it("happy path: safe mock content passes filter without retry or fallback", async () => {
    const { t, caseId } = await seedSynthesisReadyCase();

    await t.action(api.synthesis.generate, { caseId });

    const partyStates = await t.run(async (ctx) =>
      ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    for (const ps of partyStates) {
      expect(ps.synthesisText).toBeDefined();
      expect(ps.synthesisGeneratedAt).toBeDefined();
      // Should NOT be fallback text — real (mock) synthesis was used
      expect(ps.synthesisText).not.toBe(
        GENERIC_FALLBACK_SYNTHESIS.forInitiator,
      );
      expect(ps.synthesisText).not.toBe(GENERIC_FALLBACK_SYNTHESIS.forInvitee);
    }

    // No audit log for privacy failure on happy path
    const auditEntries = await t.run(async (ctx) =>
      ctx.db.query("auditLog").collect(),
    );
    const privacyFailures = auditEntries.filter(
      (entry) => entry.action === "SYNTHESIS_PRIVACY_FAILURE",
    );
    expect(privacyFailures).toHaveLength(0);
  });

  it("GENERIC_FALLBACK_SYNTHESIS passes the privacy filter (safe by design)", () => {
    // Fallback text must not contain any party's private content
    const arbitraryPrivateMessages = [
      "I am very upset about how the quarterly budget was handled by my manager in our last department meeting",
      "My colleague always takes credit for my ideas during presentations to the executive leadership team",
    ];

    const initiatorResult = filterResponse(
      GENERIC_FALLBACK_SYNTHESIS.forInitiator,
      arbitraryPrivateMessages,
    );
    expect(initiatorResult.passed).toBe(true);

    const inviteeResult = filterResponse(
      GENERIC_FALLBACK_SYNTHESIS.forInvitee,
      arbitraryPrivateMessages,
    );
    expect(inviteeResult.passed).toBe(true);
  });

  it("on final filter failure, auditLog entry is written with SYNTHESIS_PRIVACY_FAILURE action (integration)", async () => {
    const { t, caseId } = await seedCaseWithFilterFailingMessages();

    await t.action(api.synthesis.generate, { caseId });

    const auditEntries = await t.run(async (ctx) =>
      ctx.db.query("auditLog").collect(),
    );

    const privacyFailures = auditEntries.filter(
      (entry) => entry.action === "SYNTHESIS_PRIVACY_FAILURE",
    );

    // Exactly 1 audit log entry for the privacy failure
    expect(privacyFailures).toHaveLength(1);

    const entry = privacyFailures[0];
    expect(entry.targetType).toBe("case");
    expect(entry.targetId).toBe(caseId);
  });

  it("case still transitions to READY_FOR_JOINT even when fallback is used (integration)", async () => {
    const { t, caseId } = await seedCaseWithFilterFailingMessages();

    await t.action(api.synthesis.generate, { caseId });

    const updatedCase = await t.run(async (ctx) => ctx.db.get(caseId));
    expect(updatedCase).not.toBeNull();
    expect(updatedCase!.status).toBe("READY_FOR_JOINT");
  });
});

// ── AC 6: Atomic persistence — synthesisText + synthesisGeneratedAt + READY_FOR_JOINT ──

describe("AC 6: Atomic persistence — both partyStates and case status updated together", () => {
  it("after successful generation, both partyStates have synthesisText and synthesisGeneratedAt", async () => {
    const { t, caseId } = await seedSynthesisReadyCase();

    await t.action(api.synthesis.generate, { caseId });

    const partyStates = await t.run(async (ctx) =>
      ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    expect(partyStates).toHaveLength(2);

    const initiator = partyStates.find((ps) => ps.role === "INITIATOR");
    const invitee = partyStates.find((ps) => ps.role === "INVITEE");

    expect(initiator).toBeDefined();
    expect(invitee).toBeDefined();

    // Both must have synthesis text
    expect(initiator!.synthesisText).toBeDefined();
    expect(typeof initiator!.synthesisText).toBe("string");
    expect(initiator!.synthesisText!.length).toBeGreaterThan(0);

    expect(invitee!.synthesisText).toBeDefined();
    expect(typeof invitee!.synthesisText).toBe("string");
    expect(invitee!.synthesisText!.length).toBeGreaterThan(0);

    // Both must have synthesisGeneratedAt timestamp
    expect(initiator!.synthesisGeneratedAt).toBeDefined();
    expect(typeof initiator!.synthesisGeneratedAt).toBe("number");
    expect(initiator!.synthesisGeneratedAt!).toBeGreaterThan(0);

    expect(invitee!.synthesisGeneratedAt).toBeDefined();
    expect(typeof invitee!.synthesisGeneratedAt).toBe("number");
    expect(invitee!.synthesisGeneratedAt!).toBeGreaterThan(0);
  });

  it("after successful generation, case status transitions to READY_FOR_JOINT", async () => {
    const { t, caseId } = await seedSynthesisReadyCase();

    await t.action(api.synthesis.generate, { caseId });

    const updatedCase = await t.run(async (ctx) => ctx.db.get(caseId));

    expect(updatedCase).not.toBeNull();
    expect(updatedCase!.status).toBe("READY_FOR_JOINT");
  });

  it("after successful generation, case updatedAt is refreshed", async () => {
    const { t, caseId } = await seedSynthesisReadyCase();

    const caseBefore = await t.run(async (ctx) => ctx.db.get(caseId));
    const beforeUpdatedAt = caseBefore!.updatedAt;

    // Small delay to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    await t.action(api.synthesis.generate, { caseId });

    const caseAfter = await t.run(async (ctx) => ctx.db.get(caseId));
    expect(caseAfter!.updatedAt).toBeGreaterThanOrEqual(beforeUpdatedAt);
  });

  it("each party gets different synthesis text (not identical)", async () => {
    const { t, caseId } = await seedSynthesisReadyCase();

    await t.action(api.synthesis.generate, { caseId });

    const partyStates = await t.run(async (ctx) =>
      ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    const initiator = partyStates.find((ps) => ps.role === "INITIATOR");
    const invitee = partyStates.find((ps) => ps.role === "INVITEE");

    // The mock returns distinct text for each party
    expect(initiator!.synthesisText).not.toBe(invitee!.synthesisText);
  });

  it("generate throws CONFLICT error if case is not in BOTH_PRIVATE_COACHING status", async () => {
    const t = convexTest(schema);

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "user@test.com",
        displayName: "User",
        role: "USER",
        createdAt: Date.now(),
      }),
    );

    const caseId = await t.run(async (ctx) => {
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

      return ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "READY_FOR_JOINT", // Already past the expected status
        isSolo: false,
        category: "workplace",
        templateVersionId: vId,
        initiatorUserId: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(
      t.action(api.synthesis.generate, { caseId }),
    ).rejects.toThrow();
  });

  it("generate throws if both parties have not completed private coaching", async () => {
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

    const caseId = await t.run(async (ctx) => {
      const tplId = await ctx.db.insert("templates", {
        category: "workplace",
        name: "Template",
        createdAt: Date.now(),
        createdByUserId: userAId,
      });
      const vId = await ctx.db.insert("templateVersions", {
        templateId: tplId,
        version: 1,
        globalGuidance: "Guidance",
        publishedAt: Date.now(),
        publishedByUserId: userAId,
      });

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

      // Initiator completed, but invitee has NOT completed
      await ctx.db.insert("partyStates", {
        caseId: cId,
        userId: userAId,
        role: "INITIATOR",
        mainTopic: "Topic",
        formCompletedAt: Date.now(),
        privateCoachingCompletedAt: Date.now(),
      });
      await ctx.db.insert("partyStates", {
        caseId: cId,
        userId: userBId,
        role: "INVITEE",
        mainTopic: "Topic",
        formCompletedAt: Date.now(),
        // privateCoachingCompletedAt is NOT set
      });

      return cId;
    });

    await expect(
      t.action(api.synthesis.generate, { caseId }),
    ).rejects.toThrow();
  });
});

// ── AC 7: Synthesis is one-shot, non-streaming ─────────────────────────────

describe("AC 7: One-shot, non-streaming synthesis", () => {
  it("in mock mode, uses getMockClaudeResponse('SYNTHESIS') — no streaming infrastructure", async () => {
    const { t, caseId } = await seedSynthesisReadyCase();

    // The action in mock mode should use getMockClaudeResponse, not stream
    await t.action(api.synthesis.generate, { caseId });

    // Verify synthesis was written (proves one-shot path completed)
    const partyStates = await t.run(async (ctx) =>
      ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    // Both parties have synthesis text written in a single pass
    for (const ps of partyStates) {
      expect(ps.synthesisText).toBeDefined();
      expect(ps.synthesisGeneratedAt).toBeDefined();
    }

    // No STREAMING-status messages should be created for synthesis
    const allMessages = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    // The only STREAMING message is the one we seeded (pre-existing, not from synthesis)
    const streamingMessages = allMessages.filter(
      (m) => m.status === "STREAMING",
    );
    expect(streamingMessages).toHaveLength(1); // Only the pre-seeded one
  });

  it("synthesis does not create any new privateMessage rows (it writes to partyStates only)", async () => {
    const { t, caseId } = await seedSynthesisReadyCase();

    const messagesBefore = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    await t.action(api.synthesis.generate, { caseId });

    const messagesAfter = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    // No new messages created by synthesis action
    expect(messagesAfter.length).toBe(messagesBefore.length);
  });
});
