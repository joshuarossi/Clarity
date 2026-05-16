import { v } from "convex/values";
import { query, mutation, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth, requirePartyToCase } from "./lib/auth";
import { conflict, forbidden, notFound } from "./lib/errors";
import {
  assemblePrompt,
  type PromptMessage,
} from "./lib/prompts";
import {
  isClaudeMockEnabled,
  getMockClaudeResponse,
} from "./lib/claudeMock";

// ---------------------------------------------------------------------------
// Public queries and mutations (WOR-127 — preserved as-is)
// ---------------------------------------------------------------------------

export const session = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const user = await requireAuth(ctx);
    await requirePartyToCase(ctx, caseId, user._id);

    const sessions = await ctx.db
      .query("draftSessions")
      .withIndex("by_case_and_user", (q) =>
        q.eq("caseId", caseId).eq("userId", user._id),
      )
      .collect();

    const activeSession = sessions.find((s) => s.status === "ACTIVE");
    if (!activeSession) {
      return null;
    }

    const messages = await ctx.db
      .query("draftMessages")
      .withIndex("by_draft_session", (q) =>
        q.eq("draftSessionId", activeSession._id),
      )
      .collect();

    return { session: activeSession, messages };
  },
});

export const startSession = mutation({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const user = await requireAuth(ctx);
    await requirePartyToCase(ctx, caseId, user._id);

    // Check for existing ACTIVE session
    const existing = await ctx.db
      .query("draftSessions")
      .withIndex("by_case_and_user", (q) =>
        q.eq("caseId", caseId).eq("userId", user._id),
      )
      .collect();

    const activeSession = existing.find((s) => s.status === "ACTIVE");
    if (activeSession) {
      throw conflict("An active draft session already exists for this case");
    }

    const sessionId = await ctx.db.insert("draftSessions", {
      caseId,
      userId: user._id,
      status: "ACTIVE",
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.draftCoach.generateResponse, {
      sessionId,
      userId: user._id,
    });

    return sessionId;
  },
});

export const sendMessage = mutation({
  args: { sessionId: v.id("draftSessions"), content: v.string() },
  handler: async (ctx, { sessionId, content }) => {
    const user = await requireAuth(ctx);

    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw notFound("Draft session not found");
    }

    await requirePartyToCase(ctx, session.caseId, user._id);

    if (session.userId !== user._id) {
      throw forbidden("You do not own this draft session");
    }

    if (session.status !== "ACTIVE") {
      throw conflict("Draft session is not active");
    }

    const messageId = await ctx.db.insert("draftMessages", {
      draftSessionId: sessionId,
      role: "USER",
      content,
      status: "COMPLETE",
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.draftCoach.generateResponse, {
      sessionId,
      userId: user._id,
    });

    return messageId;
  },
});

export const sendFinalDraft = mutation({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, { sessionId }) => {
    const user = await requireAuth(ctx);

    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw notFound("Draft session not found");
    }

    await requirePartyToCase(ctx, session.caseId, user._id);

    if (session.userId !== user._id) {
      throw forbidden("You do not own this draft session");
    }

    if (session.status !== "ACTIVE") {
      throw conflict("Draft session is not active");
    }

    if (!session.finalDraft) {
      throw conflict("No final draft available — the Coach has not produced a draft yet");
    }

    // Insert directly into jointMessages (mutations cannot call other mutations)
    const messageId = await ctx.db.insert("jointMessages", {
      caseId: session.caseId,
      authorType: "USER",
      authorUserId: session.userId,
      content: session.finalDraft,
      status: "COMPLETE",
      createdAt: Date.now(),
    });

    // Schedule coach response in joint chat
    await ctx.scheduler.runAfter(
      0,
      internal.jointChat.generateCoachResponse,
      { caseId: session.caseId, messageId },
    );

    // Mark session as SENT
    await ctx.db.patch(sessionId, {
      status: "SENT",
      completedAt: Date.now(),
    });

    return messageId;
  },
});

export const discardSession = mutation({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, { sessionId }) => {
    const user = await requireAuth(ctx);

    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw notFound("Draft session not found");
    }

    await requirePartyToCase(ctx, session.caseId, user._id);

    if (session.userId !== user._id) {
      throw forbidden("You do not own this draft session");
    }

    if (session.status !== "ACTIVE") {
      throw conflict("Draft session is not active");
    }

    await ctx.db.patch(sessionId, {
      status: "DISCARDED",
      completedAt: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// Internal queries for generateResponse
// ---------------------------------------------------------------------------

export const getSessionForGeneration = internalQuery({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;

    const messages = await ctx.db
      .query("draftMessages")
      .withIndex("by_draft_session", (q) =>
        q.eq("draftSessionId", sessionId),
      )
      .collect();

    return { session, messages };
  },
});

export const getJointMessagesForDraftCoach = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    return await ctx.db
      .query("jointMessages")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .collect();
  },
});

