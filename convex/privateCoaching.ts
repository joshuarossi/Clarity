import { v } from "convex/values";
import { query, mutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth, requirePartyToCase } from "./lib/auth";
import { conflict } from "./lib/errors";

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

export const generateAIResponse = internalAction({
  args: {
    caseId: v.id("cases"),
    userId: v.id("users"),
  },
  handler: async (_ctx, _args) => {
    // Stub — AI response generation is a separate ticket.
  },
});
