import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { conflict, aiError } from "./lib/errors";
import { assemblePrompt, type PromptMessage } from "./lib/prompts";
import { isClaudeMockEnabled, getMockClaudeResponse } from "./lib/claudeMock";
import { filterResponse } from "./lib/privacyFilter";
import {
  validateSynthesisOutput,
  GENERIC_FALLBACK_SYNTHESIS,
} from "./lib/synthesisValidation";

// ---------------------------------------------------------------------------
// Internal queries
// ---------------------------------------------------------------------------

export const getCase = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.caseId);
  },
});

export const getAllPartyStates = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("partyStates")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect();
  },
});

export const getAllPrivateMessages = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("privateMessages")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect();
  },
});

// ---------------------------------------------------------------------------
// Persistence mutation — atomic write of synthesis results + status transition
// ---------------------------------------------------------------------------

export const persistSynthesisResults = internalMutation({
  args: {
    caseId: v.id("cases"),
    forInitiator: v.string(),
    forInvitee: v.string(),
  },
  handler: async (ctx, args) => {
    const partyStates = await ctx.db
      .query("partyStates")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect();

    const now = Date.now();

    for (const ps of partyStates) {
      const text = ps.role === "INITIATOR" ? args.forInitiator : args.forInvitee;
      await ctx.db.patch(ps._id, {
        synthesisText: text,
        synthesisGeneratedAt: now,
      });
    }

    await ctx.db.patch(args.caseId, {
      status: "READY_FOR_JOINT",
      updatedAt: now,
    });
  },
});

// ---------------------------------------------------------------------------
// Main synthesis action
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 3; // initial + 2 retries

