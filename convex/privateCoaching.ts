import { v } from "convex/values";
import {
  query,
  mutation,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth, requirePartyToCase } from "./lib/auth";
import { conflict } from "./lib/errors";
import { assemblePrompt, type PromptMessage } from "./lib/prompts";
import { isClaudeMockEnabled, getMockClaudeResponse } from "./lib/claudeMock";

export const myMessages = query({
  args: {
    caseId: v.id("cases"),
    partyRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, { caseId, partyRole }) => {
    const user = await requireAuth(ctx);

    let messages;
    if (partyRole) {
      messages = await ctx.db
        .query("privateMessages")
        .withIndex("by_case_user_role", (q) =>
          q
            .eq("caseId", caseId)
            .eq("userId", user._id)
            .eq("partyRole", partyRole),
        )
        .collect();
    } else {
      messages = await ctx.db
        .query("privateMessages")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", user._id),
        )
        .collect();
    }

    messages.sort((a, b) => a.createdAt - b.createdAt);
    return messages;
  },
});

export const sendUserMessage = mutation({
  args: {
    caseId: v.id("cases"),
    content: v.string(),
    partyRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const caseDoc = await requirePartyToCase(ctx, args.caseId, user._id);

    if (
      caseDoc.status !== "DRAFT_PRIVATE_COACHING" &&
      caseDoc.status !== "BOTH_PRIVATE_COACHING"
    ) {
      throw conflict("Case is not in private coaching phase");
    }

    const messageId = await ctx.db.insert("privateMessages", {
      caseId: args.caseId,
      userId: user._id,
      role: "USER",
      content: args.content,
      status: "COMPLETE",
      createdAt: Date.now(),
      ...(args.partyRole ? { partyRole: args.partyRole } : {}),
    });

    await ctx.scheduler.runAfter(
      0,
      internal.privateCoaching.generateAIResponse,
      {
        caseId: args.caseId,
        userId: user._id,
        ...(args.partyRole ? { partyRole: args.partyRole } : {}),
      },
    );

    return messageId;
  },
});

export const markComplete = mutation({
  args: {
    caseId: v.id("cases"),
    viewAsRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const caseDoc = await requirePartyToCase(ctx, args.caseId, user._id);

    let callerPartyState;
    if (caseDoc.isSolo && args.viewAsRole) {
      const allForUser = await ctx.db
        .query("partyStates")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", args.caseId).eq("userId", user._id),
        )
        .collect();
      callerPartyState = allForUser.find((ps) => ps.role === args.viewAsRole);
    } else {
      callerPartyState = await ctx.db
        .query("partyStates")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", args.caseId).eq("userId", user._id),
        )
        .unique();
    }

    if (!callerPartyState) {
      throw conflict("Party state not found");
    }

    if (callerPartyState.privateCoachingCompletedAt) {
      return { synthesisScheduled: false };
    }

    await ctx.db.patch(callerPartyState._id, {
      privateCoachingCompletedAt: Date.now(),
    });

    const allPartyStates = await ctx.db
      .query("partyStates")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect();

    const bothComplete = allPartyStates.every(
      (ps) => ps.privateCoachingCompletedAt != null,
    );

    if (bothComplete) {
      await ctx.scheduler.runAfter(0, internal.synthesis.generate, {
        caseId: args.caseId,
      });
      return { synthesisScheduled: true };
    }

    return { synthesisScheduled: false };
  },
});

export const retryLastAIResponse = mutation({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const caseDoc = await requirePartyToCase(ctx, args.caseId, user._id);

    if (
      caseDoc.status !== "DRAFT_PRIVATE_COACHING" &&
      caseDoc.status !== "BOTH_PRIVATE_COACHING"
    ) {
      throw conflict("Case is not in private coaching phase");
    }

    // Find the last AI message with ERROR status for this user
    const messages = await ctx.db
      .query("privateMessages")
      .withIndex("by_case_and_user", (q) =>
        q.eq("caseId", args.caseId).eq("userId", user._id),
      )
      .collect();
    const errorMsg = messages
      .filter((m) => m.role === "AI" && m.status === "ERROR")
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!errorMsg) throw conflict("No error message to retry");
    const errorPartyRole = errorMsg.partyRole;
    // Delete the error row
    await ctx.db.delete(errorMsg._id);
    // Schedule new AI response
    await ctx.scheduler.runAfter(
      0,
      internal.privateCoaching.generateAIResponse,
      {
        caseId: args.caseId,
        userId: user._id,
        ...(errorPartyRole ? { partyRole: errorPartyRole } : {}),
      },
    );
  },
});

// ---------------------------------------------------------------------------
// Internal mutations for streaming writes
// ---------------------------------------------------------------------------

export const insertStreamingMessage = internalMutation({
  args: {
    caseId: v.id("cases"),
    userId: v.id("users"),
    partyRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("privateMessages", {
      caseId: args.caseId,
      userId: args.userId,
      role: "AI",
      content: "",
      status: "STREAMING",
      createdAt: Date.now(),
      ...(args.partyRole ? { partyRole: args.partyRole } : {}),
    });
  },
});

export const updateStreamingMessage = internalMutation({
  args: {
    messageId: v.id("privateMessages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { content: args.content });
  },
});

export const finalizeStreamingMessage = internalMutation({
  args: {
    messageId: v.id("privateMessages"),
    content: v.string(),
    tokens: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      content: args.content,
      status: "COMPLETE",
      tokens: args.tokens,
    });
  },
});

export const markMessageError = internalMutation({
  args: {
    messageId: v.id("privateMessages"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { status: "ERROR" });
  },
});

// ---------------------------------------------------------------------------
// Internal queries for reading acting user's messages and party state
// ---------------------------------------------------------------------------