export const getPartyStateForDraftCoach = internalQuery({
  args: { caseId: v.id("cases"), userId: v.id("users") },
  handler: async (ctx, { caseId, userId }) => {
    return await ctx.db
      .query("partyStates")
      .withIndex("by_case_and_user", (q) =>
        q.eq("caseId", caseId).eq("userId", userId),
      )
      .unique();
  },
});

export const getCaseForDraftCoach = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    return await ctx.db.get(caseId);
  },
});

export const getTemplateVersionForDraftCoach = internalQuery({
  args: { templateVersionId: v.id("templateVersions") },
  handler: async (ctx, { templateVersionId }) => {
    return await ctx.db.get(templateVersionId);
  },
});

// ---------------------------------------------------------------------------
// Internal mutations for streaming writes
// ---------------------------------------------------------------------------

export const insertStreamingDraftMessage = internalMutation({
  args: { draftSessionId: v.id("draftSessions") },
  handler: async (ctx, { draftSessionId }) => {
    return await ctx.db.insert("draftMessages", {
      draftSessionId,
      role: "AI",
      content: "",
      status: "STREAMING",
      createdAt: Date.now(),
    });
  },
});

export const updateStreamingDraftMessage = internalMutation({
  args: { messageId: v.id("draftMessages"), content: v.string() },
  handler: async (ctx, { messageId, content }) => {
    await ctx.db.patch(messageId, { content });
  },
});

export const finalizeStreamingDraftMessage = internalMutation({
  args: { messageId: v.id("draftMessages"), content: v.string(), tokens: v.number() },
  handler: async (ctx, { messageId, content, tokens }) => {
    await ctx.db.patch(messageId, {
      content,
      status: "COMPLETE",
    });
    // Token count logged for cost tracking (schema doesn't have tokens field on draftMessages)
    console.log(`draftCoach: finalized message ${messageId} with ${tokens} tokens`);
  },
});

export const markDraftMessageError = internalMutation({
  args: { messageId: v.id("draftMessages") },
  handler: async (ctx, { messageId }) => {
    await ctx.db.patch(messageId, { status: "ERROR" });
  },
});

export const setSessionFinalDraft = internalMutation({
  args: { sessionId: v.id("draftSessions"), finalDraft: v.string() },
  handler: async (ctx, { sessionId, finalDraft }) => {
    await ctx.db.patch(sessionId, { finalDraft });
  },
});

// ---------------------------------------------------------------------------
// Retry mutation (public)
// ---------------------------------------------------------------------------

export const retryLastDraftAIResponse = mutation({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, { sessionId }) => {
    const user = await requireAuth(ctx);

    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw notFound("Draft session not found");
    }

    await requirePartyToCase(ctx, session.caseId, user._id);

    if (session.userId !== user._id) {
      throw forbidden("You do not own this draft session");
    }

    if (session.status !== "ACTIVE") {
      throw conflict("Draft session is not active");
    }

    // Find the last AI message with ERROR status
    const messages = await ctx.db
      .query("draftMessages")
      .withIndex("by_draft_session", (q) =>
        q.eq("draftSessionId", sessionId),
      )
      .collect();

    const errorMsg = messages
      .filter((m) => m.role === "AI" && m.status === "ERROR")
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    if (!errorMsg) {
      throw conflict("No error message to retry");
    }

    // Delete the error row
    await ctx.db.delete(errorMsg._id);

    // Re-schedule generation
    await ctx.scheduler.runAfter(0, internal.draftCoach.generateResponse, {
      sessionId,
      userId: user._id,
    });
  },
});

// ---------------------------------------------------------------------------
// Readiness detection
// ---------------------------------------------------------------------------

const READINESS_SIGNALS = [
  "i'm ready",
  "draft it",
  "write the message",
  "looks good, write it",
];

const CANONICAL_BUTTON_MESSAGE = "Generate Draft";

