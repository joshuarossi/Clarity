import { v } from "convex/values";
import { query, mutation, internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth, requirePartyToCase } from "./lib/auth";
import { conflict } from "./lib/errors";
import {
  assemblePrompt,
  type PromptMessage,
} from "./lib/prompts";
import {
  isClaudeMockEnabled,
  getMockClaudeResponse,
  MOCK_DELAY_MS,
} from "./lib/claudeMock";

export const myMessages = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const user = await requireAuth(ctx);

    const messages = await ctx.db
      .query("privateMessages")
      .withIndex("by_case_and_user", (q) =>
        q.eq("caseId", caseId).eq("userId", user._id),
      )
      .collect();

    messages.sort((a, b) => a.createdAt - b.createdAt);
    return messages;
  },
});

export const sendUserMessage = mutation({
  args: {
    caseId: v.id("cases"),
    content: v.string(),
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
    });

    await ctx.scheduler.runAfter(
      0,
      internal.privateCoaching.generateAIResponse,
      { caseId: args.caseId, userId: user._id },
    );

    return messageId;
  },
});

export const markComplete = mutation({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requirePartyToCase(ctx, args.caseId, user._id);

    const callerPartyState = await ctx.db
      .query("partyStates")
      .withIndex("by_case_and_user", (q) =>
        q.eq("caseId", args.caseId).eq("userId", user._id),
      )
      .unique();

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

// ---------------------------------------------------------------------------
// Internal mutations for streaming writes
// ---------------------------------------------------------------------------

export const insertStreamingMessage = internalMutation({
  args: {
    caseId: v.id("cases"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("privateMessages", {
      caseId: args.caseId,
      userId: args.userId,
      role: "AI",
      content: "",
      status: "STREAMING",
      createdAt: Date.now(),
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
// Internal query for reading acting user's messages
// ---------------------------------------------------------------------------

export const getPrivateMessagesForUser = internalMutation({
  args: {
    caseId: v.id("cases"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("privateMessages")
      .withIndex("by_case_and_user", (q) =>
        q.eq("caseId", args.caseId).eq("userId", args.userId),
      )
      .collect();
  },
});

export const getPartyState = internalMutation({
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
  },
  handler: async (ctx, args) => {
    // 1. Read party state for form fields
    const partyState = await ctx.runMutation(
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

    // 2. Read acting user's prior messages (privacy: only by_case_and_user)
    const allMessages = await ctx.runMutation(
      internal.privateCoaching.getPrivateMessagesForUser,
      { caseId: args.caseId, userId: args.userId },
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
        actingPartyPrivateMessages: recentHistory,
      },
    });

    // 4. Insert STREAMING row before API call
    const messageId = await ctx.runMutation(
      internal.privateCoaching.insertStreamingMessage,
      { caseId: args.caseId, userId: args.userId },
    );

    // 5. Mock mode
    if (isClaudeMockEnabled()) {
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
          await sleep(MOCK_DELAY_MS);
        }
      }

      const tokenCount = mockResponse.split(/\s+/).length;
      await ctx.runMutation(
        internal.privateCoaching.finalizeStreamingMessage,
        { messageId, content, tokens: tokenCount },
      );
      return;
    }

    // 6. Real API call
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.privateCoaching.markMessageError, {
        messageId,
      });
      return;
    }

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    let attempt = 0;
    const maxAttempts = 2;

    while (attempt < maxAttempts) {
      try {
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
            await ctx.runMutation(
              internal.privateCoaching.updateStreamingMessage,
              { messageId, content },
            );
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
      } catch (error: unknown) {
        attempt++;
        const is429 =
          error instanceof Error &&
          "status" in error &&
          (error as { status: number }).status === 429;

        if (attempt < maxAttempts) {
          const delay = is429 ? 2000 * Math.pow(2, attempt - 1) : 2000;
          await sleep(delay);
        } else {
          await ctx.runMutation(internal.privateCoaching.markMessageError, {
            messageId,
          });
          return;
        }
      }
    }
  },
});
