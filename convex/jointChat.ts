import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, mutation, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth, requirePartyToCase } from "./lib/auth";
import { validateTransition } from "./lib/stateMachine";
import { conflict } from "./lib/errors";
import { assemblePrompt, type PromptMessage } from "./lib/prompts";
import { filterResponse } from "./lib/privacyFilter";
import { isClaudeMockEnabled, getMockClaudeResponse } from "./lib/claudeMock";

export const mySynthesis = query({
  args: {
    caseId: v.id("cases"),
    viewAsRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, { caseId, viewAsRole }) => {
    const user = await requireAuth(ctx);
    await requirePartyToCase(ctx, caseId, user._id);

    const caseDoc = await ctx.db.get(caseId);

    let partyState;
    if (caseDoc?.isSolo && viewAsRole) {
      const allPartyStates = await ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect();
      partyState = allPartyStates.find((ps) => ps.role === viewAsRole);
    } else {
      partyState = await ctx.db
        .query("partyStates")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", user._id),
        )
        .unique();
    }

    if (!partyState || !partyState.synthesisText) {
      return null;
    }

    return { text: partyState.synthesisText };
  },
});

export const enterSession = mutation({
  args: {
    caseId: v.id("cases"),
    viewAsRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, { caseId, viewAsRole: _viewAsRole }) => {
    const user = await requireAuth(ctx);
    const caseDoc = await requirePartyToCase(ctx, caseId, user._id);

    const newStatus = validateTransition(caseDoc.status, "START_JOINT");

    await ctx.db.patch(caseId, {
      status: newStatus,
      updatedAt: Date.now(),
    });
  },
});