function isReadinessSignal(content: string): boolean {
  const normalized = content.toLowerCase().trim();
  if (READINESS_SIGNALS.some((signal) => normalized.includes(signal))) {
    return true;
  }
  // Exact match for the canonical button message
  if (content.trim() === CANONICAL_BUTTON_MESSAGE) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Draft extraction from AI response
// ---------------------------------------------------------------------------

function extractFinalDraft(responseText: string): string | null {
  // Look for structured { "draft": "..." } JSON block in the response
  const jsonMatch = responseText.match(/\{\s*"draft"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/);
  if (jsonMatch) {
    try {
      // Parse the full JSON to handle escape sequences properly
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.draft === "string" && parsed.draft.length > 0) {
        return parsed.draft;
      }
    } catch {
      // Fall through to null
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main AI action
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const generateResponse = internalAction({
  args: { sessionId: v.id("draftSessions"), userId: v.id("users") },
  handler: async (ctx, args) => {
    // 1. Read session and messages
    const sessionData = await ctx.runQuery(
      internal.draftCoach.getSessionForGeneration,
      { sessionId: args.sessionId },
    );

    if (!sessionData || sessionData.session.status !== "ACTIVE") {
      return;
    }

    const { session, messages: draftMessages } = sessionData;

    // 2. Read case for templateVersionId
    const caseDoc = await ctx.runQuery(
      internal.draftCoach.getCaseForDraftCoach,
      { caseId: session.caseId },
    );

    // 3. Read template version for draftCoachInstructions
    let templateVersion: { globalGuidance: string; draftCoachInstructions?: string } | undefined;
    if (caseDoc?.templateVersionId) {
      const tv = await ctx.runQuery(
        internal.draftCoach.getTemplateVersionForDraftCoach,
        { templateVersionId: caseDoc.templateVersionId },
      );
      if (tv) {
        templateVersion = {
          globalGuidance: tv.globalGuidance,
          draftCoachInstructions: tv.draftCoachInstructions,
        };
      }
    }

    // 4. Read acting user's partyState for synthesis
    const partyState = await ctx.runQuery(
      internal.draftCoach.getPartyStateForDraftCoach,
      { caseId: session.caseId, userId: args.userId },
    );

    // 5. Read joint chat messages
    const jointMessages = await ctx.runQuery(
      internal.draftCoach.getJointMessagesForDraftCoach,
      { caseId: session.caseId },
    );

    // 6. Readiness detection — check latest USER draftMessage
    const userMessages = draftMessages
      .filter((m) => m.role === "USER" && m.status === "COMPLETE")
      .sort((a, b) => a.createdAt - b.createdAt);

    const latestUserMessage = userMessages[userMessages.length - 1];
    const isReadyForDraft = latestUserMessage
      ? isReadinessSignal(latestUserMessage.content)
      : false;

    // 7. Build prompt context
    const jointChatHistory: PromptMessage[] = jointMessages
      .filter((m) => m.status === "COMPLETE")
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((m) => ({
        role: m.authorType === "USER" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }));

    const recentHistory: PromptMessage[] = draftMessages
      .filter((m) => m.status === "COMPLETE")
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((m) => ({
        role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }));

    // If readiness detected, append instruction for structured draft output
    if (isReadyForDraft) {
      recentHistory.push({
        role: "user",
        content: '[System: The user has signaled readiness for a final draft. Respond with a JSON block containing the polished draft message: { "draft": "your polished message here" }. Include only the draft in the JSON block.]',
      });
    }

    const prompt = assemblePrompt({
      role: "DRAFT_COACH",
      caseId: session.caseId,
      actingUserId: args.userId,
      recentHistory,
      templateVersion,
      context: {
        actingPartySynthesis: partyState?.synthesisText,
        jointChatHistory,
      },
    });

    // 8. Insert STREAMING row before API call
    const messageId = await ctx.runMutation(
      internal.draftCoach.insertStreamingDraftMessage,
      { draftSessionId: args.sessionId },
    );

    // 9. Call Claude with streaming (or mock)
    const isMock = isClaudeMockEnabled();

    if (!isMock) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.error(
          "draftCoach.generateResponse: ANTHROPIC_API_KEY is not set",
          { sessionId: args.sessionId, userId: args.userId, messageId },
        );
        await ctx.runMutation(internal.draftCoach.markDraftMessageError, {
          messageId,
        });
        return;
      }
    }

    let attempt = 0;
    const maxAttempts = 2;

    while (attempt < maxAttempts) {
      try {
        if (isMock) {
          // Check mock failure simulation
          const failCount = parseInt(
            process.env.CLAUDE_MOCK_FAIL_COUNT ?? "0",
            10,
          );
          const failStatus = parseInt(
            process.env.CLAUDE_MOCK_FAIL_STATUS ?? "500",
            10,
          );
          if (attempt < failCount) {
            const err = new Error(
              failStatus === 429 ? "Rate limited" : "Mock API error",
            );
            (err as unknown as Record<string, unknown>).status = failStatus;
            throw err;
          }

          // Mock streaming
          const mockDelayMs = parseInt(
            process.env.CLAUDE_MOCK_DELAY_MS ?? "100",
            10,
          );
          let mockResponse = getMockClaudeResponse("DRAFT_COACH");
          if (isReadyForDraft) {
            // Simulate structured draft output that real Claude would produce
            // when given the readiness system instruction
            const mockDraft = "I'd like to talk about how we handle decisions that affect both of us. I've noticed that sometimes I feel left out of the process, and I think establishing a simple check-in habit could help us both feel more included. Would you be open to discussing what that might look like?";
            mockResponse = `Here is your polished draft message:\n\n{ "draft": ${JSON.stringify(mockDraft)} }`;
          }
          const chunkSize = Math.ceil(mockResponse.length / 5);
          let content = "";

          for (let i = 0; i < mockResponse.length; i += chunkSize) {
            content += mockResponse.slice(i, i + chunkSize);
            await ctx.runMutation(
              internal.draftCoach.updateStreamingDraftMessage,
              { messageId, content },
            );
            if (i + chunkSize < mockResponse.length) {
              await sleep(mockDelayMs);
            }
          }

          const tokenCount = mockResponse.split(/\s+/).length;
          await ctx.runMutation(
            internal.draftCoach.finalizeStreamingDraftMessage,
            { messageId, content, tokens: tokenCount },
          );

          // 10. If readiness detected, extract and persist finalDraft
          if (isReadyForDraft) {
            const draft = extractFinalDraft(content);
            if (draft) {
              await ctx.runMutation(
                internal.draftCoach.setSessionFinalDraft,
                { sessionId: args.sessionId, finalDraft: draft },
              );
            }
          }

          return;
        } else {
          // Real API call
          const { default: Anthropic } = await import("@anthropic-ai/sdk");
          const client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
          });

          const stream = client.messages.stream({
            model: "claude-sonnet-4-5",
            max_tokens: 4096,
            system: prompt.system,
            messages: prompt.messages,
          });

          let content = "";
          let lastFlush = Date.now();

          stream.on("text", async (text) => {
            content += text;
            const now = Date.now();
            if (now - lastFlush >= 50) {
              lastFlush = now;
              try {
                await ctx.runMutation(
                  internal.draftCoach.updateStreamingDraftMessage,
                  { messageId, content },
                );
              } catch (flushErr) {
                console.error(
                  "draftCoach.generateResponse: failed to flush streaming update",
                  { messageId, error: flushErr instanceof Error ? flushErr.message : String(flushErr) },
                );
              }
            }
          });

          const finalMessage = await stream.finalMessage();

          // Final content from completed message
          content = finalMessage.content
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("");

          const totalTokens =
            (finalMessage.usage?.input_tokens ?? 0) +
            (finalMessage.usage?.output_tokens ?? 0);

          await ctx.runMutation(
            internal.draftCoach.finalizeStreamingDraftMessage,
            { messageId, content, tokens: totalTokens },
          );

          // 10. If readiness detected, extract and persist finalDraft
          if (isReadyForDraft) {
            const draft = extractFinalDraft(content);
            if (draft) {
              await ctx.runMutation(
                internal.draftCoach.setSessionFinalDraft,
                { sessionId: args.sessionId, finalDraft: draft },
              );
            }
          }

          return;
        }
      } catch (error: unknown) {
        attempt++;
        const is429 =
          error instanceof Error &&
          "status" in error &&
          (error as Record<string, unknown>).status === 429;

        const errorMessage = error instanceof Error ? error.message : String(error);
        const statusCode = error instanceof Error && "status" in error
          ? (error as Record<string, unknown>).status
          : undefined;

        if (attempt < maxAttempts) {
          const delay = is429 ? 2000 * Math.pow(2, attempt - 1) : 2000;
          console.error(
            `draftCoach.generateResponse: attempt ${attempt} failed (status=${statusCode ?? "unknown"}), retrying in ${delay}ms`,
            { sessionId: args.sessionId, userId: args.userId, error: errorMessage },
          );
          await sleep(delay);
        } else {
          console.error(
            `draftCoach.generateResponse: all ${maxAttempts} attempts failed, marking message as ERROR`,
            { sessionId: args.sessionId, userId: args.userId, messageId, error: errorMessage },
          );
          await ctx.runMutation(internal.draftCoach.markDraftMessageError, {
            messageId,
          });
          return;
        }
      }
    }
  },
});