export const getPrivateMessagesForUser = internalQuery({
  args: {
    caseId: v.id("cases"),
    userId: v.id("users"),
    partyRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, args) => {
    let messages;
    if (args.partyRole) {
      messages = await ctx.db
        .query("privateMessages")
        .withIndex("by_case_user_role", (q) =>
          q
            .eq("caseId", args.caseId)
            .eq("userId", args.userId)
            .eq("partyRole", args.partyRole),
        )
        .collect();
    } else {
      messages = await ctx.db
        .query("privateMessages")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", args.caseId).eq("userId", args.userId),
        )
        .collect();
    }

    return messages;
  },
});

export const getPartyState = internalQuery({
  args: {
    caseId: v.id("cases"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("partyStates")
      .withIndex("by_case_and_user", (q) =>
        q.eq("caseId", args.caseId).eq("userId", args.userId),
      )
      .unique();
  },
});

// ---------------------------------------------------------------------------
// Main AI action
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const generateAIResponse = internalAction({
  args: {
    caseId: v.id("cases"),
    userId: v.id("users"),
    partyRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, args) => {
    // 1. Read party state for form fields
    const partyState = await ctx.runQuery(
      internal.privateCoaching.getPartyState,
      { caseId: args.caseId, userId: args.userId },
    );

    const formFields = partyState
      ? {
          mainTopic: partyState.mainTopic,
          description: partyState.description,
          desiredOutcome: partyState.desiredOutcome,
        }
      : undefined;

    // 2. Read acting user's prior messages (privacy: by_case_user_role when partyRole set, else by_case_and_user)
    const allMessages = await ctx.runQuery(
      internal.privateCoaching.getPrivateMessagesForUser,
      {
        caseId: args.caseId,
        userId: args.userId,
        ...(args.partyRole ? { partyRole: args.partyRole } : {}),
      },
    );

    const recentHistory: PromptMessage[] = allMessages
      .filter((m) => m.status === "COMPLETE")
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((m) => ({
        role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }));

    // 3. Assemble prompt — PRIVATE_COACH role, no templateVersion
    const prompt = assemblePrompt({
      role: "PRIVATE_COACH",
      caseId: args.caseId,
      actingUserId: args.userId,
      recentHistory,
      context: {
        formFields,
      },
    });

    // 4. Insert STREAMING row before API call
    const messageId = await ctx.runMutation(
      internal.privateCoaching.insertStreamingMessage,
      {
        caseId: args.caseId,
        userId: args.userId,
        ...(args.partyRole ? { partyRole: args.partyRole } : {}),
      },
    );

    // 5. Unified retry loop for both mock and real API paths
    const isMock = isClaudeMockEnabled();

    if (!isMock) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.error(
          "generateAIResponse: ANTHROPIC_API_KEY is not set — cannot call Claude API",
          { caseId: args.caseId, userId: args.userId, messageId },
        );
        await ctx.runMutation(internal.privateCoaching.markMessageError, {
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

          // Mock streaming — read delay at call time so env var changes
          // between invocations are respected (unlike the module-level const)
          const mockDelayMs = parseInt(
            process.env.CLAUDE_MOCK_DELAY_MS ?? "100",
            10,
          );
          const mockResponse = getMockClaudeResponse("PRIVATE_COACH");
          const chunkSize = Math.ceil(mockResponse.length / 5);
          let content = "";

          for (let i = 0; i < mockResponse.length; i += chunkSize) {
            content += mockResponse.slice(i, i + chunkSize);
            await ctx.runMutation(
              internal.privateCoaching.updateStreamingMessage,
              { messageId, content },
            );
            if (i + chunkSize < mockResponse.length) {
              await sleep(mockDelayMs);
            }
          }

          const tokenCount = mockResponse.split(/\s+/).length;
          await ctx.runMutation(
            internal.privateCoaching.finalizeStreamingMessage,
            { messageId, content, tokens: tokenCount },
          );
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
                  internal.privateCoaching.updateStreamingMessage,
                  { messageId, content },
                );
              } catch (flushErr) {
                console.error(
                  "generateAIResponse: failed to flush streaming update",
                  {
                    messageId,
                    error:
                      flushErr instanceof Error
                        ? flushErr.message
                        : String(flushErr),
                  },
                );
              }
            }
          });

          const finalMessage = await stream.finalMessage();

          // Final flush
          content = finalMessage.content
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("");

          const totalTokens =
            (finalMessage.usage?.input_tokens ?? 0) +
            (finalMessage.usage?.output_tokens ?? 0);

          await ctx.runMutation(
            internal.privateCoaching.finalizeStreamingMessage,
            { messageId, content, tokens: totalTokens },
          );
          return;
        }
      } catch (error: unknown) {
        attempt++;
        const is429 =
          error instanceof Error &&
          "status" in error &&
          (error as Record<string, unknown>).status === 429;

        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const statusCode =
          error instanceof Error && "status" in error
            ? (error as Record<string, unknown>).status
            : undefined;

        if (attempt < maxAttempts) {
          const delay = is429 ? 2000 * Math.pow(2, attempt - 1) : 2000;
          console.error(
            `generateAIResponse: attempt ${attempt} failed (status=${statusCode ?? "unknown"}), retrying in ${delay}ms`,
            { caseId: args.caseId, userId: args.userId, error: errorMessage },
          );
          await sleep(delay);
        } else {
          console.error(
            `generateAIResponse: all ${maxAttempts} attempts failed, marking message as ERROR`,
            {
              caseId: args.caseId,
              userId: args.userId,
              messageId,
              error: errorMessage,
            },
          );
          await ctx.runMutation(internal.privateCoaching.markMessageError, {
            messageId,
          });
          return;
        }
      }
    }
  },
});