export const messages = query({
  args: {
    caseId: v.id("cases"),
    viewAsRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, { caseId }) => {
    const user = await requireAuth(ctx);
    await requirePartyToCase(ctx, caseId, user._id);

    const msgs = await ctx.db
      .query("jointMessages")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .collect();

    return msgs.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const sendUserMessage = mutation({
  args: {
    caseId: v.id("cases"),
    content: v.string(),
    viewAsRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, { caseId, content }) => {
    const user = await requireAuth(ctx);
    const caseDoc = await requirePartyToCase(ctx, caseId, user._id);

    if (caseDoc.status !== "JOINT_ACTIVE") {
      throw new ConvexError({
        code: "CONFLICT" as const,
        message: "Case is not in JOINT_ACTIVE status",
        httpStatus: 409,
      });
    }

    const messageId = await ctx.db.insert("jointMessages", {
      caseId,
      authorType: "USER",
      authorUserId: user._id,
      content,
      status: "COMPLETE",
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(
      0,
      internal.jointChat.generateCoachResponse,
      { caseId, messageId },
    );

    return messageId;
  },
});

export const proposeClosure = mutation({
  args: {
    caseId: v.id("cases"),
    summary: v.string(),
    viewAsRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, { caseId, summary, viewAsRole }) => {
    const user = await requireAuth(ctx);
    const caseDoc = await requirePartyToCase(ctx, caseId, user._id);

    if (caseDoc.status !== "JOINT_ACTIVE") {
      throw new ConvexError({
        code: "CONFLICT" as const,
        message: "Case is not in JOINT_ACTIVE status",
        httpStatus: 409,
      });
    }

    // Find caller's party state
    let callerPartyState;
    if (caseDoc.isSolo && viewAsRole) {
      const allPartyStates = await ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect();
      callerPartyState = allPartyStates.find((ps) => ps.role === viewAsRole);
    } else {
      callerPartyState = await ctx.db
        .query("partyStates")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", user._id),
        )
        .unique();
    }

    if (!callerPartyState) {
      throw new ConvexError({
        code: "NOT_FOUND" as const,
        message: "Could not find party state for caller",
        httpStatus: 404,
      });
    }
    await ctx.db.patch(callerPartyState._id, { closureProposed: true });

    await ctx.db.patch(caseId, { closureSummary: summary });
  },
});

export const confirmClosure = mutation({
  args: {
    caseId: v.id("cases"),
    viewAsRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, { caseId, viewAsRole }) => {
    const user = await requireAuth(ctx);
    const caseDoc = await requirePartyToCase(ctx, caseId, user._id);

    const allPartyStates = await ctx.db
      .query("partyStates")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .collect();

    // Determine caller's party state and the other party's state
    let callerPartyState;
    let otherPartyState;

    if (caseDoc.isSolo && viewAsRole) {
      callerPartyState = allPartyStates.find((ps) => ps.role === viewAsRole);
      otherPartyState = allPartyStates.find((ps) => ps.role !== viewAsRole);
    } else {
      callerPartyState = allPartyStates.find(
        (ps) => ps.userId === user._id,
      );
      otherPartyState = allPartyStates.find(
        (ps) => ps.userId !== user._id,
      );
    }

    if (!otherPartyState || otherPartyState.closureProposed !== true) {
      throw new ConvexError({
        code: "CONFLICT" as const,
        message: "The other party has not proposed closure",
        httpStatus: 409,
      });
    }

    // Set both parties' closureProposed and closureConfirmed
    if (!callerPartyState) {
      throw new ConvexError({
        code: "NOT_FOUND" as const,
        message: "Could not find party state for caller",
        httpStatus: 404,
      });
    }
    await ctx.db.patch(callerPartyState._id, {
      closureProposed: true,
      closureConfirmed: true,
    });
    await ctx.db.patch(otherPartyState._id, {
      closureConfirmed: true,
    });

    // Re-read actual party states for state machine validation
    const updatedPartyStates = await ctx.db
      .query("partyStates")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .collect();

    const newStatus = validateTransition(caseDoc.status, "RESOLVE", {
      partyStates: updatedPartyStates.map((ps) => ({
        closureProposed: ps.closureProposed,
        closureConfirmed: ps.closureConfirmed,
      })),
    });

    await ctx.db.patch(caseId, {
      status: newStatus,
      closedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const unilateralClose = mutation({
  args: {
    caseId: v.id("cases"),
    viewAsRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, { caseId }) => {
    const user = await requireAuth(ctx);
    const caseDoc = await requirePartyToCase(ctx, caseId, user._id);

    const newStatus = validateTransition(caseDoc.status, "CLOSE_UNRESOLVED");

    await ctx.db.patch(caseId, {
      status: newStatus,
      closedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const rejectClosure = mutation({
  args: {
    caseId: v.id("cases"),
    viewAsRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, { caseId, viewAsRole }) => {
    const user = await requireAuth(ctx);
    const caseDoc = await requirePartyToCase(ctx, caseId, user._id);

    if (caseDoc.status !== "JOINT_ACTIVE") {
      throw new ConvexError({
        code: "CONFLICT" as const,
        message: "Case is not in JOINT_ACTIVE status",
        httpStatus: 409,
      });
    }

    const allPartyStates = await ctx.db
      .query("partyStates")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .collect();

    // Find the OTHER party's state and clear their closureProposed
    let otherPartyState;
    if (caseDoc.isSolo && viewAsRole) {
      otherPartyState = allPartyStates.find((ps) => ps.role !== viewAsRole);
    } else {
      otherPartyState = allPartyStates.find(
        (ps) => ps.userId !== user._id,
      );
    }

    if (otherPartyState) {
      await ctx.db.patch(otherPartyState._id, { closureProposed: false });
    }
  },
});

// ---------------------------------------------------------------------------
// Internal queries for Coach AI action
// ---------------------------------------------------------------------------

export const getCaseForCoach = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.caseId);
  },
});

export const getPartyStatesForCoach = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("partyStates")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect();
  },
});

export const getJointMessagesForCoach = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("jointMessages")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect();
  },
});

export const getPrivateMessagesForCoach = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("privateMessages")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect();
  },
});

export const getTemplateVersionForCoach = internalQuery({
  args: { templateVersionId: v.id("templateVersions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.templateVersionId);
  },
});

// ---------------------------------------------------------------------------
// Internal mutations for Coach streaming lifecycle
// ---------------------------------------------------------------------------

export const insertCoachStreamingMessage = internalMutation({
  args: {
    caseId: v.id("cases"),
    isIntervention: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("jointMessages", {
      caseId: args.caseId,
      authorType: "COACH",
      content: "",
      status: "STREAMING",
      isIntervention: args.isIntervention ?? false,
      createdAt: Date.now(),
    });
  },
});

export const updateCoachStreamingMessage = internalMutation({
  args: {
    messageId: v.id("jointMessages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { content: args.content });
  },
});

export const finalizeCoachMessage = internalMutation({
  args: {
    messageId: v.id("jointMessages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      content: args.content,
      status: "COMPLETE" as const,
    });
  },
});

export const markCoachMessageError = internalMutation({
  args: {
    messageId: v.id("jointMessages"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { status: "ERROR" as const });
  },
});

// ---------------------------------------------------------------------------
// Coach AI action — Haiku gate + Sonnet generation with streaming
// ---------------------------------------------------------------------------

const COACH_FALLBACK_MESSAGE =
  "I'm having trouble responding to that right now. Could either of you rephrase?";

type Classification = "INFLAMMATORY" | "PROGRESS" | "QUESTION_TO_COACH" | "NORMAL_EXCHANGE";

function parseClassification(raw: string): Classification {
  const normalized = raw.trim().toUpperCase();
  if (
    normalized === "INFLAMMATORY" ||
    normalized === "PROGRESS" ||
    normalized === "QUESTION_TO_COACH" ||
    normalized === "NORMAL_EXCHANGE"
  ) {
    return normalized as Classification;
  }
  return "NORMAL_EXCHANGE";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const generateCoachResponse = internalAction({
  args: {
    caseId: v.id("cases"),
    messageId: v.id("jointMessages"),
    triggerType: v.optional(
      v.union(v.literal("message"), v.literal("mention"), v.literal("timer")),
    ),
  },
  handler: async (ctx, args) => {
    const triggerType = args.triggerType ?? "message";

    // 1. Read case and validate JOINT_ACTIVE
    const caseDoc = await ctx.runQuery(internal.jointChat.getCaseForCoach, {
      caseId: args.caseId,
    });
    if (!caseDoc || caseDoc.status !== "JOINT_ACTIVE") {
      throw conflict("Case is not in JOINT_ACTIVE status");
    }

    // 2. Read party states for synthesis texts
    const partyStates = await ctx.runQuery(
      internal.jointChat.getPartyStatesForCoach,
      { caseId: args.caseId },
    );

    // 3. Read joint messages for context and exchange counting
    const jointMessages = await ctx.runQuery(
      internal.jointChat.getJointMessagesForCoach,
      { caseId: args.caseId },
    );
    const sortedMessages = [...jointMessages].sort(
      (a, b) => a.createdAt - b.createdAt,
    );

    // 4. Read template version
    const templateVersion = await ctx.runQuery(
      internal.jointChat.getTemplateVersionForCoach,
      { templateVersionId: caseDoc.templateVersionId },
    );

    // 5. Find the last user message content for Haiku classification
    const lastUserMessage = sortedMessages
      .filter((m) => m.authorType === "USER")
      .pop();
    const lastUserContent = lastUserMessage?.content ?? "";

    // 6. Step 1 — Haiku classification
    const isMock = isClaudeMockEnabled();
    let classification: Classification;

    if (isMock) {
      // In mock mode, default to QUESTION_TO_COACH to ensure Sonnet step fires
      classification = "QUESTION_TO_COACH";
    } else {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.error("generateCoachResponse: ANTHROPIC_API_KEY not set");
        return;
      }

      let haikuAttempt = 0;
      const maxHaikuAttempts = 2;
      let haikuResult: string | null = null;

      while (haikuAttempt < maxHaikuAttempts) {
        try {
          const { default: Anthropic } = await import("@anthropic-ai/sdk");
          const client = new Anthropic({ apiKey });

          const haikuResponse = await client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 50,
            system:
              "You are a message classifier for a conflict resolution chat. Classify the user message into exactly one category. Respond with ONLY the category name, nothing else. Categories: INFLAMMATORY (hostile, insulting, threatening), PROGRESS (constructive movement, agreement, compromise), QUESTION_TO_COACH (directly asking the facilitator for help/input), NORMAL_EXCHANGE (routine conversation).",
            messages: [{ role: "user", content: lastUserContent }],
          });

          haikuResult =
            haikuResponse.content
              .filter((block) => block.type === "text")
              .map((block) => block.text)
              .join("") || "NORMAL_EXCHANGE";
          break;
        } catch (error: unknown) {
          haikuAttempt++;
          if (haikuAttempt < maxHaikuAttempts) {
            await sleep(2000);
          } else {
            console.error(
              "generateCoachResponse: Haiku classification failed after retries",
              { error: error instanceof Error ? error.message : String(error) },
            );
            return;
          }
        }
      }

      classification = parseClassification(haikuResult ?? "NORMAL_EXCHANGE");
    }

    // 7. Gate check — should the Coach respond?
    if (classification === "NORMAL_EXCHANGE" && triggerType !== "mention") {
      // Timer override: respond if 5+ consecutive user exchanges with no Coach message
      if (triggerType === "timer") {
        // Timer trigger always means threshold was met
      } else {
        // Count consecutive user messages since last Coach message
        let consecutiveUserMessages = 0;
        for (let i = sortedMessages.length - 1; i >= 0; i--) {
          if (sortedMessages[i].authorType === "COACH") break;
          if (sortedMessages[i].authorType === "USER") {
            consecutiveUserMessages++;
          }
        }
        if (consecutiveUserMessages < 5) {
          return; // Coach stays silent
        }
      }
    }

    // 8. Prepare prompt context
    const actingPartySynthesis = partyStates[0]?.synthesisText;
    const otherPartySynthesis = partyStates[1]?.synthesisText;

    const jointChatHistory: PromptMessage[] = sortedMessages
      .filter((m) => m.status === "COMPLETE")
      .map((m) => ({
        role: m.authorType === "USER" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }));

    const prompt = assemblePrompt({
      role: "COACH",
      caseId: args.caseId,
      actingUserId: lastUserMessage?.authorUserId ?? partyStates[0]?.userId ?? ("" as never),
      recentHistory: [],
      templateVersion: templateVersion
        ? {
            globalGuidance: templateVersion.globalGuidance,
            coachInstructions: templateVersion.coachInstructions,
          }
        : undefined,
      context: {
        actingPartySynthesis,
        otherPartySynthesis,
        jointChatHistory,
      },
    });

    // 9. Insert STREAMING row
    const isIntervention = classification === "INFLAMMATORY";
    const coachMessageId = await ctx.runMutation(
      internal.jointChat.insertCoachStreamingMessage,
      { caseId: args.caseId, isIntervention },
    );

    // 10. Sonnet generation with privacy filter retry loop
    const maxFilterAttempts = 3;

    for (let filterAttempt = 0; filterAttempt < maxFilterAttempts; filterAttempt++) {
      let finalContent = "";

      try {
        if (isMock) {
          // Mock failure simulation
          const failCount = parseInt(process.env.CLAUDE_MOCK_FAIL_COUNT ?? "0", 10);
          const failStatus = parseInt(process.env.CLAUDE_MOCK_FAIL_STATUS ?? "500", 10);
          if (filterAttempt === 0 && failCount > 0) {
            // Simulate API failures on first attempt
            let apiAttempt = 0;
            const maxApiAttempts = 2;
            while (apiAttempt < maxApiAttempts) {
              if (apiAttempt < failCount) {
                apiAttempt++;
                if (apiAttempt < maxApiAttempts) {
                  await sleep(failStatus === 429 ? 2000 : 2000);
                  continue;
                } else {
                  await ctx.runMutation(internal.jointChat.markCoachMessageError, {
                    messageId: coachMessageId,
                  });
                  return;
                }
              }
              break;
            }
          }

          // Mock streaming
          const mockDelayMs = parseInt(process.env.CLAUDE_MOCK_DELAY_MS ?? "100", 10);
          const mockResponse = getMockClaudeResponse("COACH");
          const chunkSize = Math.ceil(mockResponse.length / 5);
          let content = "";

          for (let i = 0; i < mockResponse.length; i += chunkSize) {
            content += mockResponse.slice(i, i + chunkSize);
            await ctx.runMutation(internal.jointChat.updateCoachStreamingMessage, {
              messageId: coachMessageId,
              content,
            });
            if (i + chunkSize < mockResponse.length) {
              await sleep(mockDelayMs);
            }
          }
          finalContent = content;
        } else {
          // Real Sonnet API call
          const { default: Anthropic } = await import("@anthropic-ai/sdk");
          const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

          let attempt = 0;
          const maxAttempts = 2;
          let succeeded = false;

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
                  try {
                    await ctx.runMutation(
                      internal.jointChat.updateCoachStreamingMessage,
                      { messageId: coachMessageId, content },
                    );
                  } catch (flushErr) {
                    console.error("generateCoachResponse: flush error", {
                      error: flushErr instanceof Error ? flushErr.message : String(flushErr),
                    });
                  }
                }
              });

              const finalMessage = await stream.finalMessage();
              finalContent = finalMessage.content
                .filter((block) => block.type === "text")
                .map((block) => block.text)
                .join("");
              succeeded = true;
              break;
            } catch (error: unknown) {
              attempt++;
              const is429 =
                error instanceof Error &&
                "status" in error &&
                (error as Record<string, unknown>).status === 429;

              if (attempt < maxAttempts) {
                const delay = is429 ? 2000 * Math.pow(2, attempt - 1) : 2000;
                await sleep(delay);
              } else {
                console.error("generateCoachResponse: Sonnet failed after retries", {
                  error: error instanceof Error ? error.message : String(error),
                });
                await ctx.runMutation(internal.jointChat.markCoachMessageError, {
                  messageId: coachMessageId,
                });
                return;
              }
            }
          }

          if (!succeeded) {
            await ctx.runMutation(internal.jointChat.markCoachMessageError, {
              messageId: coachMessageId,
            });
            return;
          }
        }

        // 11. Privacy filter — check against BOTH parties' raw private USER messages
        const privateMessages = await ctx.runQuery(
          internal.jointChat.getPrivateMessagesForCoach,
          { caseId: args.caseId },
        );
        const rawUserMessages = privateMessages
          .filter((m) => m.role === "USER")
          .map((m) => m.content);

        const filterResult = filterResponse(finalContent, rawUserMessages);

        if (filterResult.passed) {
          // Success — finalize the message
          await ctx.runMutation(internal.jointChat.finalizeCoachMessage, {
            messageId: coachMessageId,
            content: finalContent,
          });
          return;
        }

        // Filter failed — retry generation (continue loop)
        console.error("generateCoachResponse: privacy filter rejected, retrying", {
          attempt: filterAttempt + 1,
          matchedSubstring: filterResult.matchedSubstring,
        });
      } catch (error: unknown) {
        console.error("generateCoachResponse: unexpected error in generation loop", {
          error: error instanceof Error ? error.message : String(error),
        });
        await ctx.runMutation(internal.jointChat.markCoachMessageError, {
          messageId: coachMessageId,
        });
        return;
      }
    }

    // All filter attempts exhausted — emit fallback
    await ctx.runMutation(internal.jointChat.finalizeCoachMessage, {
      messageId: coachMessageId,
      content: COACH_FALLBACK_MESSAGE,
    });
  },
});