export const generate = internalAction({
  args: {
    caseId: v.id("cases"),
  },
  handler: async (ctx, args) => {
    // 1. Read case and validate status
    const caseDoc = await ctx.runQuery(internal.synthesis.getCase, {
      caseId: args.caseId,
    });
    if (!caseDoc) {
      throw conflict("Case not found");
    }
    if (caseDoc.status !== "BOTH_PRIVATE_COACHING") {
      throw conflict(
        `Case is not in BOTH_PRIVATE_COACHING status (current: ${caseDoc.status})`,
      );
    }

    // 2. Read all party states and validate both completed coaching
    const partyStates = await ctx.runQuery(internal.synthesis.getAllPartyStates, {
      caseId: args.caseId,
    });
    const initiatorState = partyStates.find((ps) => ps.role === "INITIATOR");
    const inviteeState = partyStates.find((ps) => ps.role === "INVITEE");

    if (!initiatorState || !inviteeState) {
      throw conflict("Both party states must exist");
    }
    if (
      !initiatorState.privateCoachingCompletedAt ||
      !inviteeState.privateCoachingCompletedAt
    ) {
      throw conflict("Both parties must complete private coaching before synthesis");
    }

    // 3. Read all private messages
    const allMessages = await ctx.runQuery(
      internal.synthesis.getAllPrivateMessages,
      { caseId: args.caseId },
    );

    // Group messages by party — use partyRole for solo cases, userId otherwise
    const isSolo = caseDoc.isSolo;
    const initiatorMessages = allMessages.filter((m) =>
      isSolo
        ? m.partyRole === "INITIATOR"
        : m.userId === initiatorState.userId,
    );
    const inviteeMessages = allMessages.filter((m) =>
      isSolo
        ? m.partyRole === "INVITEE"
        : m.userId === inviteeState.userId,
    );

    // Build prompt messages (COMPLETE messages only)
    const toPromptMessages = (
      msgs: typeof allMessages,
    ): PromptMessage[] =>
      msgs
        .filter((m) => m.status === "COMPLETE")
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((m) => ({
          role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
          content: m.content,
        }));

    const initiatorPromptMsgs = toPromptMessages(initiatorMessages);
    const inviteePromptMsgs = toPromptMessages(inviteeMessages);

    // 4. Assemble prompt
    const prompt = assemblePrompt({
      role: "SYNTHESIS",
      caseId: args.caseId,
      actingUserId: initiatorState.userId,
      recentHistory: [],
      context: {
        formFields: {
          mainTopic: initiatorState.mainTopic,
          description: initiatorState.description,
          desiredOutcome: initiatorState.desiredOutcome,
        },
        actingPartyPrivateMessages: initiatorPromptMsgs,
        otherPartyPrivateMessages: inviteePromptMsgs,
      },
    });

    // Extract USER-role message content for privacy filter
    const initiatorUserMessages = initiatorMessages
      .filter((m) => m.role === "USER" && m.status === "COMPLETE")
      .map((m) => m.content);
    const inviteeUserMessages = inviteeMessages
      .filter((m) => m.role === "USER" && m.status === "COMPLETE")
      .map((m) => m.content);

    // 5. Check API key / mock mode
    const isMock = isClaudeMockEnabled();
    if (!isMock) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.error("synthesis.generate: ANTHROPIC_API_KEY is not set", {
          caseId: args.caseId,
        });
        throw aiError("ANTHROPIC_API_KEY is not set");
      }
    }

    // 6. Generate with retry loop
    const lastFilterMatches: string[] = [];

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Call Claude (or mock)
      let rawResponse: string;

      if (isMock) {
        // Check mock failure simulation
        const failCount = parseInt(
          process.env.CLAUDE_MOCK_FAIL_COUNT ?? "0",
          10,
        );
        if (attempt < failCount) {
          // Simulate a filter-failing response for mock mode
          rawResponse = JSON.stringify({
            forInitiator: "mock-filter-fail-initiator",
            forInvitee: "mock-filter-fail-invitee",
          });
        } else {
          rawResponse = getMockClaudeResponse("SYNTHESIS");
        }
      } else {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
        });

        const response = await client.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 4096,
          system: prompt.system,
          messages: prompt.messages,
        });

        rawResponse = response.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");
      }

      // Validate JSON structure
      const validation = validateSynthesisOutput(rawResponse);
      if (!validation.ok) {
        console.error(
          `synthesis.generate: invalid JSON output (attempt ${attempt + 1})`,
          { caseId: args.caseId, error: validation.error },
        );
        lastFilterMatches.push(`validation: ${validation.error}`);
        continue;
      }

      const { forInitiator, forInvitee } = validation.data;

      // Privacy filter — cross-wise checking
      const initiatorFilter = filterResponse(forInitiator, inviteeUserMessages);
      const inviteeFilter = filterResponse(forInvitee, initiatorUserMessages);

      if (!initiatorFilter.passed || !inviteeFilter.passed) {
        const matches: string[] = [];
        if (!initiatorFilter.passed && initiatorFilter.matchedSubstring) {
          matches.push(`forInitiator: "${initiatorFilter.matchedSubstring}"`);
        }
        if (!inviteeFilter.passed && inviteeFilter.matchedSubstring) {
          matches.push(`forInvitee: "${inviteeFilter.matchedSubstring}"`);
        }
        console.error(
          `synthesis.generate: privacy filter failed (attempt ${attempt + 1})`,
          { caseId: args.caseId, matches },
        );
        lastFilterMatches.push(...matches);
        continue;
      }

      // All checks passed — persist results
      await ctx.runMutation(internal.synthesis.persistSynthesisResults, {
        caseId: args.caseId,
        forInitiator,
        forInvitee,
      });
      return;
    }

    // All attempts exhausted — use fallback and flag for admin review
    console.error(
      `synthesis.generate: all ${MAX_ATTEMPTS} attempts failed, using fallback`,
      { caseId: args.caseId, filterMatches: lastFilterMatches },
    );

    // Insert audit log entry
    await ctx.runMutation(internal.synthesis.insertAuditLog, {
      caseId: args.caseId,
      actorUserId: caseDoc.initiatorUserId,
      metadata: {
        filterMatches: lastFilterMatches,
        retryCount: MAX_ATTEMPTS,
      },
    });

    // Persist fallback synthesis
    await ctx.runMutation(internal.synthesis.persistSynthesisResults, {
      caseId: args.caseId,
      forInitiator: GENERIC_FALLBACK_SYNTHESIS.forInitiator,
      forInvitee: GENERIC_FALLBACK_SYNTHESIS.forInvitee,
    });
  },
});

// ---------------------------------------------------------------------------
// Audit log mutation for privacy filter failures
// ---------------------------------------------------------------------------

export const insertAuditLog = internalMutation({
  args: {
    caseId: v.id("cases"),
    actorUserId: v.id("users"),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLog", {
      actorUserId: args.actorUserId,
      action: "SYNTHESIS_PRIVACY_FAILURE",
      targetType: "case",
      targetId: args.caseId,
      metadata: args.metadata,
      createdAt: Date.now(),
    });
  },
});
